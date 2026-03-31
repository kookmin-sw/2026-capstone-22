import logging
import re
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from typing import List
from ..database import get_db
from ..models.user import User
from ..models.tenant import Tenant, TenantGcpConfig, TenantKakaoConfig
from ..models.corpus import Corpus, Document
from ..models.chat import ChatSession, Message
from ..models.group import Group
from ..models.usage import UsageRecord
from ..schemas.tenant import (
    TenantCreate,
    TenantUpdate,
    TenantResponse,
    TenantDetailResponse,
    TenantStatsResponse,
    TenantKakaoConfigUpdate,
    TenantGcpConfigUpdate,
)
from ..schemas.billing import (
    BillingSummaryResponse,
    TenantUsageSummary,
    TenantBillingDetailResponse,
    DailyUsage,
    CallTypeBreakdown,
    ModelBreakdown,
)
from ..utils.pricing import estimate_storage_cost
from datetime import datetime, timedelta, timezone
from ..utils.dependencies import get_current_superadmin
from ..utils.security import get_password_hash, create_access_token
from ..services.tenant_provisioning import TenantProvisioningService
from ..models.platform_setting import PlatformSetting
from ..config import settings as app_settings

logger = logging.getLogger(__name__)

# Platform settings definition: key -> (env_var_name, description, is_secret)
PLATFORM_SETTINGS_SCHEMA = {
    "VERTEX_AI_PROJECT_ID": (
        "VERTEX_AI_PROJECT_ID",
        "Vertex AI GCP 프로젝트 ID",
        False,
    ),
    "VERTEX_AI_LOCATION": (
        "VERTEX_AI_LOCATION",
        "Vertex AI 리전 (예: asia-northeast3)",
        False,
    ),
    "GCP_CREDENTIALS_PATH": (
        "GCP_CREDENTIALS_PATH",
        "GCP 서비스 계정 JSON 파일 경로 (Vertex AI + GCS 공용)",
        False,
    ),
    "GCS_BUCKET_NAME": ("GCS_BUCKET_NAME", "Google Cloud Storage 버킷명", False),
    "GEMINI_API_KEY": (
        "GEMINI_API_KEY",
        "Gemini API 키 (웹 검색, 파일 업로드용)",
        True,
    ),
    "DEFAULT_MODEL": ("DEFAULT_MODEL", "기본 AI 모델", False),
    "MODEL_TEMPERATURE": (
        "MODEL_TEMPERATURE",
        "Temperature (창의성 조절, 0.0~2.0, 기본: 1.0)",
        False,
    ),
    "MODEL_TOP_K": ("MODEL_TOP_K", "Top K (토큰 선택 범위, 정수, 기본: 40)", False),
    "MODEL_TOP_P": (
        "MODEL_TOP_P",
        "Top P (누적 확률 기반 샘플링, 0.0~1.0, 기본: 0.95)",
        False,
    ),
    "MODEL_MAX_OUTPUT_TOKENS": (
        "MODEL_MAX_OUTPUT_TOKENS",
        "최대 출력 토큰 수 (기본: 8192)",
        False,
    ),
    "MODEL_THINKING_BUDGET": (
        "MODEL_THINKING_BUDGET",
        "Thinking Budget (사고 토큰 수, 0=비활성, 기본: 0, 지원 모델만 적용)",
        False,
    ),
    "WEAVIATE_HTTP_ENDPOINT": (
        "WEAVIATE_HTTP_ENDPOINT",
        "Weaviate HTTPS 엔드포인트 (하이브리드 검색용)",
        False,
    ),
    "WEAVIATE_COLLECTION_NAME": (
        "WEAVIATE_COLLECTION_NAME",
        "Weaviate 컬렉션 이름",
        False,
    ),
    "WEAVIATE_API_KEY_SECRET": (
        "WEAVIATE_API_KEY_SECRET",
        "Weaviate API 키 Secret Manager 리소스 (projects/.../secrets/.../versions/...)",
        False,
    ),
}

router = APIRouter()

SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$")


@router.get("/tenants", response_model=List[TenantResponse])
async def list_tenants(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_superadmin)
):
    """List all tenants (Superadmin only)"""
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    return tenants


