"""문제은행 API 라우터"""

import logging
import os
import shutil
import tempfile
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from ..database import SessionLocal, get_db
from ..models.exam_paper import ExamPaper, PaperStatus, QuestionItem, ReviewStatus
from ..models.user import User
from ..schemas.question_bank import (
    ExamPaperResponse,
    QuestionItemResponse,
    QuestionItemUpdate,
)
from ..services.question_bank_service import analyze_pdf
from ..utils.dependencies import get_current_admin_user

logger = logging.getLogger(__name__)

router = APIRouter()

_ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}
_EXT_TO_MIME = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


# ── POST /papers/upload ────────────────────────────────────────────────────


@router.post("/papers/upload", response_model=ExamPaperResponse, status_code=202)
async def upload_paper(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    subject: str = Form("영어"),
    grade: Optional[str] = Form(None),
    source_year: Optional[int] = Form(None),
    source_type: Optional[str] = Form(None),
    source: Optional[str] = Form(None),
    memo: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    PDF/이미지 시험지를 업로드하고 Gemini 분석을 백그라운드로 시작합니다.
    응답은 즉시 반환되며, status 필드로 진행 상태를 확인하세요.
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="PDF, PNG, JPG/JPEG 파일만 업로드할 수 있습니다.",
        )
    mime_type = _EXT_TO_MIME[ext]

    # ExamPaper 레코드 먼저 생성 (status=pending)
    paper = ExamPaper(
        tenant_id=current_user.tenant_id,
        title=title,
        file_name=file.filename,
        subject=subject,
        grade=grade,
        source_year=source_year,
        source_type=source_type,
        source=source,
        memo=memo,
        status=PaperStatus.pending,
        created_by=current_user.id,
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)

    # 업로드 파일을 임시 경로에 저장 (백그라운드 작업에서 읽음)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    try:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    finally:
        tmp.close()

    # 백그라운드에서 분석 실행 (임시 파일은 작업 완료 후 삭제)
    # ⚠ def(동기)로 선언해야 FastAPI가 스레드풀에서 실행함.
    # async def로 선언하면 이벤트 루프 안에서 직접 실행되어 블로킹 I/O가
    # HTTP 응답 flush를 막아 클라이언트가 타임아웃 오류를 받게 됨.
    background_tasks.add_task(_run_analysis, paper.id, tmp_path, mime_type)

    return ExamPaperResponse.model_validate(paper)


def _run_analysis(paper_id: int, file_path: str, mime_type: str) -> None:
    """백그라운드 분석 태스크 — 스레드풀에서 실행됨 (def, not async def)."""
    db = SessionLocal()
    try:
        paper = db.query(ExamPaper).filter(ExamPaper.id == paper_id).first()
        if not paper:
            return
        analyze_pdf(db=db, paper=paper, pdf_path=file_path, mime_type=mime_type)
    except Exception:
        logger.exception("[QuestionBank] _run_analysis failed for paper_id=%d", paper_id)
    finally:
        db.close()
        if os.path.exists(file_path):
            os.unlink(file_path)


# ── GET /papers ────────────────────────────────────────────────────────────


@router.get("/papers", response_model=List[ExamPaperResponse])
async def list_papers(
    subject: Optional[str] = Query(None),
    status: Optional[PaperStatus] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """시험지 목록 조회"""
    q = db.query(ExamPaper).filter(ExamPaper.tenant_id == current_user.tenant_id)
    if subject:
        q = q.filter(ExamPaper.subject == subject)
    if status:
        q = q.filter(ExamPaper.status == status)
    papers = q.order_by(ExamPaper.created_at.desc()).all()
    return [ExamPaperResponse.model_validate(p) for p in papers]


# ── GET /papers/{paper_id}/items ───────────────────────────────────────────


@router.get("/papers/{paper_id}/items", response_model=List[QuestionItemResponse])
async def list_items(
    paper_id: int,
    area: Optional[str] = Query(None),
    problem_type: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    review_status: Optional[ReviewStatus] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """특정 시험지의 문항 목록 조회 (필터 가능)"""
    paper = (
        db.query(ExamPaper)
        .filter(
            ExamPaper.id == paper_id,
            ExamPaper.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not paper:
        raise HTTPException(status_code=404, detail="시험지를 찾을 수 없습니다.")

    q = db.query(QuestionItem).filter(QuestionItem.paper_id == paper_id)
    if area:
        q = q.filter(QuestionItem.area == area)
    if problem_type:
        q = q.filter(QuestionItem.problem_type == problem_type)
    if difficulty:
        q = q.filter(QuestionItem.difficulty == difficulty)
    if review_status:
        q = q.filter(QuestionItem.review_status == review_status)

    items = q.order_by(QuestionItem.question_number).all()
    return [QuestionItemResponse.model_validate(i) for i in items]


# ── DELETE /papers/{paper_id} ─────────────────────────────────────────────


@router.delete("/papers/{paper_id}", status_code=200)
async def delete_paper(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """시험지 및 연결된 문항 전체 삭제"""
    paper = (
        db.query(ExamPaper)
        .filter(ExamPaper.id == paper_id, ExamPaper.tenant_id == current_user.tenant_id)
        .first()
    )
    if not paper:
        raise HTTPException(status_code=404, detail="시험지를 찾을 수 없습니다.")
    db.query(QuestionItem).filter(QuestionItem.paper_id == paper_id).delete()
    db.delete(paper)
    db.commit()
    return {"success": True}


# ── DELETE /items/{item_id} ────────────────────────────────────────────────


@router.delete("/items/{item_id}", status_code=200)
async def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """문항 1개 삭제"""
    item = (
        db.query(QuestionItem)
        .filter(QuestionItem.id == item_id, QuestionItem.tenant_id == current_user.tenant_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="문항을 찾을 수 없습니다.")
    db.delete(item)
    db.commit()
    return {"success": True}


# ── PATCH /items/{item_id} ─────────────────────────────────────────────────


@router.patch("/items/{item_id}", response_model=QuestionItemResponse)
async def update_item(
    item_id: int,
    data: QuestionItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """교사 검수: 문항 분류 결과 수정"""
    item = (
        db.query(QuestionItem)
        .filter(
            QuestionItem.id == item_id,
            QuestionItem.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="문항을 찾을 수 없습니다.")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)

    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return QuestionItemResponse.model_validate(item)
