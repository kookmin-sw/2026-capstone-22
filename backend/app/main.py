from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base, SessionLocal
from .routers import (
    auth,
    chat,
    admin,
    corpus,
    models,
    prompt_templates,
    superadmin,
    tenants,
    kakao,
    calendar,
    chatbot_settings,
    hitl,
    students,
    attendance,
    assignments,
    exams,
    verification,
    question_bank,
)
from .utils.init_data import init_database
import logging
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 스케줄러 인스턴스
scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler - startup and shutdown events"""
    # === Startup ===
    logger.info("Starting up application...")

    # Create all tables if they don't exist
    # Alembic handles incremental migrations, but for fresh DB we need create_all
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables ensured")

    # Initialize default data (superadmin, tenants, AI models)
    init_database()
    logger.info("Database initialized with default data")

    # Guest 세션 정리 스케줄러 (매일 새벽 4시)
    scheduler.add_job(
        cleanup_guest_sessions,
        CronTrigger(hour=4, minute=0, timezone="Asia/Seoul"),
        id="cleanup_guest_sessions",
        replace_existing=True,
    )
    logger.info("Scheduler added: Guest session cleanup at 4:00 AM KST")

    scheduler.start()
    logger.info("Scheduler started")

    yield

    # === Shutdown ===
    scheduler.shutdown(wait=False)
    logger.info("Shutting down application...")


async def cleanup_guest_sessions():
    """24시간 이상 된 guest 세션 삭제 (CASCADE로 메시지도 함께 삭제)"""
    from .models.user import User
    from .models.chat import ChatSession
    from datetime import datetime, timedelta, timezone

    logger.info("Starting guest session cleanup...")
    db = SessionLocal()
    try:
        guest = db.query(User).filter(User.email == "guest@system.internal").first()
        if not guest:
            logger.info("No guest user found, skipping cleanup")
            return

        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        old_sessions = (
            db.query(ChatSession)
            .filter(ChatSession.user_id == guest.id, ChatSession.created_at < cutoff)
            .all()
        )

        count = len(old_sessions)
        for session in old_sessions:
            db.delete(session)

        db.commit()
        logger.info(f"Guest session cleanup complete: {count} sessions deleted")
    except Exception as e:
        logger.error(f"Guest session cleanup failed: {e}")
        db.rollback()
    finally:
        db.close()


# Create FastAPI app with lifespan handler
app = FastAPI(
    title="ReadyTalk API",
    description="Multi-tenant chatbot platform using Google Gemini File Search API",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(corpus.router, prefix="/api/corpus", tags=["Corpus"])
app.include_router(models.router, prefix="/api/models", tags=["Models"])
app.include_router(
    prompt_templates.router, prefix="/api/prompt-templates", tags=["Prompt Templates"]
)
app.include_router(superadmin.router, prefix="/api/superadmin", tags=["Super Admin"])
app.include_router(tenants.router, prefix="/api/tenants", tags=["Tenants"])
app.include_router(kakao.router, prefix="/api/kakao", tags=["KakaoTalk"])
app.include_router(calendar.router, prefix="/api/calendar", tags=["Calendar"])
app.include_router(
    chatbot_settings.router, prefix="/api/chatbot-settings", tags=["Chatbot Settings"]
)
app.include_router(hitl.router, prefix="/api/hitl", tags=["HITL"])
app.include_router(students.router, prefix="/api/admin/students", tags=["Students"])
app.include_router(
    attendance.router,
    prefix="/api/admin/students/attendance",
    tags=["Attendance"],
)
app.include_router(
    assignments.router,
    prefix="/api/admin/students/assignments",
    tags=["Assignments"],
)
app.include_router(
    exams.router,
    prefix="/api/admin/students/exams",
    tags=["Exams"],
)
app.include_router(verification.router, prefix="/api", tags=["Verification"])
app.include_router(
    question_bank.router,
    prefix="/api/admin/question-bank",
    tags=["Question Bank"],
)


@app.get("/")
async def root():
    return {"message": "ReadyTalk API", "version": "2.0.0", "docs": "/docs"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