@router.post(
    "/tenants", response_model=TenantDetailResponse, status_code=status.HTTP_201_CREATED
)
async def create_tenant(
    tenant_data: TenantCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin),
):
    """Create a new tenant with GCP provisioning (Superadmin only)"""
    # Validate slug
    if not SLUG_PATTERN.match(tenant_data.slug):
        raise HTTPException(
            status_code=400,
            detail="Slug must be 3-100 chars, lowercase alphanumeric with hyphens, no leading/trailing hyphens",
        )

    # Check for duplicate slug
    existing = db.query(Tenant).filter(Tenant.slug == tenant_data.slug).first()
    if existing:
        raise HTTPException(
            status_code=400, detail="Tenant with this slug already exists"
        )

    # Validate search_backend
    if tenant_data.search_backend not in ("rag_engine", "vertex_ai_search"):
        raise HTTPException(
            status_code=400,
            detail="search_backend must be 'rag_engine' or 'vertex_ai_search'",
        )

    # 1. Create tenant
    tenant = Tenant(
        name=tenant_data.name,
        slug=tenant_data.slug,
        status="active",
        search_backend=tenant_data.search_backend,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    # 2. Create GCP config using shared bucket
    shared_bucket = _get_setting_value("GCS_BUCKET_NAME", db)
    shared_project = _get_setting_value("VERTEX_AI_PROJECT_ID", db)
    gcp_config = TenantGcpConfig(
        tenant_id=tenant.id,
        gcp_project_id=shared_project or "readytalk",
        gcs_bucket_name=shared_bucket or "",
    )
    db.add(gcp_config)

    # 3. Create default groups for the tenant
    for group_data in [
        {"name": "관리자", "description": "관리자 그룹"},
        {"name": "일반", "description": "일반 사용자 그룹"},
    ]:
        group = Group(**group_data, tenant_id=tenant.id)
        db.add(group)

    # 4. Create tenant admin account
    admin_email = f"admin@readytalk-{tenant_data.slug}.com"
    admin_password = f"readytalk-{tenant_data.slug}-2026!"
    admin_user = User(
        email=admin_email,
        username=f"{tenant_data.name} Admin",
        password_hash=get_password_hash(admin_password),
        is_admin=True,
        tenant_id=tenant.id,
    )
    db.add(admin_user)

    db.commit()
    db.refresh(tenant)

    logger.info(f"Tenant created: {tenant_data.slug} (admin: {admin_email})")

    # Create GCS tenant folder
    if shared_bucket:
        try:
            from ..services import gcs_service

            gcs_client, bucket_name = gcs_service._get_tenant_gcs(tenant.id, db)
            if bucket_name:
                bucket = gcs_client.bucket(bucket_name)
                blob = bucket.blob(f"tenants/{tenant_data.slug}/.keep")
                blob.upload_from_string("")
                logger.info(
                    f"Created GCS folder: {bucket_name}/tenants/{tenant_data.slug}/"
                )
        except Exception as gcs_err:
            logger.warning(f"Failed to create GCS tenant folder: {gcs_err}")

    # Kick off GCP provisioning in background if configured
    if TenantProvisioningService.is_configured():

        async def _run_provisioning(slug: str, tid: int):
            from ..database import SessionLocal

            provisioning_db = SessionLocal()
            try:
                result = await TenantProvisioningService.provision_tenant(
                    slug, tid, provisioning_db
                )
                logger.info(f"GCP provisioning result for {slug}: {result}")
            except Exception as e:
                logger.error(f"GCP provisioning failed for {slug}: {e}")
            finally:
                provisioning_db.close()

        background_tasks.add_task(_run_provisioning, tenant_data.slug, tenant.id)
        logger.info(f"GCP provisioning queued for tenant: {tenant_data.slug}")

    return TenantDetailResponse(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        status=tenant.status,
        logo_url=tenant.logo_url,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
        gcp_config=tenant.gcp_config,
        kakao_config=tenant.kakao_config,
        user_count=1,
        document_count=0,
        session_count=0,
    )


@router.get("/tenants/{tenant_id}", response_model=TenantDetailResponse)
async def get_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin),
):
    """Get tenant details (Superadmin only)"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    user_count = (
        db.query(func.count(User.id)).filter(User.tenant_id == tenant_id).scalar()
    )
    document_count = (
        db.query(func.count(Document.id))
        .filter(Document.tenant_id == tenant_id)
        .scalar()
    )
    session_count = (
        db.query(func.count(ChatSession.id))
        .filter(ChatSession.tenant_id == tenant_id)
        .scalar()
    )

    return TenantDetailResponse(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        status=tenant.status,
        logo_url=tenant.logo_url,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
        gcp_config=tenant.gcp_config,
        kakao_config=tenant.kakao_config,
        user_count=user_count,
        document_count=document_count,
        session_count=session_count,
    )


@router.put("/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: int,
    tenant_update: TenantUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin),
):
    """Update tenant info (Superadmin only)"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if tenant_update.name is not None:
        tenant.name = tenant_update.name
    if tenant_update.status is not None:
        if tenant_update.status not in ("active", "suspended", "deactivated"):
            raise HTTPException(status_code=400, detail="Invalid status")
        tenant.status = tenant_update.status
    if tenant_update.logo_url is not None:
        tenant.logo_url = tenant_update.logo_url

    db.commit()
    db.refresh(tenant)
    return tenant


