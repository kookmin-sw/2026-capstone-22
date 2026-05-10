"""문제은행 서비스: PDF/이미지 → 텍스트 추출 → 정제 → 블록 분리 → Gemini 분류 → DB 저장"""

import json
import logging
import os
from datetime import datetime, timezone

from google.genai import types
from sqlalchemy.orm import Session

from ..models.exam_paper import ExamPaper, PaperStatus, QuestionItem, ReviewStatus
from ..schemas.question_bank import AnalysisResult
from .gemini_client import _get_genai_client, _get_platform_setting
from .question_split_service import split_questions
from .text_cleaning_service import clean_text
from .text_extraction_service import extract_text_hybrid

logger = logging.getLogger(__name__)

# ── 중등 영어 영역 목록 ───────────────────────────────────────────────────────
VALID_AREAS = {"문법", "어휘", "독해", "듣기", "서술형"}

# ── 프롬프트 템플릿 ───────────────────────────────────────────────────────────

_SHARED_PROMPT_RULES = """
[STEP 1] area 판단 기준 — 반드시 아래 순서로 확인 후 결정:

① 듣기: 문항에 "듣기", "LISTEN", 대본 안내 등 음성 관련 표기가 있으면 무조건 듣기.
② 서술형: 학생이 영어 문장을 직접 쓰는 주관식 (한국어→영작, 단어 배열·조건 영작 포함).
③ 문법: 동사 어형·시제·태·준동사·관계사 등 문법 규칙 또는 문장 구조 자체를 테스트.
   → 빈칸에 들어갈 어형/형태가 정해져 있어 문법 지식 없이 풀 수 없는 문제.
④ 어휘: 단어 뜻·숙어·동의어·반의어·어휘 자체를 직접 묻거나, 선택지가 모두 단어/표현 단위인 문제.
   → 지문 전체를 읽지 않아도 빈칸 주변 몇 문장만으로 답이 결정되는 경우.
⑤ 독해: 지문 또는 대화 전체의 흐름·논리·맥락을 파악해야 풀 수 있는 문제.
   → 단어 뜻만으로는 부족하고 글 전체를 읽어야 답이 도출되는 경우.

빈칸 문제 3-way 판단:
- 문법: "빈칸에 알맞은 형태" / 어형 변화·to부정사·분사 등 → area=문법
- 어휘: 선택지가 단어/숙어이고 단어 의미 자체로 답 결정 → area=어휘
- 독해: 선택지가 절·구이거나 지문 논리·흐름을 따라야 답 도출 → area=독해

대화문 빈칸: 흐름·상황 파악 필요 → area=독해 / 단어 의미 직접 묻기 → area=어휘

[STEP 2] difficulty — 📌에 명시된 grade 기준 상대 난이도로 판단 (절대 기준 금지)
grade 없음 → 중등 평균 (중2~중3) 기준 적용

■ 문법 — 하: 단일 개념 직접 확인 / 중: 문맥에서 1개 개념 적용 / 상: 복합 개념·함정·예외 규칙
■ 어휘 — 하: 직접 뜻 확인 / 중: 문맥 어휘 판단 / 상: 추론형·다의어 함정·문맥+추론
■ 독해 — 하: 세부 정보 직접 찾기 / 중: 흐름/맥락 1단계 연결 / 상: 전체 흐름 판단·복합 추론
■ 듣기 — 하: 숫자/시간/장소 직접 듣기 / 중: 의도·이유 1단계 파악 / 상: 심경·복합 추론
■ 서술형 — 하 없음(최소 중) / 중: 단순 완성·짧은 변환 / 상: 조건 여러 개·복합 적용

reason 작성 규칙 (반드시 준수):
- 자연어 1문장, 40자 이내, 난이도 판단 핵심 이유만
형식: [학년 또는 "grade 없음, 중등 평균"] 기준, [판단 근거]이므로 [하/중/상]
예시: 중3 기준, 글 전체 흐름 추론 필요하므로 상

주의:
- choices는 없으면 null
- is_listening은 area가 "듣기"일 때만 true
- answer 규칙:
  · 객관식(choices 있음): 정답 선택지 번호 기호만 (예: "③"), 반드시 10자 이하
  · 서술형(choices 없음): null
  · 듣기(is_listening=true): null (음성 없이 판단 불가)
- 모든 문항을 빠짐없이 포함할 것
- JSON 외 다른 텍스트 출력 금지
""".strip()

