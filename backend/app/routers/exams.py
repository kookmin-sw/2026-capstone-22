from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.exam import Exam, ExamResult, ExamResultStatus
from ..models.student import Student, StudentClass, StudentStatus
from ..models.user import User
from ..schemas.exam import (
    ExamCreate,
    ExamResponse,
    ExamResultResponse,
    ExamResultsBulkUpsertRequest,
    ExamResultsPayload,
    ExamSummaryResponse,
    ExamUpdate,
)
from ..utils.dependencies import get_current_admin_user

router = APIRouter()


# ==================== 헬퍼: avg_score 계산 ====================


def calc_avg_score(results: list) -> Optional[Decimal]:
    scored = [
        r.score
        for r in results
        if r.status == ExamResultStatus.completed and r.score is not None
    ]
    if not scored:
        return None
    return round(Decimal(sum(float(s) for s in scored)) / len(scored), 2)


# ==================== 헬퍼: rank_in_class 계산 ====================


def assign_ranks(results: list) -> dict:
    """student_id → rank 딕셔너리 반환 (completed + score 있는 학생만, 나머지 None)"""
    scored = sorted(
        [
            (r.student_id, float(r.score))
            for r in results
            if r.status == ExamResultStatus.completed and r.score is not None
        ],
        key=lambda x: x[1],
        reverse=True,
    )
    ranks = {}
    for i, (sid, score) in enumerate(scored):
        # 동점 처리: 앞 학생과 점수 같으면 같은 rank
        if i > 0 and score == scored[i - 1][1]:
            ranks[sid] = ranks[scored[i - 1][0]]
        else:
            ranks[sid] = i + 1
    return ranks


# ==================== 헬퍼: declining_count 계산 ====================


def calc_declining_count(
    db: Session, exam: Exam, result_rows: list, tenant_id: int
) -> int:
    """현재 시험 대비 직전 시험(동일 subject + exam_type) 성적 하락 학생 수"""
    completed_scores = {
        r.student_id: (float(r.score), float(exam.max_score))
        for r in result_rows
        if r.status == ExamResultStatus.completed and r.score is not None
    }
    if not completed_scores:
        return 0

    if not exam.class_id:
        return 0

    current_type = exam.exam_type

    # 동일 class_id + 동일 exam_type의 이전 시험 목록 조회
    prev_exam_q = db.query(Exam.id, Exam.max_score).filter(
        Exam.tenant_id == tenant_id,
        Exam.class_id == exam.class_id,
        Exam.exam_date < exam.exam_date,
    )
    if current_type:
        prev_exam_q = prev_exam_q.filter(Exam.exam_type == current_type)

    prev_exams = prev_exam_q.all()
    if not prev_exams:
        return 0

    prev_exam_ids = [e.id for e in prev_exams]
    prev_max_map = {e.id: float(e.max_score) for e in prev_exams}

    # 해당 학생들의 이전 시험 결과 조회 (최신순 정렬)
    prev_results = (
        db.query(
            ExamResult.student_id,
            ExamResult.exam_id,
            ExamResult.score,
            Exam.exam_date,
        )
        .join(Exam, ExamResult.exam_id == Exam.id)
        .filter(
            ExamResult.tenant_id == tenant_id,
            ExamResult.student_id.in_(list(completed_scores.keys())),
            ExamResult.exam_id.in_(prev_exam_ids),
            ExamResult.status == ExamResultStatus.completed,
            ExamResult.score.isnot(None),
        )
        .order_by(ExamResult.student_id, Exam.exam_date.desc())
        .all()
    )

    # 학생별 직전 시험 점수 (최신순이므로 첫 번째가 직전)
    latest_prev: dict = {}
    for r in prev_results:
        if r.student_id not in latest_prev:
            latest_prev[r.student_id] = (float(r.score), prev_max_map[r.exam_id])

    declining = 0
    for sid, (curr_score, curr_max) in completed_scores.items():
        if sid in latest_prev:
            prev_score, prev_max = latest_prev[sid]
            if (curr_score / curr_max) < (prev_score / prev_max):
                declining += 1

    return declining


# ==================== GET /summary — 최근 30일 시험 수 ====================


