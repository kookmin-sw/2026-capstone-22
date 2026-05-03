import logging
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from ..models.assignment import (
    Assignment,
    AssignmentSubmission,
    AssignmentSubmissionStatus,
)
from ..models.student import Student, StudentClass
from .attendance_queries import MultipleStudentsError, get_student_by_user  # noqa: F401

logger = logging.getLogger(__name__)


def _calc_display_status(
    status: AssignmentSubmissionStatus,
    submitted_at: Optional[datetime],
    due_date: date,
    today: date,
) -> str:
    """DB raw status + 날짜 기반으로 표시용 display_status 문자열을 계산한다."""
    if status == AssignmentSubmissionStatus.excused:
        return "excused"
    if status == AssignmentSubmissionStatus.submitted:
        if submitted_at and submitted_at.date() > due_date:
            return "late"
        return "submitted"
    # status == assigned
    if today > due_date:
        return "missing"
    return "assigned"


def fetch_assignment_summary(
    db: Session,
    tenant_id: int,
    student_id: int,
    from_date: date,
    to_date: date,
) -> dict:
    """기간 내 과제 현황 요약을 반환한다.

    due_date 기준으로 from_date~to_date 범위를 필터하며,
    display_status는 raw status + due_date + submitted_at + 오늘 날짜로 서버에서 계산한다.
    submission_rate = excused 제외 과제 중 raw submitted 비율 (지각 제출 포함).
    """
    student = (
        db.query(Student)
        .filter(Student.id == student_id, Student.tenant_id == tenant_id)
        .first()
    )
    if not student:
        raise ValueError(f"Student {student_id} not found in tenant {tenant_id}")

    current_class_name = student.student_class.name if student.student_class else None

    rows = (
        db.query(AssignmentSubmission, Assignment)
        .join(Assignment, AssignmentSubmission.assignment_id == Assignment.id)
        .filter(
            AssignmentSubmission.tenant_id == tenant_id,
            Assignment.tenant_id == tenant_id,
            AssignmentSubmission.student_id == student_id,
            Assignment.due_date >= from_date,
            Assignment.due_date <= to_date,
        )
        .all()
    )

    today = date.today()

    submitted_count = 0
    late_count = 0
    missing_count = 0
    assigned_count = 0
    excused_count = 0
    due_today_count = 0
    non_excused_count = 0
    raw_submitted_count = 0

    for sub, assignment in rows:
        display_status = _calc_display_status(
            sub.status, sub.submitted_at, assignment.due_date, today
        )
        if display_status == "submitted":
            submitted_count += 1
        elif display_status == "late":
            late_count += 1
        elif display_status == "missing":
            missing_count += 1
        elif display_status == "assigned":
            assigned_count += 1
        elif display_status == "excused":
            excused_count += 1

        if assignment.due_date == today:
            due_today_count += 1

        if sub.status != AssignmentSubmissionStatus.excused:
            non_excused_count += 1
            if sub.status == AssignmentSubmissionStatus.submitted:
                raw_submitted_count += 1

    assignment_count = len(rows)
    submission_rate = (
        round(raw_submitted_count / non_excused_count * 100, 1)
        if non_excused_count > 0
        else 0.0
    )

    return {
        "student_id": student_id,
        "student_name": student.name,
        "current_class_name": current_class_name,
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "assignment_count": assignment_count,
        "submitted_count": submitted_count,
        "late_count": late_count,
        "missing_count": missing_count,
        "assigned_count": assigned_count,
        "excused_count": excused_count,
        "due_today_count": due_today_count,
        "submission_rate": submission_rate,
    }


def fetch_assignment_submissions(
    db: Session,
    tenant_id: int,
    student_id: int,
    from_date: date,
    to_date: date,
    display_status_filter: Optional[str] = None,
) -> dict:
    """기간 내 과제 제출 상세 목록을 due_date DESC 순으로 반환한다.

    display_status_filter는 계산된 display_status 값(assigned|missing|submitted|late|excused)으로 필터한다.
    assignment_class_name은 학생 현재 분반이 아니라 해당 과제가 속한 분반 기준.
    """
    student = (
        db.query(Student)
        .filter(Student.id == student_id, Student.tenant_id == tenant_id)
        .first()
    )
    if not student:
        raise ValueError(f"Student {student_id} not found in tenant {tenant_id}")

    rows = (
        db.query(AssignmentSubmission, Assignment, StudentClass)
        .join(Assignment, AssignmentSubmission.assignment_id == Assignment.id)
        .outerjoin(StudentClass, Assignment.class_id == StudentClass.id)
        .filter(
            AssignmentSubmission.tenant_id == tenant_id,
            Assignment.tenant_id == tenant_id,
            AssignmentSubmission.student_id == student_id,
            Assignment.due_date >= from_date,
            Assignment.due_date <= to_date,
        )
        .order_by(Assignment.due_date.desc())
        .all()
    )

    today = date.today()

    submissions = []
    for sub, assignment, class_obj in rows:
        display_status = _calc_display_status(
            sub.status, sub.submitted_at, assignment.due_date, today
        )

        if (
            display_status_filter is not None
            and display_status != display_status_filter
        ):
            continue

        submissions.append(
            {
                "assignment_id": assignment.id,
                "title": assignment.title,
                "subject": assignment.subject,
                "assigned_date": assignment.assigned_date.isoformat(),
                "due_date": assignment.due_date.isoformat(),
                "assignment_class_name": class_obj.name if class_obj else None,
                "display_status": display_status,
                "submitted_at": (
                    sub.submitted_at.isoformat() if sub.submitted_at else None
                ),
                "score": float(sub.score) if sub.score is not None else None,
                "feedback": sub.feedback,
                "memo": sub.memo,
            }
        )

    return {
        "student_id": student_id,
        "student_name": student.name,
        "submissions": submissions,
    }
