import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ..schemas.assignment import AssignmentDisplayStatus
from ..services.attendance_queries import get_students_by_user
from ..services.assignment_queries import (
    fetch_assignment_submissions,
    fetch_assignment_summary,
)

logger = logging.getLogger(__name__)

ASSIGNMENT_FUNCTION_DECLARATIONS = [
    {
        "name": "get_my_assignment_summary",
        "description": "연결된 학생의 기간 내 과제 현황 요약(전체 수, 제출/미제출/지각/면제 수, 오늘 마감 수, 제출률)을 조회합니다.",
        "parameters": {
            "type": "object",
            "properties": {
                "from_date": {
                    "type": "string",
                    "description": "조회 시작일 (YYYY-MM-DD)",
                },
                "to_date": {
                    "type": "string",
                    "description": "조회 종료일 (YYYY-MM-DD)",
                },
                "student_name": {
                    "type": "string",
                    "description": "연결된 학생이 여러 명일 때 조회할 학생 이름 또는 이름 일부. 생략 시 학생 목록만 반환됩니다.",
                },
            },
            "required": ["from_date", "to_date"],
        },
    },
    {
        "name": "get_my_assignment_submissions",
        "description": "연결된 학생의 기간 내 과제 제출 상세 목록(과제명, 분반, 제출 상태, 제출일, 점수, 피드백 포함)을 조회합니다.",
        "parameters": {
            "type": "object",
            "properties": {
                "from_date": {
                    "type": "string",
                    "description": "조회 시작일 (YYYY-MM-DD)",
                },
                "to_date": {
                    "type": "string",
                    "description": "조회 종료일 (YYYY-MM-DD)",
                },
                "display_status_filter": {
                    "type": "string",
                    "description": "필터할 표시 상태 (assigned|missing|submitted|late|excused). 생략 시 전체 조회.",
                },
                "student_name": {
                    "type": "string",
                    "description": "연결된 학생이 여러 명일 때 조회할 학생 이름 또는 이름 일부. 생략 시 학생 목록만 반환됩니다.",
                },
            },
            "required": ["from_date", "to_date"],
        },
    },
]

_VALID_DISPLAY_STATUSES = [s.value for s in AssignmentDisplayStatus]


def _parse_date(date_str: str, field_name: str) -> Optional[object]:
    """YYYY-MM-DD 문자열을 date 객체로 변환한다. 실패 시 None 반환."""
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def execute_assignment_tool(
    function_name: str,
    args: dict,
    tenant_id: int,
    user_id: int,
    db: Session,
) -> dict:
    """과제 tool executor. 에러 dict 변환은 모두 이 함수에서 처리한다.

    Args:
        function_name: LLM이 호출한 함수 이름
        args: LLM이 전달한 인자 dict
        tenant_id: 현재 테넌트 ID (호출 컨텍스트에서 주입)
        user_id: 현재 로그인 사용자 ID (학부모 기준, 호출 컨텍스트에서 주입)
        db: SQLAlchemy 세션

    Returns:
        dict — 정상 결과 또는 {"error": ..., "message": ...} 형태의 에러
    """
    # 1. 연결된 학생 resolve
    students = get_students_by_user(db, tenant_id, user_id)
    if not students:
        return {
            "error": "verification_required",
            "message": "연결된 학생이 없습니다. 먼저 학생 연동 인증을 완료해 주세요.",
        }

    name_filter = (args.get("student_name") or "").strip()
    if len(students) > 1:
        if name_filter:
            matched = [s for s in students if name_filter in s.name]
            if not matched:
                names = ", ".join(s.name for s in students)
                return {
                    "error": "student_not_found",
                    "message": f"'{name_filter}' 이름의 학생을 찾을 수 없습니다. 연결된 학생: {names}",
                }
            student = matched[0]
        else:
            names = [s.name for s in students]
            return {
                "multiple_students": True,
                "students": [{"name": n} for n in names],
                "message": f"연결된 학생이 {len(students)}명입니다: {', '.join(names)}. student_name 파라미터로 조회할 학생을 지정해 주세요.",
            }
    else:
        student = students[0]

    # 2. 날짜 파싱
    from_date = _parse_date(args.get("from_date", ""), "from_date")
    to_date = _parse_date(args.get("to_date", ""), "to_date")

    if from_date is None or to_date is None:
        return {
            "error": "invalid_date",
            "message": "날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식으로 입력해 주세요.",
        }

    if from_date > to_date:
        return {
            "error": "invalid_date_range",
            "message": "from_date는 to_date보다 이전이어야 합니다.",
        }

    # 3. 함수 분기
    if function_name == "get_my_assignment_summary":
        return fetch_assignment_summary(
            db=db,
            tenant_id=tenant_id,
            student_id=student.id,
            from_date=from_date,
            to_date=to_date,
        )

    if function_name == "get_my_assignment_submissions":
        display_status_filter_str: Optional[str] = args.get("display_status_filter")
        display_status_filter = None
        if display_status_filter_str is not None:
            if display_status_filter_str not in _VALID_DISPLAY_STATUSES:
                return {
                    "error": "invalid_status_filter",
                    "message": f"'{display_status_filter_str}'은 유효하지 않은 과제 상태입니다.",
                    "valid_values": _VALID_DISPLAY_STATUSES,
                }
            display_status_filter = display_status_filter_str

        return fetch_assignment_submissions(
            db=db,
            tenant_id=tenant_id,
            student_id=student.id,
            from_date=from_date,
            to_date=to_date,
            display_status_filter=display_status_filter,
        )

    logger.warning("Unknown assignment function: %s", function_name)
    return {"error": "unknown_function", "message": f"알 수 없는 함수: {function_name}"}
