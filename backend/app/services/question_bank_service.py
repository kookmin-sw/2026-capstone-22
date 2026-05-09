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

# ── 중등 영어 Taxonomy ───────────────────────────────────────────────────────
# area (5개) → problem_types / concept_tags 2-level 구조
# DB 저장은 flat: area / problem_type / concept_tag 3개 컬럼
# "빈칸" 유형명 충돌 방지: 문법="문법 빈칸", 어휘="어휘 빈칸", 독해="빈칸 추론"

ENGLISH_TAXONOMY: dict[str, dict[str, list[str]]] = {
    "문법": {
        "problem_types": [
            "오답 고르기", "밑줄 어법", "문법 빈칸",
            "문장 완성", "문장 변환", "영작", "조건 영작",
        ],
        "concept_tags": [
            "시제", "현재완료", "수동태", "조동사",
            "부정사", "동명사", "분사", "분사구문",
            "관계대명사", "관계부사", "가정법", "비교",
            "접속사", "전치사", "간접의문문", "일치", "화법",
        ],
    },
    "어휘": {
        "problem_types": [
            "어휘 빈칸", "어휘 완성", "단어 쓰기", "숙어 완성",
        ],
        "concept_tags": [
            "단어 의미", "숙어", "문맥 어휘",
            "동의어", "반의어", "다의어", "연어",
        ],
    },
    "독해": {
        "problem_types": [
            "빈칸 추론", "문장 삽입", "순서 배열", "무관 문장",
            "내용 일치", "내용 불일치", "심경 파악",
            "제목 선택", "주제 선택", "도표 파악", "요약",
        ],
        "concept_tags": [
            "주제 파악", "요지 파악", "목적 파악", "심경 파악",
            "세부 내용 파악", "문맥 추론", "글의 흐름",
            "내용 연결", "지칭 추론", "요약 이해",
        ],
    },
    "듣기": {
        "problem_types": [
            "목적 파악", "내용 일치", "세부 정보 파악",
            "도표 파악", "대화 응답", "상황 이해",
        ],
        "concept_tags": [
            "세부 정보 파악", "의견 파악", "이유 파악",
            "목적 파악", "심경 파악", "상황 이해", "화자 의도",
        ],
    },
    "서술형": {
        "problem_types": [
            "문장 완성", "문장 변환", "본문 변형", "어순 배열",
            "영작", "조건 영작", "요약 쓰기", "본문 기반 서술",
        ],
        "concept_tags": [
            "문장 재구성", "조건 충족", "핵심 내용 요약",
            "문법 적용", "본문 이해",
        ],
    },
}

# ── 프롬프트 템플릿 ───────────────────────────────────────────────────────────

