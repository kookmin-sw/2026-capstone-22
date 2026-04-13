from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, List, Optional

from pydantic import BaseModel, Field, model_validator


def _clean_empty_strings(data: Any) -> Any:
    if isinstance(data, dict):
        return {k: (None if v == "" else v) for k, v in data.items()}
    return data


# ==================== Status Enums ====================


class AssignmentSubmissionStatus(str, Enum):
    """DB 저장값 (3종)"""

    assigned = "assigned"
    submitted = "submitted"
    excused = "excused"


class AssignmentDisplayStatus(str, Enum):
    """서버 계산 표시값 (5종)"""

    assigned = "assigned"
    missing = "missing"
    submitted = "submitted"
    late = "late"
    excused = "excused"


# ==================== Assignment ====================


class AssignmentCreate(BaseModel):
    title: str = Field(..., max_length=200)
    class_id: int
    assigned_date: date
    due_date: date
    subject: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    memo: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def clean(cls, data):
        return _clean_empty_strings(data)

    @model_validator(mode="after")
    def check_date_order(self):
        if self.assigned_date and self.due_date:
            if self.assigned_date > self.due_date:
                raise ValueError(
                    "부여일(assigned_date)은 마감일(due_date)보다 이후일 수 없습니다."
                )
        return self


class AssignmentUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    subject: Optional[str] = Field(None, max_length=100)
    assigned_date: Optional[date] = None
    due_date: Optional[date] = None
    description: Optional[str] = None
    memo: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def clean(cls, data):
        return _clean_empty_strings(data)

    @model_validator(mode="after")
    def require_at_least_one_and_check_dates(self):
        if not self.model_fields_set:
            raise ValueError("수정할 필드를 하나 이상 포함해야 합니다.")
        if self.assigned_date and self.due_date:
            if self.assigned_date > self.due_date:
                raise ValueError(
                    "부여일(assigned_date)은 마감일(due_date)보다 이후일 수 없습니다."
                )
        return self


class AssignmentResponse(BaseModel):
    id: int
    tenant_id: int
    class_id: Optional[int] = None
    class_name: Optional[str] = None
    title: str
    subject: Optional[str] = None
    assigned_date: date
    due_date: date
    description: Optional[str] = None
    memo: Optional[str] = None
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    submission_rate: float = 0.0

    class Config:
        from_attributes = True


# ==================== Assignment Summary ====================


class AssignmentSummary(BaseModel):
    ongoing_count: int = 0
    due_today_count: int = 0
    missing_count: int = 0
    late_count: int = 0


# ==================== Submission Roster ====================


class SubmissionRosterItem(BaseModel):
    student_id: int
    student_name: str
    class_id: Optional[int] = None
    class_name: Optional[str] = None
    status: Optional[AssignmentSubmissionStatus] = None
    display_status: AssignmentDisplayStatus
    submitted_at: Optional[datetime] = None
    score: Optional[Decimal] = None
    feedback: Optional[str] = None
    memo: Optional[str] = None
    record_id: Optional[int] = None
    updated_at: Optional[datetime] = None


# ==================== Submission Bulk Upsert ====================


class SubmissionBulkUpsertItem(BaseModel):
    student_id: int
    status: AssignmentSubmissionStatus
    submitted_at: Optional[datetime] = None
    score: Optional[Decimal] = None
    feedback: Optional[str] = None
    memo: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def clean(cls, data):
        return _clean_empty_strings(data)

    @model_validator(mode="after")
    def check_submitted_at_consistency(self):
        if self.status == AssignmentSubmissionStatus.submitted:
            if self.submitted_at is None:
                raise ValueError("status가 'submitted'이면 submitted_at은 필수입니다.")
        else:
            if self.submitted_at is not None:
                raise ValueError(
                    "submitted_at은 status가 'submitted'일 때만 허용됩니다."
                )
        return self


class SubmissionBulkUpsertRequest(BaseModel):
    records: List[SubmissionBulkUpsertItem] = Field(..., min_length=1)

    @model_validator(mode="after")
    def no_duplicate_students(self):
        ids = [r.student_id for r in self.records]
        if len(ids) != len(set(ids)):
            raise ValueError("records에 동일한 student_id가 중복되어 있습니다.")
        return self


# ==================== Submission Response ====================


class SubmissionResponse(BaseModel):
    id: int
    tenant_id: int
    assignment_id: int
    student_id: int
    status: AssignmentSubmissionStatus
    submitted_at: Optional[datetime] = None
    score: Optional[Decimal] = None
    feedback: Optional[str] = None
    memo: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
