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

# ── 영어 수능 Taxonomy ────────────────────────────────────────────────────────

ENGLISH_TAXONOMY = {
    "듣기": [
        "목적 파악", "의견 파악", "요지 파악", "그림 내용 파악",
        "할 일 파악", "금액 파악", "이유 파악", "언급 내용 파악",
        "내용 일치", "도표 파악", "짧은 대화 응답", "긴 대화 응답",
        "상황 말하기", "복합 문항",
    ],
    "독해": [
        "목적 파악", "심경 변화", "주장 파악", "밑줄 의미",
        "요지 파악", "주제 파악", "제목 파악", "도표 일치",
        "내용 일치", "안내문 일치", "어법", "어휘",
        "빈칸 추론", "무관 문장", "글의 순서", "문장 삽입",
        "요약문 완성", "장문 독해",
    ],
}

# ── 프롬프트 템플릿 ───────────────────────────────────────────────────────────

# 텍스트 추출·분리에 성공했을 때: 블록을 그대로 Gemini에 전달
_BLOCK_PROMPT_TEMPLATE = """
아래는 영어 시험 문제지에서 추출·분리된 문항 블록들입니다.
각 문항을 분석하고 JSON으로 반환하세요.

{blocks_text}

반환 형식 (questions 배열):
{{
  "questions": [
    {{
      "number": <문항 번호 정수>,
      "area": "<듣기 | 독해>",
      "problem_type": "<아래 taxonomy에서 정확히 선택>",
      "difficulty": "<하 | 중 | 상>",
      "is_listening": <true | false>,
      "score_point": <배점 정수, 2 또는 3>,
      "question_body": "<문항 지문 또는 질문 텍스트 (선택지 제외)>",
      "choices": ["①...", "②...", "③...", "④...", "⑤..."],
      "reason": "<분류 근거 한 줄>"
    }}
  ]
}}

taxonomy (반드시 이 목록 안에서만 선택):
- 듣기 영역: {listening_types}
- 독해 영역: {reading_types}

난이도 기준:
- 하: 개념 확인, 단순 사실 파악
- 중: 추론, 흐름 파악
- 상: 고난도 추론, 3점 문항

주의:
- choices는 없으면 null
- 듣기 문항(1~17번)은 is_listening=true, area="듣기"
- 모든 문항을 빠짐없이 포함할 것
- JSON 외 다른 텍스트 출력 금지
""".strip()

# 텍스트 추출이 불충분할 때(스캔 PDF 등): PDF 파일 자체를 Gemini에 업로드
_PDF_FALLBACK_PROMPT_TEMPLATE = """
이 PDF는 영어 시험 문제지입니다. 모든 문항을 분석하여 아래 JSON 형식으로 반환하세요.

반환 형식 (questions 배열):
{{
  "questions": [
    {{
      "number": <문항 번호 정수>,
      "area": "<듣기 | 독해>",
      "problem_type": "<아래 taxonomy에서 정확히 선택>",
      "difficulty": "<하 | 중 | 상>",
      "is_listening": <true | false>,
      "score_point": <배점 정수, 2 또는 3>,
      "question_body": "<문항 지문 또는 질문 텍스트 (선택지 제외)>",
      "choices": ["①...", "②...", "③...", "④...", "⑤..."],
      "reason": "<분류 근거 한 줄>"
    }}
  ]
}}

taxonomy (반드시 이 목록 안에서만 선택):
- 듣기 영역: {listening_types}
- 독해 영역: {reading_types}

난이도 기준:
- 하: 개념 확인, 단순 사실 파악
- 중: 추론, 흐름 파악
- 상: 고난도 추론, 3점 문항

주의:
- choices는 없으면 null로 반환
- 듣기 문항(1~17번)은 is_listening=true, area="듣기"
- 모든 문항을 빠짐없이 포함할 것
- JSON 외 다른 텍스트 출력 금지
""".strip()


# ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

def _taxonomy_args() -> dict:
    return {
        "listening_types": ", ".join(ENGLISH_TAXONOMY["듣기"]),
        "reading_types": ", ".join(ENGLISH_TAXONOMY["독해"]),
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
    """Gemini JSON 응답을 AnalysisResult로 검증.

    - area / difficulty: 기능 정상화를 위해 최선 추정값으로 보정하되 이슈 기록
    - problem_type: taxonomy 밖의 값이면 "미분류"로 저장 (보정하지 않음)
    - 이슈가 있으면 classifier_reason 앞에 "[검수 필요]" 마킹
    """
    all_types = set(ENGLISH_TAXONOMY["듣기"] + ENGLISH_TAXONOMY["독해"])
    questions = data.get("questions", [])

    for q in questions:
        issues: list[str] = []
        original_reason: str = q.get("reason") or ""

        # area: UI 표시에 필요하므로 보정하되 이슈 기록
        area_val = q.get("area")
        if area_val not in ("듣기", "독해"):
            corrected = "듣기" if q.get("is_listening") else "독해"
            issues.append(f"area 불명확('{area_val}' → '{corrected}'으로 추정)")
            q["area"] = corrected

        # problem_type: taxonomy 밖이면 "미분류" 저장 (원본값 이슈에 기록)
        pt_val = q.get("problem_type")
        if pt_val not in all_types:
            issues.append(f"problem_type taxonomy 불일치('{pt_val}')")
            q["problem_type"] = "미분류"

        # difficulty: 합리적 기본값으로 보정하되 이슈 기록
        diff_val = q.get("difficulty")
        if diff_val not in ("하", "중", "상"):
            issues.append(f"difficulty 불명확('{diff_val}')")
            q["difficulty"] = "중"

        # 이슈 있으면 classifier_reason에 마킹
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
                difficulty=q.difficulty,
                is_listening=q.is_listening,
                score_point=q.score_point,
                question_body=q.question_body,
                choices=q.choices,
                classifier_reason=q.reason,
                raw_text=raw_text_map.get(q.number),
                review_status=ReviewStatus.pending,
                question_format="객관식",
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