@router.delete("/tenants/{tenant_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def permanently_delete_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin),
):
    """Permanently delete a tenant and all associated data (Superadmin only)

    Deletes: Vertex AI RAG corpora, GCS files, DB records (documents, corpora,
    messages, sessions, users, groups, permissions, configs, tenant)
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    tenant_slug = tenant.slug
    logger.info(
        f"Starting permanent deletion of tenant: {tenant_slug} (id={tenant_id})"
    )

    # 1. Delete corpora (RAG Engine or Vertex AI Search based on tenant setting)
    # 외부 리소스 삭제 실패는 경고만 남기고, DB 삭제는 반드시 진행
    corpora = db.query(Corpus).filter(Corpus.tenant_id == tenant_id).all()
    search_backend = getattr(tenant, "search_backend", "rag_engine") or "rag_engine"
    for corpus in corpora:
        try:
            if search_backend == "vertex_ai_search":
                from ..services.search_service import SearchService

                SearchService.delete_data_store(corpus.corpus_name)
                logger.info(
                    f"Deleted Vertex AI Search data store: {corpus.corpus_name}"
                )
            else:
                from ..services.rag_service import RagService

                RagService.delete_corpus(corpus.corpus_name)
                logger.info(f"Deleted RAG corpus: {corpus.corpus_name}")
        except Exception as e:
            logger.warning(
                f"Failed to delete corpus {corpus.corpus_name} (will still remove from DB): {e}"
            )

    # 2. Delete GCS tenant folder and all files
    try:
        from ..services import gcs_service

        if gcs_service.is_configured(tenant_id=tenant_id, db=db):
            gcs_client, bucket_name = gcs_service._get_tenant_gcs(tenant_id, db)
            if bucket_name:
                bucket = gcs_client.bucket(bucket_name)
                prefix = f"tenants/{tenant_slug}/"
                try:
                    blobs = list(bucket.list_blobs(prefix=prefix))
                    logger.info(
                        f"Found {len(blobs)} GCS objects under {bucket_name}/{prefix}"
                    )
                    if blobs:
                        for blob in blobs:
                            try:
                                blob.delete()
                            except Exception as blob_err:
                                logger.warning(
                                    f"Failed to delete GCS blob {blob.name}: {blob_err}"
                                )
                        logger.info(f"Deleted GCS objects under {prefix}")
                    else:
                        logger.info(f"No GCS objects found under {prefix}")
                except Exception as list_err:
                    logger.warning(
                        f"Failed to list/delete GCS blobs under {prefix}: {list_err}"
                    )
    except Exception as e:
        logger.warning(f"Failed to delete GCS files for tenant {tenant_slug}: {e}")

    # 3. Delete DB records (order matters for foreign keys)
    from ..models.store_permission import StoreGroupPermission
    from ..models.prompt_template import PromptTemplate

    # Usage records
    db.query(UsageRecord).filter(UsageRecord.tenant_id == tenant_id).delete(
        synchronize_session=False
    )
    # Documents
    db.query(Document).filter(Document.tenant_id == tenant_id).delete(
        synchronize_session=False
    )
    # Corpora
    db.query(Corpus).filter(Corpus.tenant_id == tenant_id).delete(
        synchronize_session=False
    )
    # Messages (via sessions)
    session_ids = [
        s.id
        for s in db.query(ChatSession.id)
        .filter(ChatSession.tenant_id == tenant_id)
        .all()
    ]
    if session_ids:
        db.query(Message).filter(Message.session_id.in_(session_ids)).delete(
            synchronize_session=False
        )
    # Chat sessions
    db.query(ChatSession).filter(ChatSession.tenant_id == tenant_id).delete(
        synchronize_session=False
    )
    # Store permissions
    db.query(StoreGroupPermission).filter(
        StoreGroupPermission.tenant_id == tenant_id
    ).delete(synchronize_session=False)
    # Prompt templates
    db.query(PromptTemplate).filter(PromptTemplate.tenant_id == tenant_id).delete(
        synchronize_session=False
    )
    # Users
    db.query(User).filter(User.tenant_id == tenant_id).delete(synchronize_session=False)
    # Groups
    db.query(Group).filter(Group.tenant_id == tenant_id).delete(
        synchronize_session=False
    )
    # GCP config
    db.query(TenantGcpConfig).filter(TenantGcpConfig.tenant_id == tenant_id).delete(
        synchronize_session=False
    )
    # Kakao config
    db.query(TenantKakaoConfig).filter(TenantKakaoConfig.tenant_id == tenant_id).delete(
        synchronize_session=False
    )
    # AI Models
    from ..models.model import AIModel

    db.query(AIModel).filter(AIModel.tenant_id == tenant_id).delete(
        synchronize_session=False
    )
    # Tenant itself
    db.delete(tenant)

    db.commit()
    logger.info(f"Tenant permanently deleted: {tenant_slug} (id={tenant_id})")


@router.delete("/tenants/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin),
):
    """Deactivate a tenant (Superadmin only) - does not delete data"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    tenant.status = "deactivated"
    db.commit()


