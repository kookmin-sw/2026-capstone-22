"""문제은행 서비스: PDF → Gemini 분석 → DB 저장"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from google.genai import types
from sqlalchemy.orm import Session

from ..models.exam_paper import ExamPaper, PaperStatus, QuestionItem, ReviewStatus
from ..schemas.question_bank import AnalysisResult
from .gemini_client import _get_genai_client, _get_platform_setting

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

_CLASSIFICATION_PROMPT = """
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


def _build_prompt() -> str:
    listening = ", ".join(ENGLISH_TAXONOMY["듣기"])
    reading = ", ".join(ENGLISH_TAXONOMY["독해"])
    return _CLASSIFICATION_PROMPT.format(
        listening_types=listening,
        reading_types=reading,
    )


def _validate_classified(data: dict) -> AnalysisResult:
    """Gemini JSON 응답을 AnalysisResult로 검증. 잘못된 값은 보정."""
    all_types = set(ENGLISH_TAXONOMY["듣기"] + ENGLISH_TAXONOMY["독해"])
    questions = data.get("questions", [])
    for q in questions:
        if q.get("area") not in ("듣기", "독해"):
            q["area"] = "듣기" if q.get("is_listening") else "독해"
        if q.get("problem_type") not in all_types:
            q["problem_type"] = "기타"
        if q.get("difficulty") not in ("하", "중", "상"):
            q["difficulty"] = "중"
    return AnalysisResult(**data)


# ── 핵심 분석 함수 ────────────────────────────────────────────────────────────

def analyze_pdf(
    db: Session,
    paper: ExamPaper,
    pdf_path: str,
) -> None:
    """
    PDF를 Gemini File API로 업로드하고 문항을 분류하여 DB에 저장.
    paper.status를 processing → done / failed 로 업데이트.
    """
    client = _get_genai_client()
    if not client:
        _fail(db, paper, "Gemini API 키가 설정되지 않았습니다.")
        return

    model = _get_platform_setting("DEFAULT_MODEL") or "gemini-2.5-flash"

    # 1. 상태 → processing
    paper.status = PaperStatus.processing
    paper.updated_at = datetime.now(timezone.utc)
    db.commit()

    uploaded_file = None
    try:
        # 2. PDF를 Gemini File API에 업로드
        logger.info(f"[QuestionBank] Uploading PDF: {pdf_path}")
        with open(pdf_path, "rb") as f:
            uploaded_file = client.files.upload(
                file=f,
                config={"mime_type": "application/pdf"},
            )
        logger.info(f"[QuestionBank] File uploaded: {uploaded_file.name}")

        # 3. 분류 요청
        prompt = _build_prompt()
        response = client.models.generate_content(
            model=model,
            contents=[uploaded_file, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.0,
            ),
        )

        raw_json = response.text
        logger.info(f"[QuestionBank] Raw response length: {len(raw_json)}")

        # 4. 파싱 및 검증
        data = json.loads(raw_json)
        result = _validate_classified(data)

        # 5. QuestionItem 일괄 저장
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
                review_status=ReviewStatus.pending,
                question_format="객관식",
                created_at=now,
            )
            for q in result.questions
        ]
        db.add_all(items)

        # 6. 상태 → done
        paper.status = PaperStatus.done
        paper.total_questions = len(items)
        paper.updated_at = now
        db.commit()
        logger.info(f"[QuestionBank] Done. {len(items)} questions saved.")

    except json.JSONDecodeError as e:
        _fail(db, paper, f"JSON 파싱 실패: {e}")
    except Exception as e:
        logger.exception("[QuestionBank] Analysis failed")
        _fail(db, paper, str(e))
    finally:
        # Gemini 임시 파일 삭제
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
    logger.error(f"[QuestionBank] Failed: {message}")
