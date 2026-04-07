from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)  # 교회명 (예: "사랑의교회")
    slug = Column(
        String(100), unique=True, nullable=False, index=True
    )  # URL 경로용 (예: "sarang")
    status = Column(
        String(20), default="active", nullable=False
    )  # active, suspended, deactivated
    search_backend = Column(
        String(30), default="rag_engine", nullable=False
    )  # rag_engine or vertex_ai_search
    logo_url = Column(String(500), nullable=True)  # 교회 로고 URL
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    gcp_config = relationship(
        "TenantGcpConfig",
        back_populates="tenant",
        uselist=False,
        cascade="all, delete-orphan",
    )
    kakao_config = relationship(
        "TenantKakaoConfig",
        back_populates="tenant",
        uselist=False,
        cascade="all, delete-orphan",
    )
    calendar_config = relationship(
        "TenantCalendarConfig",
        back_populates="tenant",
        uselist=False,
        cascade="all, delete-orphan",
    )
    users = relationship("User", back_populates="tenant")
    groups = relationship("Group", back_populates="tenant")
    student_classes = relationship("StudentClass", back_populates="tenant")
    students = relationship("Student", back_populates="tenant")
    corpora = relationship("Corpus", back_populates="tenant")
    chatbot_settings = relationship(
        "ChatbotSettings",
        back_populates="tenant",
        uselist=False,
        cascade="all, delete-orphan",
    )


class TenantGcpConfig(Base):
    __tablename__ = "tenant_gcp_configs"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    gcp_project_id = Column(String(255), nullable=False)  # GCP 프로젝트 ID
    gemini_api_key_encrypted = Column(
        String(500), nullable=True
    )  # 암호화된 Gemini API Key
    gcs_bucket_name = Column(String(255), nullable=True)  # GCS 버킷명
    gcp_credentials_encrypted = Column(
        Text, nullable=True
    )  # 암호화된 GCP 서비스 계정 JSON (Vertex AI + GCS 공용)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    tenant = relationship("Tenant", back_populates="gcp_config")


class TenantKakaoConfig(Base):
    __tablename__ = "tenant_kakao_configs"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    channel_id = Column(
        String(255), unique=True, nullable=True, index=True
    )  # 카카오톡 채널 ID
    bot_id = Column(String(255), nullable=True)  # 카카오 i 오픈빌더 봇 ID
    skill_url = Column(String(500), nullable=True)  # 스킬 URL (자동 생성)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    tenant = relationship("Tenant", back_populates="kakao_config")


class TenantCalendarConfig(Base):
    __tablename__ = "tenant_calendar_configs"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    calendar_id = Column(
        String(255), nullable=True
    )  # Google Calendar ID (default: "primary")
    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    token_expiry = Column(DateTime(timezone=True), nullable=True)
    connected_email = Column(String(255), nullable=True)  # 연동된 Google 계정 이메일
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    tenant = relationship("Tenant", back_populates="calendar_config")