@router.post("/tenants/{tenant_id}/kakao")
async def update_kakao_config(
    tenant_id: int,
    kakao_data: TenantKakaoConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin),
):
    """Update tenant's KakaoTalk config (Superadmin only)"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    kakao_config = (
        db.query(TenantKakaoConfig)
        .filter(TenantKakaoConfig.tenant_id == tenant_id)
        .first()
    )
    if not kakao_config:
        kakao_config = TenantKakaoConfig(tenant_id=tenant_id)
        db.add(kakao_config)

    if kakao_data.bot_id is not None:
        bot_id = kakao_data.bot_id.strip() if kakao_data.bot_id else None
        kakao_config.bot_id = bot_id

    if kakao_data.channel_id is not None:
        ch_id = kakao_data.channel_id.strip() if kakao_data.channel_id else None
        kakao_config.channel_id = ch_id

    db.commit()
    db.refresh(kakao_config)

    return {
        "message": "Kakao config updated",
        "config": {
            "channel_id": kakao_config.channel_id,
            "bot_id": kakao_config.bot_id,
        },
    }


@router.post("/tenants/{tenant_id}/gcp")
async def update_gcp_config(
    tenant_id: int,
    gcp_data: TenantGcpConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin),
):
    """Update tenant's GCP config (Superadmin only)

    Note: Gemini API key is no longer needed per-tenant.
    Vertex AI RAG uses a shared service account for all tenants.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    gcp_config = (
        db.query(TenantGcpConfig).filter(TenantGcpConfig.tenant_id == tenant_id).first()
    )
    if not gcp_config:
        gcp_config = TenantGcpConfig(
            tenant_id=tenant_id,
            gcp_project_id=gcp_data.gcp_project_id or "shared",
        )
        db.add(gcp_config)

    if gcp_data.gcp_project_id is not None:
        gcp_config.gcp_project_id = gcp_data.gcp_project_id

    if gcp_data.gcs_bucket_name is not None:
        gcp_config.gcs_bucket_name = gcp_data.gcs_bucket_name

    db.commit()
    db.refresh(gcp_config)

    return {
        "message": "GCP config updated",
        "config": {
            "gcp_project_id": gcp_config.gcp_project_id,
            "gcs_bucket_name": gcp_config.gcs_bucket_name,
        },
    }


@router.get("/tenants/{tenant_id}/stats", response_model=TenantStatsResponse)
async def get_tenant_stats(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin),
):
    """Get tenant usage statistics (Superadmin only)"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    return TenantStatsResponse(
        tenant_id=tenant_id,
        user_count=db.query(func.count(User.id))
        .filter(User.tenant_id == tenant_id)
        .scalar(),
        document_count=db.query(func.count(Document.id))
        .filter(Document.tenant_id == tenant_id)
        .scalar(),
        corpus_count=db.query(func.count(Corpus.id))
        .filter(Corpus.tenant_id == tenant_id)
        .scalar(),
        session_count=db.query(func.count(ChatSession.id))
        .filter(ChatSession.tenant_id == tenant_id)
        .scalar(),
        message_count=db.query(func.count(Message.id))
        .filter(Message.tenant_id == tenant_id)
        .scalar(),
    )


@router.get("/tenants/{tenant_id}/analytics")
async def get_tenant_analytics(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin),
):
    """Get tenant-specific time-series analytics (Superadmin only)"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    now = datetime.now(timezone.utc)
    days_14 = now - timedelta(days=14)
    days_30 = now - timedelta(days=30)

    # 1. Daily messages (last 14 days)
    daily_messages = (
        db.query(
            func.date(Message.timestamp).label("date"),
            func.count(Message.id).label("count"),
        )
        .filter(
            Message.tenant_id == tenant_id,
            Message.timestamp >= days_14,
            Message.role == "assistant",
        )
        .group_by(func.date(Message.timestamp))
        .order_by(func.date(Message.timestamp))
        .all()
    )

    # 2. Daily sessions (last 14 days)
    daily_sessions = (
        db.query(
            func.date(ChatSession.created_at).label("date"),
            func.count(ChatSession.id).label("count"),
        )
        .filter(ChatSession.tenant_id == tenant_id, ChatSession.created_at >= days_14)
        .group_by(func.date(ChatSession.created_at))
        .order_by(func.date(ChatSession.created_at))
        .all()
    )

    # 3. Daily new users (last 30 days)
    daily_users = (
        db.query(
            func.date(User.created_at).label("date"),
            func.count(User.id).label("count"),
        )
        .filter(User.tenant_id == tenant_id, User.created_at >= days_30)
        .group_by(func.date(User.created_at))
        .order_by(func.date(User.created_at))
        .all()
    )

    # 4. Hourly message distribution (last 30 days, for activity heatmap)
    # Convert UTC to KST (UTC+9) before extracting hour
    kst_timestamp = Message.timestamp + text("INTERVAL '9 hours'")
    hourly_dist = (
        db.query(
            func.extract("hour", kst_timestamp).label("hour"),
            func.count(Message.id).label("count"),
        )
        .filter(Message.tenant_id == tenant_id, Message.timestamp >= days_30)
        .group_by(func.extract("hour", kst_timestamp))
        .order_by(func.extract("hour", kst_timestamp))
        .all()
    )

    return {
        "daily_messages": [
            {"date": str(r.date), "count": r.count} for r in daily_messages
        ],
        "daily_sessions": [
            {"date": str(r.date), "count": r.count} for r in daily_sessions
        ],
        "daily_users": [{"date": str(r.date), "count": r.count} for r in daily_users],
        "hourly_distribution": [
            {"hour": int(r.hour), "count": r.count} for r in hourly_dist
        ],
    }


