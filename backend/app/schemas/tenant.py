from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class TenantCreate(BaseModel):
    name: str
    slug: str
    search_backend: str = "rag_engine"  # rag_engine or vertex_ai_search


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    logo_url: Optional[str] = None


class TenantGcpConfigResponse(BaseModel):
    id: int
    gcp_project_id: str
    gcs_bucket_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TenantKakaoConfigResponse(BaseModel):
    id: int
    channel_id: Optional[str] = None
    bot_id: Optional[str] = None
    skill_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TenantGcpConfigUpdate(BaseModel):
    gemini_api_key: Optional[str] = None
    gcp_project_id: Optional[str] = None
    gcs_bucket_name: Optional[str] = None


class TenantKakaoConfigUpdate(BaseModel):
    bot_id: Optional[str] = None
    channel_id: Optional[str] = None


class TenantResponse(BaseModel):
    id: int
    name: str
    slug: str
    status: str
    search_backend: str = "rag_engine"
    logo_url: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TenantDetailResponse(TenantResponse):
    gcp_config: Optional[TenantGcpConfigResponse] = None
    kakao_config: Optional[TenantKakaoConfigResponse] = None
    user_count: int = 0
    document_count: int = 0
    session_count: int = 0


class TenantStatsResponse(BaseModel):
    tenant_id: int
    user_count: int
    document_count: int
    corpus_count: int
    session_count: int
    message_count: int


class TenantPublicInfo(BaseModel):
    """Public tenant info for login page"""
    id: int
    name: str
    slug: str
    logo_url: Optional[str] = None

    class Config:
        from_attributes = True