_JSON_SCHEMA = """
{{
  "questions": [
    {{
      "number": <문항 번호 정수>,
      "area": "<문법 | 어휘 | 독해 | 듣기 | 서술형>",
      "difficulty": "<하 | 중 | 상>",
      "is_listening": <area가 "듣기"이면 true, 아니면 false>,
      "score_point": <배점 정수 또는 null>,
      "question_body": "<문항 지문 또는 질문 텍스트>",
      "choices": ["①...", "②...", "③...", "④...", "⑤..."],
      "answer": "<객관식: 정답 번호 기호만(예: '③'), 10자 이하. 서술형/듣기: null>",
      "reason": "<40자 이내 자연어 1문장. 난이도 판단 핵심 이유만>"
    }}
  ]
}}
""".strip()

_BLOCK_PROMPT_TEMPLATE = (
    "아래는 중등 영어 시험 문제지에서 추출·분리된 문항 블록들입니다.\n"
    "각 문항을 분석하고 JSON으로 반환하세요.\n\n"
    "📌 {grade_context}\n\n"
    "※추출불완전 표시 문항은 텍스트 추출이 불완전하여 본문이 짧거나 단편적입니다.\n"
    "  분류는 그대로 진행하되, reason 앞에 '[추출불완전]'을 붙여주세요.\n\n"
    "{blocks_text}\n\n"
    "반환 형식:\n" + _JSON_SCHEMA + "\n\n" + _SHARED_PROMPT_RULES
)

_PDF_FALLBACK_PROMPT_TEMPLATE = (
    "이 PDF는 중등 영어 시험 문제지입니다. 모든 문항을 분석하여 아래 JSON 형식으로 반환하세요.\n\n"
    "📌 {grade_context}\n\n"
    "반환 형식:\n" + _JSON_SCHEMA + "\n\n" + _SHARED_PROMPT_RULES
)


# ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

def _grade_context(grade: str | None) -> str:
    return f"대상 학년: {grade}" if grade else "대상 학년 정보 없음 (중등 평균 기준 적용)"


def _build_blocks_prompt(blocks: list[dict], grade: str | None = None) -> str:
    """분리된 문항 블록 목록으로 Gemini 텍스트 분류 프롬프트를 생성한다."""
    parts = []
    for b in blocks:
        num = b["question_number"]
        is_incomplete = b.get("status") == "need_review"
        label = f"[문항 {num}]" if num > 0 else "[문항]"
        header = f"{label} ※추출불완전" if is_incomplete else label
        parts.append(f"{header}\n{b['block_text']}")
    blocks_text = "\n\n".join(parts)
    return _BLOCK_PROMPT_TEMPLATE.format(
        blocks_text=blocks_text,
        grade_context=_grade_context(grade),
    )


def _build_pdf_fallback_prompt(grade: str | None = None) -> str:
    return _PDF_FALLBACK_PROMPT_TEMPLATE.format(
        grade_context=_grade_context(grade),
    )


def _call_gemini(client, model: str, contents: list) -> dict:
    """Gemini API를 호출하고 JSON 응답을 파싱한다."""
    response = client.models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.0,
        ),
    )
    return json.loads(response.text)


