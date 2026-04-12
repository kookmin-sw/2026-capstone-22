from datetime import date, datetime
from enum import Enum
from typing import Any, List, Optional

from pydantic import BaseModel, Field, model_validator


def _clean_empty_strings(data: Any) -> Any:
    if isinstance(data, dict):
        return {k: (None if v == "" else v) for k, v in data.items()}
    return data


class AttendanceStatus(str, Enum):
    present = "present"
    absent = "absent"
    late = "late"
    early_leave = "early_leave"


# ==================== 단건 수정 ====================


class AttendanceUpdate(BaseModel):
    status: Optional[AttendanceStatus] = None
    memo: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def clean(cls, data):
        return _clean_empty_strings(data)

    @model_validator(mode="after")
    def require_at_least_one(self):
        if not self.model_fields_set:
            raise ValueError("status 또는 memo 중 하나는 반드시 포함되어야 합니다.")
        return self


# ==================== 일괄 upsert ====================


class AttendanceBulkUpsertItem(BaseModel):
    student_id: int
    status: AttendanceStatus
    memo: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def clean(cls, data):
        return _clean_empty_strings(data)


class AttendanceBulkUpsertRequest(BaseModel):
    attendance_date: date
    records: List[AttendanceBulkUpsertItem] = Field(..., min_length=1)

    @model_validator(mode="after")
    def no_duplicate_students(self):
        ids = [r.student_id for r in self.records]
        if len(ids) != len(set(ids)):
            raise ValueError("records에 동일한 student_id가 중복되어 있습니다.")
        return self


# ==================== 전원 출석 초기화 ====================


class AttendanceInitPresentRequest(BaseModel):
    attendance_date: date
    class_id: int


# ==================== 응답 ====================


class AttendanceResponse(BaseModel):
    id: int
    tenant_id: int
    student_id: int
    class_id: Optional[int] = None
    attendance_date: date
    status: AttendanceStatus
    memo: Optional[str] = None
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AttendanceRosterItem(BaseModel):
    student_id: int
    student_name: str
    school_name: Optional[str] = None
    grade: Optional[str] = None
    class_name: Optional[str] = None
    status: Optional[AttendanceStatus] = None
    memo: Optional[str] = None
    record_id: Optional[int] = None
    updated_at: Optional[datetime] = None


class AttendanceSummary(BaseModel):
    present: int = 0
    absent: int = 0
    late: int = 0
    early_leave: int = 0
    total_students: int = 0
    unrecorded_count: int = 0
