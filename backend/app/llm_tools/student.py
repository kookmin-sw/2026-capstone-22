import logging

from sqlalchemy.orm import Session

from ..services.attendance_queries import MultipleStudentsError, get_student_by_user

logger = logging.getLogger(__name__)

STUDENT_FUNCTION_DECLARATIONS = [
    {
        "name": "get_my_student_profile",
        "description": (
            "연결된 학생의 기본 프로필 정보를 조회합니다. "
            "분반(반 이름), 담당 선생님, 수업 요일/시간, 과목, 학교, 학년 등을 반환합니다. "
            "학부모가 자녀의 반·분반·선생님·수업 시간·시간표·수업 요일을 물어볼 때 이 함수를 호출하세요."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]


def execute_student_tool(
    function_name: str,
    args: dict,
    tenant_id: int,
    user_id: int,
    db: Session,
) -> dict:
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

    if function_name == "get_my_student_profile":
        profile: dict = {
            "student_name": student.name,
            "school_name": student.school_name,
            "grade": student.grade,
        }

        if student.student_class:
            sc = student.student_class
            profile["class_name"] = sc.name
            profile["class_code"] = sc.code
            profile["subject"] = sc.subject
            profile["teacher_name"] = sc.teacher_name
            profile["grade_level"] = sc.grade_level
            profile["day_of_week"] = sc.day_of_week
            profile["start_time"] = sc.start_time
            profile["end_time"] = sc.end_time
        else:
            profile["class_name"] = None
            profile["teacher_name"] = None

        return profile

    logger.warning("Unknown student function: %s", function_name)
    return {"error": "unknown_function", "message": f"알 수 없는 함수: {function_name}"}