def _validate_classified(data: dict) -> AnalysisResult:
    """Gemini JSON 응답을 AnalysisResult로 검증·보정한다.

    area: 유효하지 않으면 is_listening 기준으로 듣기/독해 추정 보정
    is_listening: area == "듣기" 기준으로 강제 정규화
    difficulty: 유효하지 않으면 "중"으로 보정
    이슈 발생 시 reason 앞에 "[검수 필요]" 마킹
    """
    questions = data.get("questions", [])

    for q in questions:
        issues: list[str] = []
        original_reason: str = q.get("reason") or ""

        # ① area 검증·보정
        area_val = q.get("area")
        if area_val not in VALID_AREAS:
            corrected = "듣기" if q.get("is_listening") else "독해"
            issues.append(f"area 불명확('{area_val}' → '{corrected}'으로 추정)")
            q["area"] = corrected
            area_val = corrected

        # ② is_listening 정규화 (area 기준)
        q["is_listening"] = (area_val == "듣기")

        # ③ difficulty 보정
        diff_val = q.get("difficulty")
        if diff_val not in ("하", "중", "상"):
            issues.append(f"difficulty 불명확('{diff_val}')")
            q["difficulty"] = "중"

        if issues:
            tag = "[검수 필요] " + "; ".join(issues)
            q["reason"] = f"{tag} | {original_reason}" if original_reason else tag
            logger.debug("[QuestionBank] 검수 필요 문항 %s: %s", q.get("number"), tag)

    return AnalysisResult(**data)


# ── 핵심 분석 함수 ────────────────────────────────────────────────────────────

