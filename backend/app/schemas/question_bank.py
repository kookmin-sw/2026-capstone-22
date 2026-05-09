from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from ..models.exam_paper import PaperStatus, ReviewStatus


# ── ExamPaper ──────────────────────────────────────────────────────────────

class ExamPaperCreate(BaseModel):
    title: str
    subject: str = "영어"
    grade: Optional[str] = None
    source_year: Optional[int] = None
    source_type: Optional[str] = None  # 내신 / 모의고사 / 학원 자체 제작
    source: Optional[str] = None
    memo: Optional[str] = None


class ExamPaperResponse(BaseModel):
    id: int
    tenant_id: int
    title: str
    file_name: Optional[str]
    subject: str
    grade: Optional[str]
    source_year: Optional[int]
    source_type: Optional[str]
    source: Optional[str]
    memo: Optional[str]
    status: PaperStatus
    total_questions: Optional[int]
    error_message: Optional[str]
    created_by: Optional[int]
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── QuestionItem ────────────────────────────────────────────────────────────

class QuestionItemResponse(BaseModel):
    id: int
    paper_id: int
    question_number: int
    area: Optional[str]
    problem_type: Optional[str]
    concept_tag: Optional[str]
    difficulty: Optional[str]
    question_format: Optional[str]
    is_listening: bool
    score_point: Optional[int]
    question_body: Optional[str]
    choices: Optional[List[str]]
    answer: Optional[str]
    classifier_reason: Optional[str]
    review_status: ReviewStatus

    model_config = {"from_attributes": True}


class QuestionItemUpdate(BaseModel):
    area: Optional[str] = None
    problem_type: Optional[str] = None
    concept_tag: Optional[str] = None
    difficulty: Optional[str] = None
    score_point: Optional[int] = None
    answer: Optional[str] = None
    review_status: Optional[ReviewStatus] = None


# ── Gemini 응답 파싱용 내부 스키마 ────────────────────────────────────────────

class ClassifiedQuestion(BaseModel):
    number: int
    area: str
    problem_type: str
    concept_tag: Optional[str] = None
    difficulty: str
    is_listening: bool
    score_point: Optional[int] = None
    question_body: Optional[str] = None
    choices: Optional[List[str]] = None
    reason: Optional[str] = None


class AnalysisResult(BaseModel):
    questions: List[ClassifiedQuestion]
