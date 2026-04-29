import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ..models.exam import ExamResultStatus
from ..services.attendance_queries import MultipleStudentsError, get_student_by_user
from ..services.exam_queries import fetch_exam_results, fetch_exam_summary

logger = logging.getLogger(__name__)

EXAM_FUNCTION_DECLARATIONS = [
    {
        "name": "get_my_exam_summary",
        "description": "연결된 학생의 기간 내 시험 성적 요약(시험 수, 완료 수, 평균/최고 점수율, 최근 시험 정보)을 조회합니다.",
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
            },
            "required": ["from_date", "to_date"],
        },
    },
    {
        "name": "get_my_exam_results",
        "description": "연결된 학생의 기간 내 시험 결과 상세 목록(각 시험의 점수, 등급, 코멘트 포함)을 조회합니다.",
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
                "status_filter": {
                    "type": "string",
                    "description": "필터할 시험 상태 (pending|completed|absent|excused). 생략 시 전체 조회.",
                },
            },
            "required": ["from_date", "to_date"],
        },
    },
]

_VALID_STATUSES = [s.value for s in ExamResultStatus]


def _parse_date(date_str: str, field_name: str) -> Optional[object]:
    """YYYY-MM-DD 문자열을 date 객체로 변환한다. 실패 시 None 반환."""
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def execute_exam_tool(
    function_name: str,
    args: dict,
    tenant_id: int,
    user_id: int,
    db: Session,
) -> dict:
    """시험 tool executor. 에러 dict 변환은 모두 이 함수에서 처리한다.

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
    try:
        student = get_student_by_user(db, tenant_id, user_id)
    except MultipleStudentsError:
        return {
            "error": "multiple_students_not_supported",
            "message": "연결된 학생이 2명 이상입니다. 현재 버전에서는 지원되지 않습니다.",
        }

    if student is None:
        return {
            "error": "verification_required",
            "message": "연결된 학생이 없습니다. 먼저 학생 연동 인증을 완료해 주세요.",
        }

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
    if function_name == "get_my_exam_summary":
        return fetch_exam_summary(
            db=db,
            tenant_id=tenant_id,
            student_id=student.id,
            from_date=from_date,
            to_date=to_date,
        )

    if function_name == "get_my_exam_results":
        # status_filter enum 검증
        status_filter_str: Optional[str] = args.get("status_filter")
        status_filter = None
        if status_filter_str is not None:
            try:
                status_filter = ExamResultStatus(status_filter_str)
            except ValueError:
                return {
                    "error": "invalid_status_filter",
                    "message": f"'{status_filter_str}'은 유효하지 않은 시험 상태입니다.",
                    "valid_values": _VALID_STATUSES,
                }

        return fetch_exam_results(
            db=db,
            tenant_id=tenant_id,
            student_id=student.id,
            from_date=from_date,
            to_date=to_date,
            status_filter=status_filter,
        )

    logger.warning("Unknown exam function: %s", function_name)
    return {"error": "unknown_function", "message": f"알 수 없는 함수: {function_name}"}
