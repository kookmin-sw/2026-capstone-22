from datetime import date, datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, model_validator


class StudentClassStatus(str, Enum):
    active = "active"
    closed = "closed"


class StudentStatus(str, Enum):
    active = "active"
    inactive = "inactive"
    graduated = "graduated"


def _clean_empty_strings(data: Any) -> Any:
    if isinstance(data, dict):
        return {k: (None if v == "" else v) for k, v in data.items()}
    return data


# ==================== StudentClass Schemas ====================


class StudentClassBase(BaseModel):
    name: str
    code: Optional[str] = None
    grade_level: Optional[str] = None
    subject: Optional[str] = None
    teacher_name: Optional[str] = None
    day_of_week: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    capacity: Optional[int] = None
    status: StudentClassStatus = StudentClassStatus.active
    memo: Optional[str] = None


class StudentClassCreate(StudentClassBase):
    @model_validator(mode="before")
    @classmethod
    def clean(cls, data):
        return _clean_empty_strings(data)


class StudentClassUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    grade_level: Optional[str] = None
    subject: Optional[str] = None
    teacher_name: Optional[str] = None
    day_of_week: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    capacity: Optional[int] = None
    status: Optional[StudentClassStatus] = None
    memo: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def clean(cls, data):
        return _clean_empty_strings(data)


class StudentClassResponse(StudentClassBase):
    id: int
    tenant_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==================== Student Schemas ====================


class StudentBase(BaseModel):
    name: str
    birth_date: date
    school_name: Optional[str] = None
    grade: Optional[str] = None
    class_id: Optional[int] = None
    phone: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    status: StudentStatus = StudentStatus.active
    memo: Optional[str] = None


class StudentCreate(StudentBase):
    @model_validator(mode="before")
    @classmethod
    def clean(cls, data):
        return _clean_empty_strings(data)


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    birth_date: Optional[date] = None
    school_name: Optional[str] = None
    grade: Optional[str] = None
    class_id: Optional[int] = None
    phone: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    status: Optional[StudentStatus] = None
    memo: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def clean(cls, data):
        return _clean_empty_strings(data)


class StudentResponse(StudentBase):
    id: int
    tenant_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