@router.get("/summary", response_model=ExamSummaryResponse)
async def get_summary(
    class_id: Optional[int] = Query(None),
    days: int = Query(30, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """최근 N일(기본 30일) 시험 수 반환 (Admin only)"""
    since = date.today() - timedelta(days=days)
    q = db.query(Exam).filter(
        Exam.tenant_id == current_user.tenant_id,
        Exam.exam_date >= since,
    )
    if class_id is not None:
        q = q.filter(Exam.class_id == class_id)

    recent_count = q.count()
    return ExamSummaryResponse(recent_count=recent_count)


# ==================== GET / — 시험 목록 ====================


@router.get("", response_model=List[ExamResponse])
async def list_exams(
    class_id: Optional[int] = Query(None),
    exam_date: Optional[date] = Query(None),
    exam_title: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """시험 목록 조회 (Admin only)"""
    query = (
        db.query(Exam, StudentClass.name.label("class_name"))
        .outerjoin(StudentClass, Exam.class_id == StudentClass.id)
        .filter(Exam.tenant_id == current_user.tenant_id)
    )

    if class_id is not None:
        query = query.filter(Exam.class_id == class_id)
    if exam_date is not None:
        query = query.filter(Exam.exam_date == exam_date)
    if exam_title:
        query = query.filter(Exam.title.ilike(f"%{exam_title}%"))

    rows = query.order_by(Exam.exam_date.desc(), Exam.id.desc()).all()

    result = []
    for exam, class_name in rows:
        avg = calc_avg_score(exam.results)
        result.append(
            ExamResponse(
                id=exam.id,
                tenant_id=exam.tenant_id,
                class_id=exam.class_id,
                class_name=class_name,
                title=exam.title,
                exam_date=exam.exam_date,
                max_score=exam.max_score,
                exam_type=exam.exam_type,
                memo=exam.memo,
                created_by=exam.created_by,
                created_at=exam.created_at,
                updated_at=exam.updated_at,
                avg_score=avg,
            )
        )
    return result


# ==================== POST / — 시험 생성 ====================


@router.post("", response_model=ExamResponse, status_code=201)
async def create_exam(
    data: ExamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """시험 생성 + 분반 active 학생 전원 exam_result 스냅샷 자동 생성 (Admin only)"""
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

    exam = Exam(
        tenant_id=current_user.tenant_id,
        class_id=data.class_id,
        title=data.title,
        exam_date=data.exam_date,
        max_score=data.max_score,
        exam_type=data.exam_type,
        memo=data.memo,
        created_by=current_user.id,
    )
    db.add(exam)
    db.flush()  # exam.id 확보

    # 분반 active 학생 전원에게 exam_result(status='pending') 자동 생성
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
        result_values = [
            {
                "tenant_id": current_user.tenant_id,
                "exam_id": exam.id,
                "student_id": s.id,
                "status": ExamResultStatus.pending.value,
                "created_at": now,
            }
            for s in students
        ]
        stmt = pg_insert(ExamResult).values(result_values)
        stmt = stmt.on_conflict_do_nothing(constraint="uq_exam_result_exam_student")
        db.execute(stmt)

    db.commit()
    db.refresh(exam)

    return ExamResponse(
        id=exam.id,
        tenant_id=exam.tenant_id,
        class_id=exam.class_id,
        class_name=cls.name,
        title=exam.title,
        exam_date=exam.exam_date,
        max_score=exam.max_score,
        exam_type=exam.exam_type,
        memo=exam.memo,
        created_by=exam.created_by,
        created_at=exam.created_at,
        updated_at=exam.updated_at,
        avg_score=None,
    )


# ==================== PUT /{exam_id} — 시험 수정 ====================


@router.put("/{exam_id}", response_model=ExamResponse)
async def update_exam(
    exam_id: int,
    data: ExamUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """시험 수정 (class_id 변경 불가, Admin only)"""
    exam = (
        db.query(Exam)
        .filter(
            Exam.id == exam_id,
            Exam.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not exam:
        raise HTTPException(status_code=404, detail="시험을 찾을 수 없습니다.")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(exam, field, value)

    exam.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(exam)

    class_name = None
    if exam.class_id:
        cls = db.query(StudentClass).filter(StudentClass.id == exam.class_id).first()
        class_name = cls.name if cls else None

    return ExamResponse(
        id=exam.id,
        tenant_id=exam.tenant_id,
        class_id=exam.class_id,
        class_name=class_name,
        title=exam.title,
        exam_date=exam.exam_date,
        max_score=exam.max_score,
        exam_type=exam.exam_type,
        memo=exam.memo,
        created_by=exam.created_by,
        created_at=exam.created_at,
        updated_at=exam.updated_at,
        avg_score=calc_avg_score(exam.results),
    )


# ==================== DELETE /{exam_id} — 시험 삭제 ====================


@router.delete("/{exam_id}", status_code=204, response_class=Response)
async def delete_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """시험 삭제 (exam_results CASCADE, Admin only)"""
    exam = (
        db.query(Exam)
        .filter(
            Exam.id == exam_id,
            Exam.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not exam:
        raise HTTPException(status_code=404, detail="시험을 찾을 수 없습니다.")

    db.delete(exam)
    db.commit()
    return Response(status_code=204)


# ==================== GET /{exam_id}/results — 결과 조회 ====================


@router.get("/{exam_id}/results", response_model=ExamResultsPayload)
async def list_exam_results(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """특정 시험의 학생별 결과 + 요약 메타 반환 (Admin only)"""
    exam = (
        db.query(Exam)
        .filter(
            Exam.id == exam_id,
            Exam.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not exam:
        raise HTTPException(status_code=404, detail="시험을 찾을 수 없습니다.")

    rows = (
        db.query(
            ExamResult,
            Student.name.label("student_name"),
            StudentClass.name.label("class_name"),
        )
        .join(Student, ExamResult.student_id == Student.id)
        .outerjoin(StudentClass, Student.class_id == StudentClass.id)
        .filter(
            ExamResult.exam_id == exam_id,
            ExamResult.tenant_id == current_user.tenant_id,
        )
        .order_by(Student.name)
        .all()
    )

    result_rows = [r for r, _, _ in rows]
    ranks = assign_ranks(result_rows)

    results = [
        ExamResultResponse(
            id=er.id,
            exam_id=er.exam_id,
            student_id=er.student_id,
            student_name=student_name,
            class_name=class_name,
            status=er.status,
            score=er.score,
            grade=er.grade,
            comment=er.comment,
            rank_in_class=ranks.get(er.student_id),
            updated_at=er.updated_at,
        )
        for er, student_name, class_name in rows
    ]

    avg = calc_avg_score(result_rows)
    scored = [
        float(r.score)
        for r in result_rows
        if r.status == ExamResultStatus.completed and r.score is not None
    ]
    max_in_exam = Decimal(str(max(scored))) if scored else None
    declining = calc_declining_count(db, exam, result_rows, current_user.tenant_id)

    return ExamResultsPayload(
        results=results,
        avg_score=avg,
        max_score_in_exam=max_in_exam,
        declining_count=declining,
    )


# ==================== POST /{exam_id}/results/bulk-upsert ====================


@router.post("/{exam_id}/results/bulk-upsert", response_model=List[ExamResultResponse])
async def bulk_upsert_exam_results(
    exam_id: int,
    data: ExamResultsBulkUpsertRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """학생별 결과 일괄 저장 — snapshot 학생만 허용, score 유무로 status 자동 결정 (Admin only)"""
    exam = (
        db.query(Exam)
        .filter(
            Exam.id == exam_id,
            Exam.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not exam:
        raise HTTPException(status_code=404, detail="시험을 찾을 수 없습니다.")

    # snapshot 보호: 요청 student_id가 기존 exam_result row에 있는지 검증
    request_student_ids = {r.student_id for r in data.records}
    existing = (
        db.query(ExamResult.student_id)
        .filter(
            ExamResult.exam_id == exam_id,
            ExamResult.tenant_id == current_user.tenant_id,
        )
        .all()
    )
    existing_student_ids = {row.student_id for row in existing}
    invalid = request_student_ids - existing_student_ids
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"해당 시험의 대상 학생이 아닙니다: {sorted(invalid)}",
        )

    # score 유무로 status 자동 결정, score 없으면 grade도 None
    now = datetime.now(timezone.utc)
    values = []
    for r in data.records:
        if r.score is not None:
            # score <= max_score 검증
            if float(r.score) > float(exam.max_score):
                raise HTTPException(
                    status_code=422,
                    detail=f"학생 {r.student_id}: 점수({r.score})가 만점({exam.max_score})을 초과합니다.",
                )
            if float(r.score) < 0:
                raise HTTPException(
                    status_code=422,
                    detail=f"학생 {r.student_id}: 점수는 0 이상이어야 합니다.",
                )
            status = ExamResultStatus.completed
            grade = r.grade
        else:
            status = ExamResultStatus.pending
            grade = None

        values.append(
            {
                "tenant_id": current_user.tenant_id,
                "exam_id": exam_id,
                "student_id": r.student_id,
                "status": status.value,
                "score": r.score,
                "grade": grade,
                "comment": r.comment,
                "created_at": now,
                "updated_at": now,
            }
        )

    stmt = pg_insert(ExamResult).values(values)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_exam_result_exam_student",
        set_={
            "status": stmt.excluded.status,
            "score": stmt.excluded.score,
            "grade": stmt.excluded.grade,
            "comment": stmt.excluded.comment,
            "updated_at": now,
        },
    )
    db.execute(stmt)
    db.commit()

    # 저장 후 결과 재조회 (rank 포함)
    rows = (
        db.query(
            ExamResult,
            Student.name.label("student_name"),
            StudentClass.name.label("class_name"),
        )
        .join(Student, ExamResult.student_id == Student.id)
        .outerjoin(StudentClass, Student.class_id == StudentClass.id)
        .filter(
            ExamResult.exam_id == exam_id,
            ExamResult.tenant_id == current_user.tenant_id,
            ExamResult.student_id.in_(list(request_student_ids)),
        )
        .order_by(Student.name)
        .all()
    )

    all_results = (
        db.query(ExamResult)
        .filter(
            ExamResult.exam_id == exam_id,
            ExamResult.tenant_id == current_user.tenant_id,
        )
        .all()
    )
    ranks = assign_ranks(all_results)

    return [
        ExamResultResponse(
            id=er.id,
            exam_id=er.exam_id,
            student_id=er.student_id,
            student_name=student_name,
            class_name=class_name,
            status=er.status,
            score=er.score,
            grade=er.grade,
            comment=er.comment,
            rank_in_class=ranks.get(er.student_id),
            updated_at=er.updated_at,
        )
        for er, student_name, class_name in rows
    ]
