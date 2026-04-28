from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.attendance import AttendanceRecord, AttendanceStatus
from ..models.student import Student, StudentClass, StudentStatus
from ..models.user import User
from ..schemas.attendance import (
    AttendanceBulkUpsertRequest,
    AttendanceInitPresentRequest,
    AttendanceResponse,
    AttendanceRosterItem,
    AttendanceSummary,
    AttendanceUpdate,
)
from ..utils.dependencies import get_current_admin_user

router = APIRouter()


# ==================== GET / — Roster (left join) ====================


@router.get("", response_model=List[AttendanceRosterItem])
async def list_roster(
    attendance_date: date = Query(...),
    class_id: Optional[int] = Query(None),
    student_id: Optional[int] = Query(None),
    status: Optional[AttendanceStatus] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """날짜 기준 출결 roster 조회 (active 학생 + left join, Admin only)"""
    query = (
        db.query(
            Student.id.label("student_id"),
            Student.name.label("student_name"),
            Student.school_name,
            Student.grade,
            Student.class_id,
            StudentClass.name.label("class_name"),
            AttendanceRecord.status,
            AttendanceRecord.memo,
            AttendanceRecord.id.label("record_id"),
            AttendanceRecord.updated_at,
        )
        .outerjoin(
            AttendanceRecord,
            (AttendanceRecord.student_id == Student.id)
            & (AttendanceRecord.attendance_date == attendance_date)
            & (AttendanceRecord.tenant_id == current_user.tenant_id),
        )
        .outerjoin(StudentClass, Student.class_id == StudentClass.id)
        .filter(
            Student.tenant_id == current_user.tenant_id,
            Student.status == StudentStatus.active,
            (Student.class_id == None) | (StudentClass.status == 'active'),
        )
    )

    if class_id is not None:
        query = query.filter(Student.class_id == class_id)
    if student_id is not None:
        query = query.filter(Student.id == student_id)
    if status is not None:
        query = query.filter(AttendanceRecord.status == status)

    rows = query.order_by(Student.name).all()

    return [
        AttendanceRosterItem(
            student_id=row.student_id,
            student_name=row.student_name,
            school_name=row.school_name,
            grade=row.grade,
            class_id=row.class_id,
            class_name=row.class_name,
            status=row.status,
            memo=row.memo,
            record_id=row.record_id,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


# ==================== GET /summary ====================


@router.get("/summary", response_model=AttendanceSummary)
async def get_summary(
    attendance_date: date = Query(...),
    class_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """날짜 기준 출결 요약 통계 (roster와 동일한 학생 집합 기준, Admin only)"""
    # roster와 동일한 기준: active 학생 + 분반 필터
    student_query = (
        db.query(Student.id)
        .outerjoin(StudentClass, Student.class_id == StudentClass.id)
        .filter(
            Student.tenant_id == current_user.tenant_id,
            Student.status == StudentStatus.active,
            (Student.class_id == None) | (StudentClass.status == 'active'),
        )
    )
    if class_id is not None:
        student_query = student_query.filter(Student.class_id == class_id)

    student_ids = [row.id for row in student_query.all()]
    total_students = len(student_ids)

    if not student_ids:
        return AttendanceSummary(total_students=0, unrecorded_count=0)

    # 해당 학생 집합 기준으로 출결 레코드 집계
    counts = {
        row.status: row.cnt
        for row in db.query(
            AttendanceRecord.status, func.count(AttendanceRecord.id).label("cnt")
        )
        .filter(
            AttendanceRecord.tenant_id == current_user.tenant_id,
            AttendanceRecord.attendance_date == attendance_date,
            AttendanceRecord.student_id.in_(student_ids),
        )
        .group_by(AttendanceRecord.status)
        .all()
    }

    recorded = sum(counts.values())
    return AttendanceSummary(
        present=counts.get(AttendanceStatus.present, 0),
        absent=counts.get(AttendanceStatus.absent, 0),
        late=counts.get(AttendanceStatus.late, 0),
        early_leave=counts.get(AttendanceStatus.early_leave, 0),
        total_students=total_students,
        unrecorded_count=max(total_students - recorded, 0),
    )


# ==================== POST /bulk-upsert ====================


@router.post("/bulk-upsert", response_model=List[AttendanceResponse])
async def bulk_upsert(
    data: AttendanceBulkUpsertRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """날짜 기준 출결 일괄 upsert (Admin only)"""
    student_ids = [r.student_id for r in data.records]

    # tenant 소속 학생 검증
    valid_students = (
        db.query(Student.id, Student.class_id)
        .filter(
            Student.id.in_(student_ids),
            Student.tenant_id == current_user.tenant_id,
        )
        .all()
    )
    valid_map = {s.id: s.class_id for s in valid_students}
    invalid = set(student_ids) - set(valid_map.keys())
    if invalid:
        raise HTTPException(
            status_code=404,
            detail=f"존재하지 않는 학생 ID: {sorted(invalid)}",
        )

    now = datetime.now(timezone.utc)
    values = [
        {
            "tenant_id": current_user.tenant_id,
            "student_id": r.student_id,
            "class_id": valid_map[r.student_id],
            "attendance_date": data.attendance_date,
            "status": r.status.value,
            "memo": r.memo,
            "created_by": current_user.id,
            "created_at": now,
            "updated_at": now,
        }
        for r in data.records
    ]

    stmt = pg_insert(AttendanceRecord).values(values)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_attendance_student_date",
        set_={
            "status": stmt.excluded.status,
            "memo": stmt.excluded.memo,
            "updated_at": now,
        },
    ).returning(AttendanceRecord)

    result = db.execute(stmt)
    db.commit()

    return [
        AttendanceResponse.model_validate(row, from_attributes=True)
        for row in result.scalars()
    ]


# ==================== POST /init-present ====================


@router.post("/init-present", response_model=List[AttendanceResponse])
async def init_present(
    data: AttendanceInitPresentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """분반 전원을 출석으로 초기화 (기존 레코드 포함 upsert, Admin only)"""
    # class_id tenant 소속 검증
    cls = (
        db.query(StudentClass)
        .filter(
            StudentClass.id == data.class_id,
            StudentClass.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")

    students = (
        db.query(Student)
        .filter(
            Student.class_id == data.class_id,
            Student.tenant_id == current_user.tenant_id,
            Student.status == StudentStatus.active,
        )
        .all()
    )
    if not students:
        return []

    now = datetime.now(timezone.utc)
    values = [
        {
            "tenant_id": current_user.tenant_id,
            "student_id": s.id,
            "class_id": data.class_id,
            "attendance_date": data.attendance_date,
            "status": AttendanceStatus.present.value,
            "memo": None,
            "created_by": current_user.id,
            "created_at": now,
            "updated_at": now,
        }
        for s in students
    ]

    stmt = pg_insert(AttendanceRecord).values(values)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_attendance_student_date",
        set_={
            "status": AttendanceStatus.present.value,
            "memo": None,
            "updated_at": now,
        },
    ).returning(AttendanceRecord)

    result = db.execute(stmt)
    db.commit()

    return [
        AttendanceResponse.model_validate(row, from_attributes=True)
        for row in result.scalars()
    ]


# ==================== PUT /{record_id} ====================


@router.put("/{record_id}", response_model=AttendanceResponse)
async def update_record(
    record_id: int,
    data: AttendanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """단건 출결 수정 (Admin only)"""
    record = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.id == record_id,
            AttendanceRecord.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(record, field, value)

    record.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    return record
