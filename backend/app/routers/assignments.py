from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.assignment import (
    Assignment,
    AssignmentSubmission,
    AssignmentSubmissionStatus,
)
from ..models.student import Student, StudentClass, StudentStatus
from ..models.user import User
from ..schemas.assignment import (
    AssignmentCreate,
    AssignmentDisplayStatus,
    AssignmentResponse,
    AssignmentSummary,
    AssignmentUpdate,
    SubmissionBulkUpsertRequest,
    SubmissionResponse,
    SubmissionRosterItem,
)
from ..utils.dependencies import get_current_admin_user

router = APIRouter()


# ==================== 헬퍼: display_status 계산 ====================


def calc_display_status(
    status: AssignmentSubmissionStatus,
    submitted_at: Optional[datetime],
    due_date: date,
    today: date,
) -> AssignmentDisplayStatus:
    if status == AssignmentSubmissionStatus.excused:
        return AssignmentDisplayStatus.excused
    if status == AssignmentSubmissionStatus.submitted:
        if submitted_at and submitted_at.date() > due_date:
            return AssignmentDisplayStatus.late
        return AssignmentDisplayStatus.submitted
    # assigned
    if today > due_date:
        return AssignmentDisplayStatus.missing
    return AssignmentDisplayStatus.assigned


# ==================== 헬퍼: submission_rate 계산 ====================


def calc_submission_rate(submissions: list) -> float:
    non_excused = [
        s for s in submissions if s.status != AssignmentSubmissionStatus.excused
    ]
    if not non_excused:
        return 0.0
    submitted = [
        s for s in non_excused if s.status == AssignmentSubmissionStatus.submitted
    ]
    return round(len(submitted) / len(non_excused) * 100, 1)


# ==================== GET / — 과제 목록 ====================


