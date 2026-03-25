from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class PromptTemplateBase(BaseModel):
    title: str
    description: Optional[str] = None
    content: str
    icon: Optional[str] = "description"
    is_active: Optional[bool] = True
    display_order: Optional[int] = 0


class PromptTemplateCreate(PromptTemplateBase):
    pass


class PromptTemplateUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None


class PromptTemplateResponse(PromptTemplateBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PromptTemplateListItem(BaseModel):
    """버튼 목록용 간략 정보"""
    id: int
    title: str
    description: Optional[str] = None
    icon: str

    class Config:
        from_attributes = True
