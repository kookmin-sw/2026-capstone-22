"""문제은행 LLM 도구: 연습 문제 조회"""

import logging
import random
from typing import Optional

from sqlalchemy.orm import Session

from ..models.exam_paper import ExamPaper, QuestionItem, ReviewStatus

logger = logging.getLogger(__name__)

QUESTION_BANK_FUNCTION_DECLARATIONS = [
    {
        "name": "get_practice_questions",
        "description": (
            "문제은행에서 특정 학년·영역에 맞는 연습 문제를 가져옵니다. "
            "학부모가 문제를 요청할 때 사용하세요. "
            "grade와 area가 모두 확인된 경우에만 호출하고, "
            "불명확한 항목이 있으면 먼저 학부모에게 물어보세요."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "grade": {
                    "type": "string",
                    "description": "학년 (예: 중1, 중2, 중3). 학부모가 명시하지 않았으면 null.",
                },
                "area": {
                    "type": "string",
                    "description": "문제 영역: 문법, 어휘, 독해, 듣기, 서술형 중 하나. 불명확하면 null.",
                },
                "count": {
                    "type": "integer",
                    "description": "요청한 문제 수. 학부모가 명시하지 않으면 3.",
                },
            },
            "required": [],
        },
    }
]


def execute_question_bank_tool(
    func_name: str,
    func_args: dict,
    tenant_id: Optional[int],
    db: Session,
) -> dict:
    if func_name == "get_practice_questions":
        return _get_practice_questions(tenant_id, db, **func_args)
    return {"error": f"알 수 없는 함수: {func_name}"}


def _get_practice_questions(
    tenant_id: Optional[int],
    db: Session,
    grade: Optional[str] = None,
    area: Optional[str] = None,
    problem_type: Optional[str] = None,
    count: int = 3,
) -> dict:
    """검수 완료된 문항에서 조건에 맞는 문제를 랜덤으로 조회한다."""
    if not tenant_id:
        return {"found": 0, "questions": [], "message": "테넌트 정보를 찾을 수 없습니다."}

    try:
        q = (
            db.query(QuestionItem)
            .join(ExamPaper, QuestionItem.paper_id == ExamPaper.id)
            .filter(
                QuestionItem.tenant_id == tenant_id,
                QuestionItem.review_status == ReviewStatus.reviewed,
                QuestionItem.question_body.isnot(None),
            )
        )

        if grade:
            q = q.filter(ExamPaper.grade == grade)
        if area:
            q = q.filter(QuestionItem.area == area)
        if problem_type:
            q = q.filter(QuestionItem.problem_type == problem_type)

        items = q.all()
        total_found = len(items)

        if total_found == 0:
            return {
                "found": 0,
                "questions": [],
                "message": "조건에 맞는 검수 완료 문제가 없습니다.",
            }

        sample_count = min(count, total_found)
        sampled = random.sample(items, sample_count)

        formatted = []
        for i, item in enumerate(sampled, 1):
            header = f"[문항 {i}]"
            meta = " · ".join(filter(None, [item.problem_type or item.area, item.difficulty]))
            if meta:
                header += f" ({meta})"
            parts = [header]
            if item.question_body:
                parts.append(item.question_body.strip())
            if item.choices:
                parts.extend(str(c) for c in item.choices)
            formatted.append("\n".join(parts))

        return {
            "found": total_found,
            "returned": sample_count,
            "requested": count,
            "grade": grade,
            "area": area,
            "problem_type": problem_type,
            "questions": formatted,
        }
    except Exception as e:
        logger.exception("[QuestionBank] get_practice_questions failed")
        return {"error": str(e), "questions": []}