def analyze_pdf(
    db: Session,
    paper: ExamPaper,
    pdf_path: str,
    mime_type: str = "application/pdf",
) -> None:
    """
    PDF/이미지 파일을 분석하여 문항별 분류 결과를 DB에 저장한다.

    흐름:
    1. 텍스트 추출 (text_extraction_service)  — PDF 파서 또는 Vision OCR
    2. 텍스트 정제 (text_cleaning_service)    — 페이지 번호·헤더 제거, 공백 정리
    3. 문항 블록 분리 (question_split_service) — 번호 패턴 기반 분리
    4a. 블록 2개 이상 → 블록 텍스트를 Gemini에 직접 전달 (텍스트 모드)
    4b. 블록 부족 또는 텍스트 추출 실패 → PDF 파일을 Gemini File API로 업로드 (fallback)
    5. 검증 및 DB 저장 (raw_text에 원본 블록 텍스트 보존)
    """
    client = _get_genai_client()
    if not client:
        _fail(db, paper, "Gemini API 키가 설정되지 않았습니다.")
        return

    model = _get_platform_setting("DEFAULT_MODEL") or "gemini-2.5-flash"

    # 상태 → processing
    paper.status = PaperStatus.processing
    paper.updated_at = datetime.now(timezone.utc)
    db.commit()

    uploaded_file = None
    try:
        # ── Step 1: 텍스트 추출 ───────────────────────────────────────────────
        logger.info("[QuestionBank] Step 1: extracting text — %s", pdf_path)
        extraction = extract_text_hybrid(pdf_path, mime_type)
        full_text = extraction.get("full_text", "")
        extraction_method = extraction.get("extraction_method", "unknown")
        logger.info(
            "[QuestionBank] extraction_method=%s, text_len=%d",
            extraction_method, len(full_text),
        )

        # ── Step 2: 텍스트 정제 ───────────────────────────────────────────────
        cleaned_text = ""
        if full_text.strip():
            logger.info("[QuestionBank] Step 2: cleaning text")
            cleaned_text = clean_text(full_text)["cleaned_text"]
            logger.info("[QuestionBank] cleaned_len=%d", len(cleaned_text))

        # ── Step 3: 문항 블록 분리 ────────────────────────────────────────────
        blocks: list[dict] = []
        if cleaned_text.strip():
            logger.info("[QuestionBank] Step 3: splitting into question blocks")
            blocks = split_questions(cleaned_text)
            low_conf = [b for b in blocks if b.get("status") == "need_review"]
            logger.info(
                "[QuestionBank] blocks=%d (need_review=%d)",
                len(blocks), len(low_conf),
            )
            if low_conf:
                logger.warning(
                    "[QuestionBank] 추출 불완전 블록 번호: %s",
                    [b["question_number"] for b in low_conf],
                )

        # ── Step 4: Gemini 분류 ───────────────────────────────────────────────
        _IMAGE_MIME = {"image/jpeg", "image/jpg", "image/png"}
        is_image = mime_type.lower() in _IMAGE_MIME
        file_size = os.path.getsize(pdf_path)
        logger.info(
            "[QuestionBank] Step 4: file_size=%d bytes, mime_type=%s, "
            "is_image=%s, blocks=%d, cleaned_len=%d",
            file_size, mime_type, is_image, len(blocks), len(cleaned_text),
        )

        # 이미지 파일은 항상 텍스트 모드 (File API는 PDF 전용)
        # 텍스트가 조금이라도 추출됐으면 텍스트 모드 우선
        use_text_mode = is_image or len(blocks) >= 2 or bool(cleaned_text.strip())

        if use_text_mode:
            logger.info("[QuestionBank] Step 4: classifying via text-block mode")
            if blocks:
                prompt = _build_blocks_prompt(blocks, grade=paper.grade)
            else:
                # 블록 분리 실패했지만 OCR 텍스트가 있는 경우 단일 블록으로 전달
                fallback_text = cleaned_text.strip() or "(텍스트 추출 실패)"
                logger.info(
                    "[QuestionBank] Step 4: no blocks — wrapping full text as single block",
                )
                prompt = _build_blocks_prompt(
                    [{"question_number": 0, "block_text": fallback_text}],
                    grade=paper.grade,
                )
            data = _call_gemini(client, model, [prompt])
        else:
            # PDF이고 텍스트 추출이 완전히 실패한 경우에만 File API 사용
            logger.info(
                "[QuestionBank] Step 4: PDF File API fallback "
                "(no text extracted, blocks=%d)",
                len(blocks),
            )
            with open(pdf_path, "rb") as f:
                uploaded_file = client.files.upload(
                    file=f,
                    config={"mime_type": "application/pdf"},
                )
            logger.info("[QuestionBank] uploaded file: %s", uploaded_file.name)
            prompt = _build_pdf_fallback_prompt(grade=paper.grade)
            data = _call_gemini(client, model, [uploaded_file, prompt])

        # ── Step 5: 검증 및 DB 저장 ───────────────────────────────────────────
        result = _validate_classified(data)
        logger.info("[QuestionBank] validated questions=%d", len(result.questions))

        # 블록 번호 → 원본 블록 텍스트 매핑 (raw_text 보존)
        raw_text_map: dict[int, str] = {
            b["question_number"]: b["block_text"] for b in blocks
        }

        now = datetime.now(timezone.utc)
        items = []
        for q in result.questions:
            # answer는 String(10) 컬럼 — 길이 초과 시 잘라내고 경고
            safe_answer = q.answer
            if safe_answer and len(safe_answer) > 10:
                logger.warning(
                    "[QuestionBank] answer too long (q=%s, len=%d), truncating: %r",
                    q.number, len(safe_answer), safe_answer,
                )
                safe_answer = safe_answer[:10]

            items.append(QuestionItem(
                paper_id=paper.id,
                tenant_id=paper.tenant_id,
                question_number=q.number,
                area=q.area,
                problem_type=q.problem_type,
                concept_tag=q.concept_tag,
                difficulty=q.difficulty,
                is_listening=q.is_listening,
                score_point=q.score_point,
                question_body=q.question_body,
                choices=q.choices,
                answer=safe_answer,
                classifier_reason=q.reason,
                raw_text=raw_text_map.get(q.number),
                review_status=ReviewStatus.pending,
                question_format="서술형" if q.area == "서술형" else "객관식",
                created_at=now,
            ))
        db.add_all(items)

        paper.status = PaperStatus.done
        paper.total_questions = len(items)
        paper.updated_at = now
        db.commit()
        logger.info("[QuestionBank] done. saved %d items.", len(items))

    except json.JSONDecodeError as e:
        _fail(db, paper, f"JSON 파싱 실패: {e}")
    except Exception as e:
        logger.exception("[QuestionBank] analysis failed")
        _fail(db, paper, str(e))
    finally:
        if uploaded_file:
            try:
                client.files.delete(name=uploaded_file.name)
            except Exception:
                pass


def _fail(db: Session, paper: ExamPaper, message: str) -> None:
    logger.error("[QuestionBank] failed: %s", message)
    try:
        db.rollback()
    except Exception as rb_err:
        logger.error("[QuestionBank] rollback error: %s", rb_err)
    try:
        paper.status = PaperStatus.failed
        paper.error_message = (message or "")[:2000]
        paper.updated_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as commit_err:
        logger.error("[QuestionBank] _fail commit error: %s", commit_err)