@router.get("/dashboard")
async def superadmin_dashboard(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_superadmin)
):
    """Get superadmin dashboard stats"""
    total_tenants = db.query(func.count(Tenant.id)).scalar()
    active_tenants = (
        db.query(func.count(Tenant.id)).filter(Tenant.status == "active").scalar()
    )
    total_users = (
        db.query(func.count(User.id)).filter(User.is_superadmin == False).scalar()
    )
    total_documents = db.query(func.count(Document.id)).scalar()
    total_sessions = db.query(func.count(ChatSession.id)).scalar()

    # Recent tenants
    recent_tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).limit(5).all()

    return {
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "total_users": total_users,
        "total_documents": total_documents,
        "total_sessions": total_sessions,
        "recent_tenants": [
            {
                "id": t.id,
                "name": t.name,
                "slug": t.slug,
                "status": t.status,
                "created_at": t.created_at.isoformat(),
            }
            for t in recent_tenants
        ],
    }


@router.get("/dashboard/analytics")
async def dashboard_analytics(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_superadmin)
):
    """Get time-series analytics for dashboard charts (Superadmin only)"""
    now = datetime.now(timezone.utc)
    days_14 = now - timedelta(days=14)
    days_30 = now - timedelta(days=30)

    # 1. Daily message counts (last 14 days)
    daily_messages = (
        db.query(
            func.date(Message.timestamp).label("date"),
            func.count(Message.id).label("count"),
        )
        .filter(Message.timestamp >= days_14, Message.role == "assistant")
        .group_by(func.date(Message.timestamp))
        .order_by(func.date(Message.timestamp))
        .all()
    )

    # 2. Daily new users (last 30 days)
    daily_users = (
        db.query(
            func.date(User.created_at).label("date"),
            func.count(User.id).label("count"),
        )
        .filter(User.created_at >= days_30, User.is_superadmin == False)
        .group_by(func.date(User.created_at))
        .order_by(func.date(User.created_at))
        .all()
    )

    # 3. Tenant usage ranking (messages per tenant, top 10)
    tenant_usage = (
        db.query(
            Tenant.name,
            Tenant.slug,
            func.count(Message.id).label("message_count"),
        )
        .join(Message, Message.tenant_id == Tenant.id)
        .filter(Message.timestamp >= days_30)
        .group_by(Tenant.id, Tenant.name, Tenant.slug)
        .order_by(func.count(Message.id).desc())
        .limit(10)
        .all()
    )

    # 4. Tenant status distribution
    status_dist = (
        db.query(Tenant.status, func.count(Tenant.id).label("count"))
        .group_by(Tenant.status)
        .all()
    )

    return {
        "daily_messages": [
            {"date": str(row.date), "count": row.count} for row in daily_messages
        ],
        "daily_users": [
            {"date": str(row.date), "count": row.count} for row in daily_users
        ],
        "tenant_usage": [
            {"name": row.name, "slug": row.slug, "messages": row.message_count}
            for row in tenant_usage
        ],
        "status_distribution": [
            {"status": row.status, "count": row.count} for row in status_dist
        ],
    }