_SHARED_PROMPT_RULES = """
[STEP 1] area 판단 기준 — 먼저 결정:
- 문법: 문법 규칙·어형 변화·문장 구조를 테스트 (객관식 or 빈칸 쓰기)
- 어휘: 단어·숙어 의미·문맥 사용을 테스트
- 독해: 영어 지문을 읽고 이해·추론 (객관식)
- 듣기: 음성·대화 내용을 듣고 이해 (문항에 LISTEN/듣기 표기 있음)
- 서술형: 학생이 영어 문장을 직접 쓰는 주관식

[STEP 2] area별 problem_type 선택 (반드시 아래 목록 안에서만):
{problem_type_taxonomy}

[STEP 3] concept_tag 선택 (area별 목록 안에서 가장 알맞은 것 1개):
{concept_tag_taxonomy}

빈칸 유형 disambiguation (이름이 비슷하므로 반드시 구분):
- "문법 빈칸" (area=문법): 빈칸에 문법적으로 알맞은 어형·형태 선택/쓰기
- "어휘 빈칸" (area=어휘): 빈칸에 문맥상 알맞은 단어 선택/쓰기
- "빈칸 추론" (area=독해): 지문 전체 흐름으로 논리적 표현을 추론

문장 완성/변환 disambiguation:
- 서술형 "문장 완성/변환": 학생이 직접 영어 문장 작성 (주관식)
- 문법 "문장 완성/변환": 어법 규칙 기반 변환, 객관식 or 제한적 쓰기

독해형 question_body / choices 분리 기준:
- 무관 문장: question_body = stem + ①②③④⑤ 문장 전체, choices = null
- 문장 삽입: question_body = stem + 삽입 대상 문장 + ①②③④⑤ 위치 표시 지문, choices = null
- 순서 배열: question_body = stem + 도입문 + (A)(B)(C) 단락 전체, choices = 순서 조합 5개
- 빈칸 추론: question_body = _____ 포함 지문 전체, choices = ①②③④⑤ 선택지
- 그 외 독해: question_body = stem + 지문, choices = ①②③④⑤

난이도 기준:
- 하: 직접 사실 확인, 기초 문법 (예: 단순 시제, 단어 뜻)
- 중: 추론·응용 필요 (예: 글의 흐름, 어법 응용)
- 상: 복합 추론·고난도 (예: 가정법 서술형, 빈칸 추론 고난도)

주의:
- choices는 없으면 null
- is_listening은 area가 "듣기"일 때만 true
- concept_tag는 반드시 해당 area의 목록 안에서 선택; 없으면 null
- 모든 문항을 빠짐없이 포함할 것
- JSON 외 다른 텍스트 출력 금지
""".strip()

_JSON_SCHEMA = """
{{
  "questions": [
    {{
      "number": <문항 번호 정수>,
      "area": "<문법 | 어휘 | 독해 | 듣기 | 서술형>",
      "problem_type": "<STEP 2에서 선택>",
      "concept_tag": "<STEP 3에서 선택, 없으면 null>",
      "difficulty": "<하 | 중 | 상>",
      "is_listening": <area가 "듣기"이면 true, 아니면 false>,
      "score_point": <배점 정수>,
      "question_body": "<문항 지문 또는 질문 텍스트>",
      "choices": ["①...", "②...", "③...", "④...", "⑤..."],
      "reason": "<분류 근거 한 줄>"
    }}
  ]
}}
""".strip()

_BLOCK_PROMPT_TEMPLATE = (
    "아래는 중등 영어 시험 문제지에서 추출·분리된 문항 블록들입니다.\n"
    "각 문항을 분석하고 JSON으로 반환하세요.\n\n"
    "{blocks_text}\n\n"
    "반환 형식:\n" + _JSON_SCHEMA + "\n\n" + _SHARED_PROMPT_RULES
)

_PDF_FALLBACK_PROMPT_TEMPLATE = (
    "이 PDF는 중등 영어 시험 문제지입니다. 모든 문항을 분석하여 아래 JSON 형식으로 반환하세요.\n\n"
    "반환 형식:\n" + _JSON_SCHEMA + "\n\n" + _SHARED_PROMPT_RULES
)


# ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

def _taxonomy_args() -> dict:
    pt_lines, ct_lines = [], []
    for area, defn in ENGLISH_TAXONOMY.items():
        pt_lines.append(f"■ {area}: {', '.join(defn['problem_types'])}")
        ct_lines.append(f"■ {area}: {', '.join(defn['concept_tags'])}")
    return {
        "problem_type_taxonomy": "\n".join(pt_lines),
        "concept_tag_taxonomy": "\n".join(ct_lines),
    }


def _build_blocks_prompt(blocks: list[dict]) -> str:
    """분리된 문항 블록 목록으로 Gemini 텍스트 분류 프롬프트를 생성한다."""
    parts = []
    for b in blocks:
        num = b["question_number"]
        header = f"[문항 {num}]" if num > 0 else "[문항]"
        parts.append(f"{header}\n{b['block_text']}")
    blocks_text = "\n\n".join(parts)
    return _BLOCK_PROMPT_TEMPLATE.format(blocks_text=blocks_text, **_taxonomy_args())


