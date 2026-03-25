from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ChatbotSettingsUpdate(BaseModel):
    chatbot_name: Optional[str] = None
    greeting_message: Optional[str] = None
    tone: Optional[str] = "polite"          # friendly|polite|professional|formal
    response_style: Optional[str] = "concise"  # concise|detailed|balanced
    custom_instructions: Optional[str] = None
    preset_id: Optional[str] = None


class ChatbotSettingsResponse(BaseModel):
    id: int
    chatbot_name: Optional[str] = None
    greeting_message: Optional[str] = None
    tone: str
    response_style: str
    custom_instructions: Optional[str] = None
    preset_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PresetResponse(BaseModel):
    id: str
    name: str
    description: str
    chatbot_name: str
    greeting_message: str
    tone: str
    response_style: str
    sample_response: str
