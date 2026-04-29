import logging
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from ..models.exam import Exam, ExamResult, ExamResultStatus
from ..models.student import Student, StudentClass
from .attendance_queries import MultipleStudentsError, get_student_by_user  # noqa: F401

logger = logging.getLogger(__name__)


def fetch_exam_summary(
    db: Session,
    tenant_id: int,
    student_id: int,
    from_date: date,
    to_date: date,
) -> dict:
    """기간 내 시험 성적 요약을 반환한다.

    average_score_pct / highest_score_pct = score / max_score * 100 (completed + score 있는 것만)
    시험이 없거나 완료된 시험이 없으면 해당 필드는 None.
    """
    student = (
        db.query(Student)
        .options(joinedload(Student.student_class))
        .filter(Student.id == student_id, Student.tenant_id == tenant_id)
        .first()
    )
    if not student:
        raise ValueError(f"Student {student_id} not found in tenant {tenant_id}")

    current_class_name = student.student_class.name if student.student_class else None

    rows = (
        db.query(ExamResult, Exam)
        .join(Exam, ExamResult.exam_id == Exam.id)
        .filter(
            ExamResult.tenant_id == tenant_id,
            Exam.tenant_id == tenant_id,
            ExamResult.student_id == student_id,
            Exam.exam_date >= from_date,
            Exam.exam_date <= to_date,
        )
        .all()
    )

    exam_count = len(rows)
    completed_rows = [
        (er, exam) for er, exam in rows if er.status == ExamResultStatus.completed
    ]
    completed_count = len(completed_rows)

    score_pcts = [
        float(er.score) / float(exam.max_score) * 100
        for er, exam in completed_rows
        if er.score is not None and exam.max_score and float(exam.max_score) > 0
    ]

    average_score_pct = (
        round(sum(score_pcts) / len(score_pcts), 1) if score_pcts else None
    )
    highest_score_pct = round(max(score_pcts), 1) if score_pcts else None

    # exam_date DESC, exam_id DESC 로 tie-break
    completed_sorted = sorted(
        completed_rows,
        key=lambda x: (x[1].exam_date, x[1].id),
        reverse=True,
    )
    latest_exam = completed_sorted[0][1] if completed_sorted else None

    return {
        "student_id": student_id,
        "student_name": student.name,
        "current_class_name": current_class_name,
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "exam_count": exam_count,
        "completed_count": completed_count,
        "average_score_pct": average_score_pct,
        "highest_score_pct": highest_score_pct,
        "latest_completed_exam_date": (
            latest_exam.exam_date.isoformat() if latest_exam else None
        ),
        "latest_completed_exam_title": latest_exam.title if latest_exam else None,
    }


def fetch_exam_results(
    db: Session,
    tenant_id: int,
    student_id: int,
    from_date: date,
    to_date: date,
    status_filter: Optional[ExamResultStatus] = None,
) -> dict:
    """기간 내 시험 결과 상세 목록을 exam_date DESC 순으로 반환한다.

    status_filter는 ExamResultStatus enum 값만 받는다 (검증은 executor 담당).
    exam_class_name은 학생 현재 분반이 아니라 해당 시험이 속한 분반 기준.
    """
    student = (
        db.query(Student)
        .filter(Student.id == student_id, Student.tenant_id == tenant_id)
        .first()
    )
    if not student:
        raise ValueError(f"Student {student_id} not found in tenant {tenant_id}")

    query = (
        db.query(ExamResult, Exam, StudentClass)
        .join(Exam, ExamResult.exam_id == Exam.id)
        .outerjoin(StudentClass, Exam.class_id == StudentClass.id)
        .filter(
            ExamResult.tenant_id == tenant_id,
            Exam.tenant_id == tenant_id,
            ExamResult.student_id == student_id,
            Exam.exam_date >= from_date,
            Exam.exam_date <= to_date,
        )
    )

    if status_filter is not None:
        query = query.filter(ExamResult.status == status_filter)

    rows = query.order_by(Exam.exam_date.desc()).all()

    results = []
    for er, exam, class_obj in rows:
        if er.score is not None and exam.max_score and float(exam.max_score) > 0:
            score_pct = round(float(er.score) / float(exam.max_score) * 100, 1)
        else:
            score_pct = None

        results.append(
            {
                "exam_id": exam.id,
                "title": exam.title,
                "exam_date": exam.exam_date.isoformat(),
                "exam_class_name": class_obj.name if class_obj else None,
                "exam_type": exam.exam_type,
                "status": er.status.value,
                "score": float(er.score) if er.score is not None else None,
                "max_score": float(exam.max_score),
                "score_pct": score_pct,
                "grade": er.grade,
                "comment": er.comment,
            }
        )

    return {
        "student_id": student_id,
        "student_name": student.name,
        "results": results,
    }
