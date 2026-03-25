from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class StorePermissionCreate(BaseModel):
    store_name: str
    group_id: int
    can_read: bool = True


class StorePermissionResponse(BaseModel):
    id: int
    store_name: str
    group_id: int
    can_read: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
