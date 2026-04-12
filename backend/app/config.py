from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24시간 (업로드 작업용)
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Admin (default tenant admin)
    ADMIN_EMAIL: str
    ADMIN_PASSWORD: str

    # Superadmin
    SUPERADMIN_EMAIL: str = "admin@academy.ready.talk"
    SUPERADMIN_PASSWORD: str = "readytalk2026!"

    # Gemini AI (default tenant - will be moved to per-tenant config)
    GEMINI_API_KEY: str = ""
    DEFAULT_MODEL: str = "gemini-2.5-flash"

    # Google Cloud Storage (default tenant - will be moved to per-tenant config)
    GCS_BUCKET_NAME: Optional[str] = None
    GCS_CREDENTIALS_PATH: Optional[str] = None

    # Vertex AI RAG Engine
    VERTEX_AI_PROJECT_ID: Optional[str] = None
    VERTEX_AI_LOCATION: str = "asia-northeast3"
    GCP_CREDENTIALS_PATH: Optional[str] = None

    # GCP Platform (for auto-provisioning)
    GCP_ORG_ID: Optional[str] = None
    GCP_BILLING_ACCOUNT_ID: Optional[str] = None
    GCP_PLATFORM_CREDENTIALS_PATH: Optional[str] = None

    # API Key Encryption
    API_ENCRYPTION_KEY: Optional[str] = None

    # Site URL (for KakaoTalk admin links etc.)
    REACT_APP_API_URL: str = "http://localhost:8888"

    # Verification (Auth)
    APP_BASE_URL: str = "https://academy.ready.talk"
    VERIFICATION_TOKEN_EXPIRE_MINUTES: int = 10
    OTP_EXPIRE_MINUTES: int = 5
    OTP_MAX_ATTEMPTS: int = 5

    # File Upload
    UPLOAD_DIR: str = "/app/uploads"
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100MB

    # Feedback Email (SMTP)
    FEEDBACK_EMAIL: Optional[str] = None
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None

    # Google Calendar OAuth 2.0
    GOOGLE_CALENDAR_CLIENT_ID: Optional[str] = None
    GOOGLE_CALENDAR_CLIENT_SECRET: Optional[str] = None
    GOOGLE_CALENDAR_REDIRECT_URI: str = "http://localhost:8888/api/calendar/callback"

    # DB Connection Pool
    DB_POOL_SIZE: int = 5  # 로컬: 5, 운영: 50
    DB_MAX_OVERFLOW: int = 10  # 로컬: 10, 운영: 30
    DB_POOL_RECYCLE: int = 1800  # 30분마다 커넥션 재생성
    DB_POOL_PRE_PING: bool = True  # 사용 전 커넥션 유효성 검사

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
