from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class CorpusCreate(BaseModel):
    display_name: str
    description: Optional[str] = None
    is_public: bool = True


class CorpusResponse(BaseModel):
    """Corpus response - primarily from Gemini API"""

    corpus_name: str  # Gemini file search store name
    display_name: str
    description: Optional[str] = None
    is_public: bool = True
    document_count: int = 0
    # DB fields - optional (for backward compatibility)
    id: Optional[int] = None
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DocumentResponse(BaseModel):
    """Document response - primarily from Gemini API"""

    document_name: str  # Gemini document name
    display_name: str
    # DB fields - optional
    id: Optional[int] = None
    corpus_id: Optional[int] = None
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    uploaded_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DocumentUploadResponse(BaseModel):
    operation_name: str
    display_name: str
    status: str  # "processing", "completed", "error"
    message: Optional[str] = "Upload started"
    gcs_path: Optional[str] = None


class CorpusUpdate(BaseModel):
    """Corpus 수정 요청"""

    is_public: Optional[bool] = None
    description: Optional[str] = None


class CorpusDetailResponse(CorpusResponse):
    """Corpus 상세 응답 - DB 기반 페이지네이션 지원"""

    documents: List[DocumentResponse] = []
    total_count: Optional[int] = None
    has_next_page: Optional[bool] = None
    next_page_token: Optional[str] = None  # 하위 호환성 유지 (page 번호를 문자열로)
    current_page: Optional[int] = None  # 현재 페이지 (1-indexed)
    total_pages: Optional[int] = None  # 전체 페이지 수


class CorpusDeleteRequest(BaseModel):
    password: str


class BulkDeleteRequest(BaseModel):
    """일괄 삭제 요청"""

    display_names: List[str]  # 삭제할 파일명 목록
    password: str  # 보안을 위한 비밀번호 확인


class BulkDeleteResponse(BaseModel):
    """일괄 삭제 응답"""

    deleted: List[str] = []  # 성공적으로 삭제된 파일명
    not_found: List[str] = []  # DB에서 찾을 수 없는 파일명
    errors: List[dict] = []  # 삭제 중 에러 발생한 파일 (name, error)
    total_requested: int
    total_deleted: int