def _build_pdf_fallback_prompt() -> str:
    return _PDF_FALLBACK_PROMPT_TEMPLATE.format(**_taxonomy_args())


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

    area / problem_type 검증:
    - area가 유효하지 않으면 is_listening 기준으로 듣기/독해 추정 보정
    - problem_type이 해당 area의 problem_types 목록 밖이면 "미분류" 저장
    concept_tag 검증 (soft):
    - 해당 area의 concept_tags 밖이면 경고만 기록, 값은 유지
    is_listening:
    - area == "듣기" 기준으로 강제 정규화
    이슈 발생 시 classifier_reason 앞에 "[검수 필요]" 마킹
    """
    valid_areas = set(ENGLISH_TAXONOMY.keys())
    questions = data.get("questions", [])

    for q in questions:
        issues: list[str] = []
        original_reason: str = q.get("reason") or ""

        # ① area 검증·보정
        area_val = q.get("area")
        if area_val not in valid_areas:
            corrected = "듣기" if q.get("is_listening") else "독해"
            issues.append(f"area 불명확('{area_val}' → '{corrected}'으로 추정)")
            q["area"] = corrected
            area_val = corrected

        # ② is_listening 정규화 (area 기준)
        q["is_listening"] = (area_val == "듣기")

        # ③ problem_type: 해당 area의 목록 밖이면 "미분류"
        valid_types = set(ENGLISH_TAXONOMY[area_val]["problem_types"])
        pt_val = q.get("problem_type")
        if pt_val not in valid_types:
            issues.append(f"problem_type 불일치('{pt_val}'): {area_val} 목록에 없음")
            q["problem_type"] = "미분류"

        # ④ concept_tag soft validation (경고만, 값 유지)
        ct_val = q.get("concept_tag")
        if ct_val and ct_val not in ENGLISH_TAXONOMY[area_val]["concept_tags"]:
            issues.append(f"concept_tag 비표준('{ct_val}')")

        # ⑤ difficulty 보정
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
            logger.info("[QuestionBank] blocks=%d", len(blocks))

        # ── Step 4: Gemini 분류 ───────────────────────────────────────────────
        # 블록이 2개 이상이면 텍스트 모드; 그렇지 않으면 PDF File API fallback
        use_text_mode = len(blocks) >= 2

        if use_text_mode:
            logger.info("[QuestionBank] Step 4: classifying via text-block mode")
            prompt = _build_blocks_prompt(blocks)
            data = _call_gemini(client, model, [prompt])
        else:
            logger.info(
                "[QuestionBank] Step 4: falling back to PDF File API upload "
                "(blocks=%d, text_len=%d)",
                len(blocks), len(cleaned_text),
            )
            with open(pdf_path, "rb") as f:
                uploaded_file = client.files.upload(
                    file=f,
                    config={"mime_type": "application/pdf"},
                )
            logger.info("[QuestionBank] uploaded file: %s", uploaded_file.name)
            prompt = _build_pdf_fallback_prompt()
            data = _call_gemini(client, model, [uploaded_file, prompt])

        # ── Step 5: 검증 및 DB 저장 ───────────────────────────────────────────
        result = _validate_classified(data)
        logger.info("[QuestionBank] validated questions=%d", len(result.questions))

        # 블록 번호 → 원본 블록 텍스트 매핑 (raw_text 보존)
        raw_text_map: dict[int, str] = {
            b["question_number"]: b["block_text"] for b in blocks
        }

        now = datetime.now(timezone.utc)
        items = [
            QuestionItem(
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
                classifier_reason=q.reason,
                raw_text=raw_text_map.get(q.number),
                review_status=ReviewStatus.pending,
                question_format="서술형" if q.area == "서술형" else "객관식",
                created_at=now,
            )
            for q in result.questions
        ]
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
    paper.status = PaperStatus.failed
    paper.error_message = message
    paper.updated_at = datetime.now(timezone.utc)
    db.commit()
    logger.error("[QuestionBank] failed: %s", message)
