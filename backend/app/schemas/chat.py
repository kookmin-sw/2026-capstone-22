from pydantic import BaseModel, model_validator
from typing import List, Optional, Dict, Any
from datetime import datetime
from ..models.chat import MessageRole


class MessageBase(BaseModel):
    role: MessageRole
    content: str


class MessageCreate(BaseModel):
    content: str
    model: Optional[str] = None  # Optional: use user's preferred model if not specified


class MessageResponse(MessageBase):
    id: int
    session_id: int
    timestamp: datetime
    cited_sources: Optional[List["CitedSource"]] = None

    class Config:
        from_attributes = True

    @model_validator(mode="before")
    @classmethod
    def map_json_fields(cls, data):
        """Map JSON fields from DB to response fields"""
        if hasattr(data, "__dict__"):
            obj_dict = {
                "id": data.id,
                "session_id": data.session_id,
                "role": data.role,
                "content": data.content,
                "timestamp": data.timestamp,
                "cited_sources": getattr(data, "cited_sources_json", None),
            }
            return obj_dict
        elif isinstance(data, dict):
            if "cited_sources_json" in data and "cited_sources" not in data:
                data["cited_sources"] = data.pop("cited_sources_json")
            return data
        return data


class ChatSessionCreate(BaseModel):
    title: Optional[str] = "New Chat"
    model: Optional[str] = None


class ChatSessionUpdate(BaseModel):
    title: Optional[str] = None


class ChatSessionResponse(BaseModel):
    id: int
    user_id: int
    title: str
    model_used: str
    created_at: datetime
    updated_at: Optional[datetime]
    messages: List[MessageResponse] = []

    class Config:
        from_attributes = True


class ChatSessionListResponse(BaseModel):
    id: int
    title: str
    model_used: str
    created_at: datetime
    updated_at: Optional[datetime]
    message_count: int = 0

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    session_id: Optional[int] = None  # If None, create new session
    message: str
    model: Optional[str] = None  # If None, use user's preferred model
    web_search_enabled: Optional[bool] = (
        False  # If True, enable hybrid search (File Search + Web Search)
    )


class TemplateMessageRequest(BaseModel):
    """템플릿 기반 메시지 전송 요청"""

    template_id: int  # 전송할 프롬프트 템플릿 ID
    session_id: Optional[int] = None  # If None, create new session
    model: Optional[str] = None  # If None, use user's preferred model
    web_search_enabled: Optional[bool] = False  # If True, enable hybrid search


class CitedSource(BaseModel):
    uri: Optional[str] = None
    title: str


class ChatResponse(BaseModel):
    session_id: int
    user_message: MessageResponse
    assistant_message: MessageResponse
    cited_sources: List[CitedSource] = []
    verification_required: bool = False
    verification_url: Optional[str] = None


class FeedbackRequest(BaseModel):
    message_id: int
    feedback_text: str
    include_conversation: bool = False
    session_id: Optional[int] = None


class FeedbackResponse(BaseModel):
    success: bool
    message: str


# Update forward references for MessageResponse
MessageResponse.model_rebuild()
