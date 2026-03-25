import logging
from sqlalchemy.orm import Session
from ..database import SessionLocal
from ..models.tenant import Tenant, TenantGcpConfig
from ..models.user import User
from ..models.group import Group
from ..config import settings
from .security import get_password_hash

logger = logging.getLogger(__name__)


def init_superadmin(db: Session):
    """Create superadmin user (no tenant)"""
    superadmin_email = getattr(settings, 'SUPERADMIN_EMAIL', 'admin@academy.ready.talk')
    superadmin_password = getattr(settings, 'SUPERADMIN_PASSWORD', 'readytalk2026!')

    existing = db.query(User).filter(User.email == superadmin_email).first()
    if not existing:
        superadmin = User(
            email=superadmin_email,
            username="Super Admin",
            password_hash=get_password_hash(superadmin_password),
            is_admin=True,
            is_superadmin=True,
            tenant_id=None,
        )
        db.add(superadmin)
        db.commit()
        logger.info(f"Superadmin created: {superadmin_email}")
    else:
        if not existing.is_superadmin:
            existing.is_superadmin = True
            db.commit()
        logger.info(f"Superadmin already exists: {superadmin_email}")


def init_default_tenant(db: Session) -> Tenant:
    """Create default readytalk tenant if not exists"""
    tenant = db.query(Tenant).filter(Tenant.slug == "readytalk").first()
    if not tenant:
        tenant = Tenant(name="ReadyTalk", slug="readytalk", status="active")
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
        logger.info("Default tenant created: readytalk")

        # Create GCP config for default tenant (Vertex AI uses shared service account)
        gcp_config = TenantGcpConfig(
            tenant_id=tenant.id,
            gcp_project_id=settings.VERTEX_AI_PROJECT_ID or "readytalk",
            gcs_bucket_name=settings.GCS_BUCKET_NAME,
        )
        db.add(gcp_config)
        db.commit()
        logger.info("Default tenant GCP config created")
    else:
        logger.info("Default tenant already exists: readytalk")

    return tenant


def init_groups(db: Session, tenant: Tenant):
    """Create default groups for tenant"""
    default_groups = [
        {"name": "관리자", "description": "관리자 그룹"},
        {"name": "일반", "description": "일반 사용자 그룹"}
    ]

    for group_data in default_groups:
        existing = db.query(Group).filter(
            Group.name == group_data["name"],
            Group.tenant_id == tenant.id
        ).first()
        if not existing:
            group = Group(**group_data, tenant_id=tenant.id)
            db.add(group)
            logger.info(f"Group created: {group_data['name']} (tenant: {tenant.slug})")

    db.commit()


def init_database():
    """Initialize database with default data"""
    db = SessionLocal()
    try:
        # 1. Create superadmin
        init_superadmin(db)

        # 2. Create default tenant
        tenant = init_default_tenant(db)

        # 3. Create default groups for tenant
        init_groups(db, tenant)

        # 4. Create tenant admin user (former admin)
        admin_user = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
        if not admin_user:
            admin_user = User(
                email=settings.ADMIN_EMAIL,
                username="Admin",
                password_hash=get_password_hash(settings.ADMIN_PASSWORD),
                is_admin=True,
                tenant_id=tenant.id,
                preferred_model=settings.DEFAULT_MODEL
            )
            db.add(admin_user)
            db.commit()
            logger.info(f"Tenant admin created: {settings.ADMIN_EMAIL}")
        else:
            # Ensure existing admin is assigned to tenant
            if admin_user.tenant_id is None and not admin_user.is_superadmin:
                admin_user.tenant_id = tenant.id
                db.commit()
            logger.info(f"Tenant admin already exists: {settings.ADMIN_EMAIL}")

        # 5. Create guest user
        guest_user = db.query(User).filter(User.email == "guest@system.internal").first()
        if not guest_user:
            try:
                general_group = db.query(Group).filter(
                    Group.name == "일반", Group.tenant_id == tenant.id
                ).first()
                guest_user = User(
                    email="guest@system.internal",
                    username="Guest",
                    password_hash="",
                    is_admin=False,
                    group_id=general_group.id if general_group else None,
                    tenant_id=tenant.id,
                    auth_provider="guest"
                )
                db.add(guest_user)
                db.commit()
                logger.info("Guest user created: guest@system.internal")
            except Exception:
                db.rollback()
                logger.info("Guest user already created by another worker")
        else:
            if guest_user.tenant_id is None:
                guest_user.tenant_id = tenant.id
                db.commit()
            logger.info("Guest user already exists: guest@system.internal")

        db.commit()
        logger.info("Database initialization completed")

    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        db.rollback()
    finally:
        db.close()
