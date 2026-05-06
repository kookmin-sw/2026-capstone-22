import logging

from sqlalchemy.orm import Session

from ..services.attendance_queries import get_students_by_user

logger = logging.getLogger(__name__)

STUDENT_FUNCTION_DECLARATIONS = [
    {
        "name": "get_my_student_profile",
        "description": (
            "연결된 학생의 기본 프로필 정보를 조회합니다. "
            "분반(반 이름), 담당 선생님, 수업 요일/시간, 과목, 학교, 학년 등을 반환합니다. "
            "학부모가 자녀의 반·분반·선생님·수업 시간·시간표·수업 요일을 물어볼 때 이 함수를 호출하세요. "
            "연결된 학생이 여러 명이고 특정 학생을 조회하려면 student_name을 전달하세요. "
            "student_name 미전달 시 연결된 전체 학생 프로필을 반환합니다."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "student_name": {
                    "type": "string",
                    "description": "조회할 학생 이름 또는 이름 일부. 예: '유미', '정유미'. 생략 시 연결된 전체 학생 조회.",
                },
            },
            "required": [],
        },
    },
]


def _build_profile(student) -> dict:
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


def execute_student_tool(
    function_name: str,
    args: dict,
    tenant_id: int,
    user_id: int,
    db: Session,
) -> dict:
    students = get_students_by_user(db, tenant_id, user_id)

    if not students:
        return {
            "error": "verification_required",
            "message": "연결된 학생이 없습니다. 먼저 학생 연동 인증을 완료해 주세요.",
        }

    name_filter = (args.get("student_name") or "").strip()
    if name_filter:
        matched = [s for s in students if name_filter in s.name]
        if not matched:
            names = ", ".join(s.name for s in students)
            return {
                "error": "student_not_found",
                "message": f"'{name_filter}' 이름의 학생을 찾을 수 없습니다. 연결된 학생: {names}",
            }
        students = matched

    if function_name == "get_my_student_profile":
        if len(students) == 1:
            return _build_profile(students[0])
        return {"profiles": [_build_profile(s) for s in students]}

    logger.warning("Unknown student function: %s", function_name)
    return {"error": "unknown_function", "message": f"알 수 없는 함수: {function_name}"}
