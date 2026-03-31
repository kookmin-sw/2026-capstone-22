from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from ..database import Base


class PlatformSetting(Base):
    """Global platform settings (key-value store)

    Used by superadmins to manage platform-wide configuration like
    Vertex AI credentials, Gemini API key, GCP project settings, etc.
    Falls back to environment variables if not set in DB.
    """

    __tablename__ = "platform_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(255), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    description = Column(String(500), nullable=True)
    is_secret = Column(Integer, default=0)  # 1 = masked in API responses
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
