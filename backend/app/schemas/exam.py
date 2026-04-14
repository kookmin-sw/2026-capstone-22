from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, List, Optional

from pydantic import BaseModel, Field, model_validator


def _clean_empty_strings(data: Any) -> Any:
    if isinstance(data, dict):
        return {k: (None if v == "" else v) for k, v in data.items()}
    return data


# ==================== Status Enum ====================


class ExamResultStatus(str, Enum):
    pending = "pending"
    completed = "completed"
    absent = "absent"
    excused = "excused"


# ==================== Exam ====================


class ExamCreate(BaseModel):
    title: str = Field(..., max_length=200)
    exam_date: date
    class_id: int
    max_score: Decimal = Field(Decimal("100"), gt=0)
    exam_type: Optional[str] = Field(None, max_length=50)
    memo: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def clean(cls, data):
        return _clean_empty_strings(data)


class ExamUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    exam_date: Optional[date] = None
    max_score: Optional[Decimal] = Field(None, gt=0)
    exam_type: Optional[str] = Field(None, max_length=50)
    memo: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def clean(cls, data):
        return _clean_empty_strings(data)

    @model_validator(mode="after")
    def require_at_least_one(self):
        if not self.model_fields_set:
            raise ValueError("수정할 필드를 하나 이상 포함해야 합니다.")
        return self


class ExamResponse(BaseModel):
    id: int
    tenant_id: int
    class_id: Optional[int] = None
    class_name: Optional[str] = None
    title: str
    exam_date: date
    max_score: Decimal
    exam_type: Optional[str] = None
    memo: Optional[str] = None
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    avg_score: Optional[Decimal] = None

    class Config:
        from_attributes = True


# ==================== Exam Summary ====================


class ExamSummaryResponse(BaseModel):
    recent_count: int = 0


# ==================== Exam Result Upsert ====================


class ExamResultUpsert(BaseModel):
    student_id: int
    score: Optional[Decimal] = None
    grade: Optional[str] = Field(None, max_length=20)
    comment: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def clean(cls, data):
        return _clean_empty_strings(data)


class ExamResultsBulkUpsertRequest(BaseModel):
    records: List[ExamResultUpsert] = Field(..., min_length=1)

    @model_validator(mode="after")
    def no_duplicate_students(self):
        ids = [r.student_id for r in self.records]
        if len(ids) != len(set(ids)):
            raise ValueError("records에 동일한 student_id가 중복되어 있습니다.")
        return self


# ==================== Exam Result Response ====================


class ExamResultResponse(BaseModel):
    id: int
    exam_id: int
    student_id: int
    student_name: str
    class_name: Optional[str] = None
    status: ExamResultStatus
    score: Optional[Decimal] = None
    grade: Optional[str] = None
    comment: Optional[str] = None
    rank_in_class: Optional[int] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==================== Exam Results Payload ====================


class ExamResultsPayload(BaseModel):
    results: List[ExamResultResponse]
    avg_score: Optional[Decimal] = None
    max_score_in_exam: Optional[Decimal] = None
    declining_count: int = 0
