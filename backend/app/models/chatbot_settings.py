from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class ChatbotSettings(Base):
    __tablename__ = "chatbot_settings"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    # Persona
    chatbot_name = Column(String(100), nullable=True)  # e.g. "레디봇"
    greeting_message = Column(Text, nullable=True)  # 인삿말/자기소개

    # Tone & Style
    tone = Column(String(50), default="polite")  # friendly|polite|professional|formal
    response_style = Column(String(50), default="concise")  # concise|detailed|balanced

    # Custom additions
    custom_instructions = Column(Text, nullable=True)  # 관리자 추가 지시사항

    # Preset tracking
    preset_id = Column(String(50), nullable=True)  # 선택한 프리셋 ID

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    tenant = relationship("Tenant", back_populates="chatbot_settings")
