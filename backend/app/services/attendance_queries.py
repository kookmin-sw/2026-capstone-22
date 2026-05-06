import logging
from datetime import date
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..models.attendance import AttendanceRecord, AttendanceStatus
from ..models.student import Student, StudentStatus
from ..models.student_access_link import AccessLinkStatus, StudentAccessLink

logger = logging.getLogger(__name__)


class MultipleStudentsError(Exception):
    pass


def get_students_by_user(db: Session, tenant_id: int, user_id: int) -> list:
    """학부모 user_id로 연결된 활성 학생 목록을 반환한다 (0~N명).

    MultipleStudentsError를 발생시키지 않으며 항상 list를 반환한다.
    """
    links = (
        db.query(StudentAccessLink)
        .join(Student, StudentAccessLink.student_id == Student.id)
        .filter(
            StudentAccessLink.tenant_id == tenant_id,
            StudentAccessLink.user_id == user_id,
            StudentAccessLink.status == AccessLinkStatus.active,
            Student.status == StudentStatus.active,
        )
        .all()
    )
    return [link.student for link in links]


def get_student_by_user(db: Session, tenant_id: int, user_id: int) -> Optional[Student]:
    """학부모 user_id로 연결된 학생 1명을 반환한다.

    Returns:
        Student if exactly one active link exists, None if zero links.
    Raises:
        MultipleStudentsError: if two or more active links exist.
    """
    links = (
        db.query(StudentAccessLink)
        .join(Student, StudentAccessLink.student_id == Student.id)
        .filter(
            StudentAccessLink.tenant_id == tenant_id,
            StudentAccessLink.user_id == user_id,
            StudentAccessLink.status == AccessLinkStatus.active,
            Student.status == StudentStatus.active,
        )
        .all()
    )

    if len(links) == 0:
        return None
    if len(links) == 1:
        return links[0].student
    raise MultipleStudentsError(
        f"user_id={user_id} has {len(links)} active student links"
    )


def fetch_attendance_summary(
    db: Session,
    tenant_id: int,
    student_id: int,
    from_date: date,
    to_date: date,
) -> dict:
    """기간 내 출결 현황 요약을 반환한다.

    attendance_rate = (present + late + early_leave) / recorded_count * 100
    recorded_count == 0이면 attendance_rate = None
    """
    student = (
        db.query(Student)
        .options(joinedload(Student.student_class))
        .filter(Student.id == student_id, Student.tenant_id == tenant_id)
        .first()
    )
    if not student:
        raise ValueError(f"Student {student_id} not found in tenant {tenant_id}")

    class_name = student.student_class.name if student.student_class else None

    rows = (
        db.query(AttendanceRecord.status, func.count().label("cnt"))
        .filter(
            AttendanceRecord.tenant_id == tenant_id,
            AttendanceRecord.student_id == student_id,
            AttendanceRecord.attendance_date >= from_date,
            AttendanceRecord.attendance_date <= to_date,
        )
        .group_by(AttendanceRecord.status)
        .all()
    )

    counts = {row.status: row.cnt for row in rows}
    present_count = counts.get(AttendanceStatus.present, 0)
    absent_count = counts.get(AttendanceStatus.absent, 0)
    late_count = counts.get(AttendanceStatus.late, 0)
    early_leave_count = counts.get(AttendanceStatus.early_leave, 0)
    recorded_count = present_count + absent_count + late_count + early_leave_count

    if recorded_count == 0:
        attendance_rate = None
    else:
        attended = present_count + late_count + early_leave_count
        attendance_rate = round(attended / recorded_count * 100, 1)

    return {
        "student_id": student_id,
        "student_name": student.name,
        "class_name": class_name,
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "present_count": present_count,
        "absent_count": absent_count,
        "late_count": late_count,
        "early_leave_count": early_leave_count,
        "recorded_count": recorded_count,
        "attendance_rate": attendance_rate,
    }


def fetch_attendance_records(
    db: Session,
    tenant_id: int,
    student_id: int,
    from_date: date,
    to_date: date,
    status_filter: Optional[AttendanceStatus] = None,
) -> dict:
    """기간 내 출결 상세 기록을 attendance_date DESC 순으로 반환한다.

    status_filter는 AttendanceStatus enum 값만 받는다 (검증은 executor 담당).
    """
    student = (
        db.query(Student)
        .filter(Student.id == student_id, Student.tenant_id == tenant_id)
        .first()
    )
    if not student:
        raise ValueError(f"Student {student_id} not found in tenant {tenant_id}")

    query = db.query(AttendanceRecord).filter(
        AttendanceRecord.tenant_id == tenant_id,
        AttendanceRecord.student_id == student_id,
        AttendanceRecord.attendance_date >= from_date,
        AttendanceRecord.attendance_date <= to_date,
    )

    if status_filter is not None:
        query = query.filter(AttendanceRecord.status == status_filter)

    records = query.order_by(AttendanceRecord.attendance_date.desc()).all()

    return {
        "student_id": student_id,
        "student_name": student.name,
        "records": [
            {
                "date": r.attendance_date.isoformat(),
                "status": r.status.value,
                "memo": r.memo,
            }
            for r in records
        ],
    }