@router.get("", response_model=List[AssignmentResponse])
async def list_assignments(
    class_id: Optional[int] = Query(None),
    subject: Optional[str] = Query(None),
    due_date_from: Optional[date] = Query(None),
    due_date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """과제 목록 조회 (Admin only)"""
    query = (
        db.query(Assignment, StudentClass.name.label("class_name"))
        .outerjoin(StudentClass, Assignment.class_id == StudentClass.id)
        .filter(Assignment.tenant_id == current_user.tenant_id)
    )

    if class_id is not None:
        query = query.filter(Assignment.class_id == class_id)
    if subject is not None:
        query = query.filter(Assignment.subject == subject)
    if due_date_from is not None:
        query = query.filter(Assignment.due_date >= due_date_from)
    if due_date_to is not None:
        query = query.filter(Assignment.due_date <= due_date_to)

    rows = query.order_by(Assignment.due_date.desc(), Assignment.id.desc()).all()

    result = []
    for assignment, class_name in rows:
        rate = calc_submission_rate(assignment.submissions)
        result.append(
            AssignmentResponse(
                id=assignment.id,
                tenant_id=assignment.tenant_id,
                class_id=assignment.class_id,
                class_name=class_name,
                title=assignment.title,
                subject=assignment.subject,
                assigned_date=assignment.assigned_date,
                due_date=assignment.due_date,
                description=assignment.description,
                memo=assignment.memo,
                created_by=assignment.created_by,
                created_at=assignment.created_at,
                updated_at=assignment.updated_at,
                submission_rate=rate,
            )
        )
    return result


# ==================== GET /summary — 요약 카드 ====================


@router.get("/summary", response_model=AssignmentSummary)
async def get_summary(
    class_id: Optional[int] = Query(None),
    subject: Optional[str] = Query(None),
    due_date_from: Optional[date] = Query(None),
    due_date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """요약 카드 통계 — 제출 row 기준 (Admin only)"""
    today = date.today()

    # 대상 과제 ID 집합 (필터 적용)
    assign_query = db.query(Assignment.id, Assignment.due_date).filter(
        Assignment.tenant_id == current_user.tenant_id
    )
    if class_id is not None:
        assign_query = assign_query.filter(Assignment.class_id == class_id)
    if subject is not None:
        assign_query = assign_query.filter(Assignment.subject == subject)
    if due_date_from is not None:
        assign_query = assign_query.filter(Assignment.due_date >= due_date_from)
    if due_date_to is not None:
        assign_query = assign_query.filter(Assignment.due_date <= due_date_to)

    assignments = assign_query.all()
    assignment_map = {a.id: a.due_date for a in assignments}
    assignment_ids = list(assignment_map.keys())

    ongoing_count = sum(1 for dd in assignment_map.values() if dd >= today)
    due_today_count = sum(1 for dd in assignment_map.values() if dd == today)

    if not assignment_ids:
        return AssignmentSummary(
            ongoing_count=ongoing_count,
            due_today_count=due_today_count,
        )

    # 제출 row 기준 missing / late 집계
    submissions = (
        db.query(
            AssignmentSubmission.assignment_id,
            AssignmentSubmission.status,
            AssignmentSubmission.submitted_at,
        )
        .filter(
            AssignmentSubmission.tenant_id == current_user.tenant_id,
            AssignmentSubmission.assignment_id.in_(assignment_ids),
        )
        .all()
    )

    missing_count = 0
    late_count = 0
    for sub in submissions:
        due = assignment_map[sub.assignment_id]
        if sub.status == AssignmentSubmissionStatus.assigned and today > due:
            missing_count += 1
        elif (
            sub.status == AssignmentSubmissionStatus.submitted
            and sub.submitted_at
            and sub.submitted_at.date() > due
        ):
            late_count += 1

    return AssignmentSummary(
        ongoing_count=ongoing_count,
        due_today_count=due_today_count,
        missing_count=missing_count,
        late_count=late_count,
    )


# ==================== POST / — 과제 생성 ====================


@router.post("", response_model=AssignmentResponse, status_code=201)
async def create_assignment(
    data: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """과제 생성 + 분반 active 학생 전원 submission 자동 생성 (Admin only)"""
    # 분반 tenant 소속 검증
    cls = (
        db.query(StudentClass)
        .filter(
            StudentClass.id == data.class_id,
            StudentClass.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not cls:
        raise HTTPException(status_code=404, detail="분반을 찾을 수 없습니다.")

    assignment = Assignment(
        tenant_id=current_user.tenant_id,
        class_id=data.class_id,
        title=data.title,
        subject=data.subject,
        assigned_date=data.assigned_date,
        due_date=data.due_date,
        description=data.description,
        memo=data.memo,
        created_by=current_user.id,
    )
    db.add(assignment)
    db.flush()  # assignment.id 확보

    # 분반 active 학생 전원에게 submission 자동 생성
    students = (
        db.query(Student.id)
        .filter(
            Student.class_id == data.class_id,
            Student.tenant_id == current_user.tenant_id,
            Student.status == StudentStatus.active,
        )
        .all()
    )

    if students:
        now = datetime.now(timezone.utc)
        submission_values = [
            {
                "tenant_id": current_user.tenant_id,
                "assignment_id": assignment.id,
                "student_id": s.id,
                "status": AssignmentSubmissionStatus.assigned.value,
                "created_at": now,
            }
            for s in students
        ]
        stmt = pg_insert(AssignmentSubmission).values(submission_values)
        stmt = stmt.on_conflict_do_nothing(
            constraint="uq_submission_assignment_student"
        )
        db.execute(stmt)

    db.commit()
    db.refresh(assignment)

    return AssignmentResponse(
        id=assignment.id,
        tenant_id=assignment.tenant_id,
        class_id=assignment.class_id,
        class_name=cls.name,
        title=assignment.title,
        subject=assignment.subject,
        assigned_date=assignment.assigned_date,
        due_date=assignment.due_date,
        description=assignment.description,
        memo=assignment.memo,
        created_by=assignment.created_by,
        created_at=assignment.created_at,
        updated_at=assignment.updated_at,
        submission_rate=calc_submission_rate(assignment.submissions),
    )


# ==================== PUT /{assignment_id} — 과제 수정 ====================


@router.put("/{assignment_id}", response_model=AssignmentResponse)
async def update_assignment(
    assignment_id: int,
    data: AssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """과제 수정 (class_id 변경 불가, Admin only)"""
    assignment = (
        db.query(Assignment)
        .filter(
            Assignment.id == assignment_id,
            Assignment.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="과제를 찾을 수 없습니다.")

    # assigned_date/due_date 한 쪽만 수정하는 경우 기존 값과 교차 검증
    new_assigned = data.assigned_date or assignment.assigned_date
    new_due = data.due_date or assignment.due_date
    if new_assigned > new_due:
        raise HTTPException(
            status_code=422,
            detail="부여일(assigned_date)은 마감일(due_date)보다 이후일 수 없습니다.",
        )

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(assignment, field, value)

    assignment.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(assignment)

    class_name = None
    if assignment.class_id:
        cls = (
            db.query(StudentClass)
            .filter(StudentClass.id == assignment.class_id)
            .first()
        )
        class_name = cls.name if cls else None

    return AssignmentResponse(
        id=assignment.id,
        tenant_id=assignment.tenant_id,
        class_id=assignment.class_id,
        class_name=class_name,
        title=assignment.title,
        subject=assignment.subject,
        assigned_date=assignment.assigned_date,
        due_date=assignment.due_date,
        description=assignment.description,
        memo=assignment.memo,
        created_by=assignment.created_by,
        created_at=assignment.created_at,
        updated_at=assignment.updated_at,
        submission_rate=calc_submission_rate(assignment.submissions),
    )


# ==================== DELETE /{assignment_id} — 과제 삭제 ====================


@router.delete("/{assignment_id}", status_code=204, response_class=Response)
async def delete_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """과제 삭제 (submissions CASCADE, Admin only)"""
    assignment = (
        db.query(Assignment)
        .filter(
            Assignment.id == assignment_id,
            Assignment.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="과제를 찾을 수 없습니다.")

    db.delete(assignment)
    db.commit()
    return Response(status_code=204)


# ==================== GET /{assignment_id}/submissions — 제출 roster ====================


@router.get("/{assignment_id}/submissions", response_model=List[SubmissionRosterItem])
async def list_submissions(
    assignment_id: int,
    student_name: Optional[str] = Query(None),
    display_status: Optional[AssignmentDisplayStatus] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """제출 roster 조회 — snapshot 기준 (Admin only)"""
    assignment = (
        db.query(Assignment)
        .filter(
            Assignment.id == assignment_id,
            Assignment.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="과제를 찾을 수 없습니다.")

    query = (
        db.query(
            AssignmentSubmission.id.label("record_id"),
            AssignmentSubmission.student_id,
            AssignmentSubmission.status,
            AssignmentSubmission.submitted_at,
            AssignmentSubmission.score,
            AssignmentSubmission.feedback,
            AssignmentSubmission.memo,
            AssignmentSubmission.updated_at,
            Student.name.label("student_name"),
            Student.class_id,
            StudentClass.name.label("class_name"),
        )
        .join(Student, AssignmentSubmission.student_id == Student.id)
        .outerjoin(StudentClass, Student.class_id == StudentClass.id)
        .filter(
            AssignmentSubmission.assignment_id == assignment_id,
            AssignmentSubmission.tenant_id == current_user.tenant_id,
        )
    )

    if student_name:
        query = query.filter(Student.name.ilike(f"%{student_name}%"))

    rows = query.order_by(Student.name).all()

    today = date.today()
    result = []
    for row in rows:
        ds = calc_display_status(
            row.status, row.submitted_at, assignment.due_date, today
        )

        # display_status 필터 적용
        if display_status is not None and ds != display_status:
            continue

        result.append(
            SubmissionRosterItem(
                record_id=row.record_id,
                student_id=row.student_id,
                student_name=row.student_name,
                class_id=row.class_id,
                class_name=row.class_name,
                status=row.status,
                display_status=ds,
                submitted_at=row.submitted_at,
                score=row.score,
                feedback=row.feedback,
                memo=row.memo,
                updated_at=row.updated_at,
            )
        )
    return result


# ==================== POST /{assignment_id}/submissions/bulk-upsert ====================


@router.post(
    "/{assignment_id}/submissions/bulk-upsert",
    response_model=List[SubmissionResponse],
)
async def bulk_upsert_submissions(
    assignment_id: int,
    data: SubmissionBulkUpsertRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """제출 상태 일괄 upsert — snapshot 학생만 허용 (Admin only)"""
    assignment = (
        db.query(Assignment)
        .filter(
            Assignment.id == assignment_id,
            Assignment.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="과제를 찾을 수 없습니다.")

    # snapshot 보호: 요청 student_id가 기존 submission row에 있는지 검증
    request_student_ids = {r.student_id for r in data.records}
    existing = (
        db.query(AssignmentSubmission.student_id)
        .filter(
            AssignmentSubmission.assignment_id == assignment_id,
            AssignmentSubmission.tenant_id == current_user.tenant_id,
        )
        .all()
    )
    existing_student_ids = {row.student_id for row in existing}
    invalid = request_student_ids - existing_student_ids
    if invalid:
        raise HTTPException(
            status_code=404,
            detail=f"해당 과제의 대상 학생이 아닙니다: {sorted(invalid)}",
        )

    now = datetime.now(timezone.utc)
    values = [
        {
            "tenant_id": current_user.tenant_id,
            "assignment_id": assignment_id,
            "student_id": r.student_id,
            "status": r.status.value,
            "submitted_at": r.submitted_at,
            "score": r.score,
            "feedback": r.feedback,
            "memo": r.memo,
            "created_at": now,
            "updated_at": now,
        }
        for r in data.records
    ]

    stmt = pg_insert(AssignmentSubmission).values(values)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_submission_assignment_student",
        set_={
            "status": stmt.excluded.status,
            "submitted_at": stmt.excluded.submitted_at,
            "score": stmt.excluded.score,
            "feedback": stmt.excluded.feedback,
            "memo": stmt.excluded.memo,
            "updated_at": now,
        },
    ).returning(AssignmentSubmission)

    result = db.execute(stmt)
    db.commit()

    return [
        SubmissionResponse.model_validate(row, from_attributes=True)
        for row in result.scalars()
    ]
