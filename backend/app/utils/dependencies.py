import logging
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
from ..models.group import Group
from .security import decode_token

logger = logging.getLogger(__name__)

# HTTP Bearer token scheme
security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Get current authenticated user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials
    payload = decode_token(token)

    if payload is None:
        raise credentials_exception

    if payload.get("type") != "access":
        raise credentials_exception

    user_id_str = payload.get("sub")
    if user_id_str is None:
        raise credentials_exception

    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    # Handle impersonation tokens: superadmin acting as tenant admin
    if payload.get("impersonating"):
        if not user.is_superadmin:
            raise credentials_exception
        impersonating_tenant_id = payload.get("impersonating_tenant_id")
        if impersonating_tenant_id is None:
            raise credentials_exception
        # Eagerly load relationships before detaching from session
        _ = user.group
        from sqlalchemy.orm import make_transient

        db.expunge(user)
        make_transient(user)
        user.tenant_id = impersonating_tenant_id
        user.is_admin = True

    return user


async def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """토큰 있으면 인증 유저 반환, 없으면 None 반환"""
    if credentials is None:
        return None

    token = credentials.credentials
    payload = decode_token(token)
    if payload is None:
        return None

    if payload.get("type") != "access":
        return None

    user_id_str = payload.get("sub")
    if user_id_str is None:
        return None

    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        return None

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        return None

    # Handle impersonation tokens (same as get_current_user)
    if payload.get("impersonating"):
        if not user.is_superadmin:
            return None
        impersonating_tenant_id = payload.get("impersonating_tenant_id")
        if impersonating_tenant_id is None:
            return None
        _ = user.group
        from sqlalchemy.orm import make_transient

        db.expunge(user)
        make_transient(user)
        user.tenant_id = impersonating_tenant_id
        user.is_admin = True

    return user


def get_or_create_guest_user(db: Session, tenant_id: int = None) -> User:
    """'일반' 그룹에 속한 공유 guest 유저 반환"""
    guest = db.query(User).filter(User.email == "guest@system.internal").first()
    if guest:
        return guest

    general_group = db.query(Group).filter(Group.name == "일반").first()
    guest = User(
        email="guest@system.internal",
        username="Guest",
        password_hash="",
        is_admin=False,
        group_id=general_group.id if general_group else None,
        tenant_id=tenant_id,
        auth_provider="guest",
    )
    db.add(guest)
    db.commit()
    db.refresh(guest)
    logger.info("Guest user created as fallback")
    return guest


async def get_current_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure current user is an admin (tenant admin or superadmin)"""
    if not current_user.is_admin and not current_user.is_superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required"
        )
    return current_user


async def get_current_superadmin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure current user is a superadmin"""
    if not current_user.is_superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin access required"
        )
    return current_user