@router.post("/tenants/{tenant_id}/impersonate")
async def impersonate_tenant(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin),
):
    """Generate a short-lived impersonation token for a tenant (Superadmin only)"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    token_data = {
        "sub": str(current_user.id),
        "tenant_id": tenant.id,
        "is_superadmin": True,
        "impersonating": True,
        "impersonating_tenant_id": tenant.id,
        "original_user_id": current_user.id,
    }

    impersonation_token = create_access_token(
        data=token_data,
        expires_delta=timedelta(minutes=30),
    )

    logger.info(
        f"Superadmin {current_user.email} impersonating tenant {tenant.slug} (id={tenant.id})"
    )

    return {
        "impersonation_token": impersonation_token,
        "tenant_slug": tenant.slug,
        "tenant_name": tenant.name,
    }


# ─── Platform Settings ───────────────────────────────────────────────


def _get_setting_value(key: str, db: Session) -> str:
    """Get setting value: DB first, then env var fallback"""
    db_setting = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    if db_setting and db_setting.value:
        return db_setting.value
    # Fallback to env var
    return getattr(app_settings, key, "") or ""


def _mask_secret(value: str) -> str:
    """Mask secret values for display"""
    if not value:
        return ""
    if len(value) <= 8:
        return "••••••••"
    return value[:4] + "••••" + value[-4:]


@router.get("/settings")
async def get_platform_settings(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_superadmin)
):
    """Get all platform settings (Superadmin only)"""
    settings_list = []

    for key, (env_var, description, is_secret) in PLATFORM_SETTINGS_SCHEMA.items():
        raw_value = _get_setting_value(key, db)

        # Check source (DB or ENV)
        db_setting = (
            db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
        )
        source = "db" if (db_setting and db_setting.value) else "env"

        settings_list.append(
            {
                "key": key,
                "value": _mask_secret(raw_value) if is_secret else raw_value,
                "description": description,
                "is_secret": is_secret,
                "source": source,
                "has_value": bool(raw_value),
            }
        )

    return {"settings": settings_list}


@router.put("/settings")
async def update_platform_settings(
    updates: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin),
):
    """Update platform settings (Superadmin only)

    Request body: {"settings": {"KEY": "value", ...}}
    """
    settings_data = updates.get("settings", {})
    if not settings_data:
        raise HTTPException(status_code=400, detail="No settings provided")

    updated_keys = []

    for key, value in settings_data.items():
        if key not in PLATFORM_SETTINGS_SCHEMA:
            continue

        _, description, is_secret = PLATFORM_SETTINGS_SCHEMA[key]

        # Skip masked values (user didn't change the secret)
        if is_secret and "••••" in (value or ""):
            continue

        db_setting = (
            db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
        )
        if not db_setting:
            db_setting = PlatformSetting(
                key=key,
                value=value,
                description=description,
                is_secret=1 if is_secret else 0,
            )
            db.add(db_setting)
        else:
            db_setting.value = value

        updated_keys.append(key)

    db.commit()

    logger.info(f"Platform settings updated by {current_user.email}: {updated_keys}")

    return {"message": "Settings updated", "updated": updated_keys}


@router.get("/settings/models")
async def list_gemini_models(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_superadmin)
):
    """List available Gemini models from API (Superadmin only)"""
    import httpx as _httpx

    api_key = _get_setting_value("GEMINI_API_KEY", db)
    if not api_key:
        return {"models": [], "error": "GEMINI_API_KEY가 설정되지 않았습니다"}

    try:
        resp = _httpx.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            params={"key": api_key},
            timeout=15,
        )
        if resp.status_code != 200:
            return {"models": [], "error": f"API 호출 실패: {resp.status_code}"}

        data = resp.json()
        models_list = []

        # Exclude non-chat models
        EXCLUDE_KEYWORDS = {
            "tts",
            "image",
            "robotics",
            "computer-use",
            "customtools",
            "banana",
            "latest",
            "embedding",
            "aqa",
        }

        for model in data.get("models", []):
            name = model["name"].replace("models/", "")

            # gemini only, generateContent only
            if not name.startswith("gemini-"):
                continue
            methods = model.get("supportedGenerationMethods", [])
            if "generateContent" not in methods:
                continue

            # Skip non-chat specialty models
            name_lower = name.lower()
            if any(kw in name_lower for kw in EXCLUDE_KEYWORDS):
                continue

            # Skip numbered patch versions (e.g. 2.0-flash-001)
            if name.endswith("-001"):
                continue

            # Skip models older than 2.5 (keep 2.5, 3, 3.1, etc.)
            import re as _re

            version_match = _re.search(r"gemini-(\d+(?:\.\d+)?)", name)
            if version_match:
                version = float(version_match.group(1))
                if version < 2.5:
                    continue

            display_name = model.get("displayName", name)
            models_list.append(
                {
                    "model_id": name,
                    "display_name": display_name,
                }
            )

        # Sort: latest first
        models_list.sort(key=lambda m: m["model_id"], reverse=True)

        return {"models": models_list, "source": "api"}

    except Exception as e:
        logger.error(f"Failed to list Gemini models: {e}")
        return {"models": [], "error": str(e)}


@router.post("/settings/test-vertex-ai")
async def test_vertex_ai_connection(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_superadmin)
):
    """Test Vertex AI connection with current settings (Superadmin only)"""
    try:
        project_id = _get_setting_value("VERTEX_AI_PROJECT_ID", db)
        location = _get_setting_value("VERTEX_AI_LOCATION", db)

        if not project_id:
            return {
                "success": False,
                "message": "VERTEX_AI_PROJECT_ID가 설정되지 않았습니다",
            }

        from vertexai import rag
        from ..services.gemini_client import _init_vertex_ai

        _init_vertex_ai()

        corpora = list(rag.list_corpora())

        return {
            "success": True,
            "message": f"연결 성공! 프로젝트: {project_id}, 리전: {location}",
            "corpus_count": len(corpora),
        }
    except Exception as e:
        return {"success": False, "message": f"연결 실패: {str(e)}"}


# ─── Billing / Usage ─────────────────────────────────────────────────


@router.get("/billing/summary", response_model=BillingSummaryResponse)
async def get_billing_summary(
    period: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin),
):
    """Platform-wide billing summary (Superadmin only)"""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=period)
    start_date = start.strftime("%Y-%m-%d")
    end_date = now.strftime("%Y-%m-%d")

    # Aggregate usage per tenant
    rows = (
        db.query(
            UsageRecord.tenant_id,
            func.count(UsageRecord.id).label("api_calls"),
            func.coalesce(func.sum(UsageRecord.prompt_token_count), 0).label(
                "prompt_tokens"
            ),
            func.coalesce(func.sum(UsageRecord.candidates_token_count), 0).label(
                "completion_tokens"
            ),
            func.coalesce(func.sum(UsageRecord.total_token_count), 0).label(
                "total_tokens"
            ),
            func.coalesce(func.sum(UsageRecord.estimated_cost_usd), 0).label("cost"),
        )
        .filter(UsageRecord.created_at >= start)
        .group_by(UsageRecord.tenant_id)
        .all()
    )

    # All tenants
    all_tenants = db.query(Tenant).all()
    tenants_map = {t.id: t for t in all_tenants}

    # Usage per tenant
    usage_map = {}
    for r in rows:
        usage_map[r.tenant_id] = r

    # Storage per tenant (from DB document sizes)
    storage_rows = (
        db.query(
            Document.tenant_id,
            func.coalesce(func.sum(Document.file_size), 0).label("total_bytes"),
        )
        .group_by(Document.tenant_id)
        .all()
    )
    storage_map = {r.tenant_id: int(r.total_bytes) for r in storage_rows}

    tenant_summaries = []
    total_api_calls = 0
    total_tokens = 0
    total_cost = 0.0
    total_storage = 0
    total_storage_cost = 0.0

    for t in all_tenants:
        r = usage_map.get(t.id)
        s_bytes = storage_map.get(t.id, 0)
        s_cost = estimate_storage_cost(s_bytes)

        api_calls = r.api_calls if r else 0
        prompt_tokens = int(r.prompt_tokens) if r else 0
        completion_tokens = int(r.completion_tokens) if r else 0
        tokens = int(r.total_tokens) if r else 0
        cost = round(float(r.cost), 6) if r else 0.0

        tenant_summaries.append(
            TenantUsageSummary(
                tenant_id=t.id,
                tenant_name=t.name,
                tenant_slug=t.slug,
                total_api_calls=api_calls,
                total_prompt_tokens=prompt_tokens,
                total_completion_tokens=completion_tokens,
                total_tokens=tokens,
                estimated_cost_usd=cost,
                storage_bytes=s_bytes,
                storage_cost_usd=s_cost,
            )
        )
        total_api_calls += api_calls
        total_tokens += tokens
        total_cost += cost
        total_storage += s_bytes
        total_storage_cost += s_cost

    # Sort by cost descending
    tenant_summaries.sort(
        key=lambda x: x.estimated_cost_usd + x.storage_cost_usd, reverse=True
    )

    return BillingSummaryResponse(
        period_days=period,
        start_date=start_date,
        end_date=end_date,
        total_api_calls=total_api_calls,
        total_tokens=total_tokens,
        total_estimated_cost_usd=round(total_cost, 6),
        total_storage_bytes=total_storage,
        total_storage_cost_usd=round(total_storage_cost, 6),
        tenants=tenant_summaries,
    )


@router.get("/billing/tenants/{tenant_id}", response_model=TenantBillingDetailResponse)
async def get_tenant_billing(
    tenant_id: int,
    period: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin),
):
    """Detailed billing for a single tenant (Superadmin only)"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=period)

    base_q = db.query(UsageRecord).filter(
        UsageRecord.tenant_id == tenant_id,
        UsageRecord.created_at >= start,
    )

    # Totals
    totals = (
        db.query(
            func.count(UsageRecord.id).label("api_calls"),
            func.coalesce(func.sum(UsageRecord.prompt_token_count), 0).label(
                "prompt_tokens"
            ),
            func.coalesce(func.sum(UsageRecord.candidates_token_count), 0).label(
                "completion_tokens"
            ),
            func.coalesce(func.sum(UsageRecord.total_token_count), 0).label(
                "total_tokens"
            ),
            func.coalesce(func.sum(UsageRecord.estimated_cost_usd), 0).label("cost"),
        )
        .filter(
            UsageRecord.tenant_id == tenant_id,
            UsageRecord.created_at >= start,
        )
        .first()
    )

    # Daily usage
    daily_rows = (
        db.query(
            func.date(UsageRecord.created_at).label("date"),
            func.count(UsageRecord.id).label("api_calls"),
            func.coalesce(func.sum(UsageRecord.total_token_count), 0).label(
                "total_tokens"
            ),
            func.coalesce(func.sum(UsageRecord.estimated_cost_usd), 0).label("cost"),
        )
        .filter(
            UsageRecord.tenant_id == tenant_id,
            UsageRecord.created_at >= start,
        )
        .group_by(func.date(UsageRecord.created_at))
        .order_by(func.date(UsageRecord.created_at))
        .all()
    )

    # Call type breakdown
    type_rows = (
        db.query(
            UsageRecord.call_type,
            func.count(UsageRecord.id).label("count"),
            func.coalesce(func.sum(UsageRecord.total_token_count), 0).label(
                "total_tokens"
            ),
            func.coalesce(func.sum(UsageRecord.estimated_cost_usd), 0).label("cost"),
        )
        .filter(
            UsageRecord.tenant_id == tenant_id,
            UsageRecord.created_at >= start,
        )
        .group_by(UsageRecord.call_type)
        .all()
    )

    # Model breakdown
    model_rows = (
        db.query(
            UsageRecord.model_name,
            func.count(UsageRecord.id).label("count"),
            func.coalesce(func.sum(UsageRecord.total_token_count), 0).label(
                "total_tokens"
            ),
            func.coalesce(func.sum(UsageRecord.estimated_cost_usd), 0).label("cost"),
        )
        .filter(
            UsageRecord.tenant_id == tenant_id,
            UsageRecord.created_at >= start,
        )
        .group_by(UsageRecord.model_name)
        .all()
    )

    # Storage
    storage = (
        db.query(func.coalesce(func.sum(Document.file_size), 0))
        .filter(Document.tenant_id == tenant_id)
        .scalar()
    )
    storage_bytes = int(storage)
    storage_cost = estimate_storage_cost(storage_bytes)

    return TenantBillingDetailResponse(
        tenant_id=tenant_id,
        tenant_name=tenant.name,
        tenant_slug=tenant.slug,
        period_days=period,
        total_api_calls=totals.api_calls,
        total_tokens=int(totals.total_tokens),
        total_prompt_tokens=int(totals.prompt_tokens),
        total_completion_tokens=int(totals.completion_tokens),
        estimated_cost_usd=round(float(totals.cost), 6),
        storage_bytes=storage_bytes,
        storage_cost_usd=storage_cost,
        daily_usage=[
            DailyUsage(
                date=str(r.date),
                api_calls=r.api_calls,
                total_tokens=int(r.total_tokens),
                estimated_cost_usd=round(float(r.cost), 6),
            )
            for r in daily_rows
        ],
        call_type_breakdown=[
            CallTypeBreakdown(
                call_type=r.call_type,
                count=r.count,
                total_tokens=int(r.total_tokens),
                estimated_cost_usd=round(float(r.cost), 6),
            )
            for r in type_rows
        ],
        model_breakdown=[
            ModelBreakdown(
                model_name=r.model_name,
                count=r.count,
                total_tokens=int(r.total_tokens),
                estimated_cost_usd=round(float(r.cost), 6),
            )
            for r in model_rows
        ],
    )
