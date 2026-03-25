from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AIModelResponse(BaseModel):
    id: int
    model_name: str
    display_name: str
    description: Optional[str]
    is_active: bool
    is_default: bool

    class Config:
        from_attributes = True


class AIModelUpdate(BaseModel):
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
