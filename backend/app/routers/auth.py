import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
from ..models.group import Group
from ..models.tenant import Tenant
from ..schemas.user import UserCreate, UserLogin, UserResponse, Token, TokenRefresh, ExternalLoginRequest
from ..utils.security import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token
from ..utils.dependencies import get_current_user
from ..utils.external_auth import validate_external_token

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, slug: str = None, db: Session = Depends(get_db)):
    """Register a new user"""
    email = user_data.email.strip()
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Resolve tenant from slug
    tenant_id = None
    if slug:
        tenant = db.query(Tenant).filter(Tenant.slug == slug, Tenant.status == "active").first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        tenant_id = tenant.id
    else:
        # Default to readytalk tenant
        tenant = db.query(Tenant).filter(Tenant.slug == "readytalk").first()
        if tenant:
            tenant_id = tenant.id

    new_user = User(
        email=email,
        username=user_data.username.strip(),
        password_hash=get_password_hash(user_data.password),
        is_admin=False,
        tenant_id=tenant_id,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """Login and get JWT tokens"""
    email = credentials.email.strip()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    # Include tenant_id and is_superadmin in token
    token_data = {"sub": str(user.id)}
    if user.tenant_id:
        token_data["tenant_id"] = user.tenant_id
    if user.is_superadmin:
        token_data["is_superadmin"] = True

    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.post("/refresh", response_model=Token)
async def refresh_token(token_data: TokenRefresh, db: Session = Depends(get_db)):
    """Refresh access token using refresh token"""
    payload = decode_token(token_data.refresh_token)

    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

    user_id_str = payload.get("sub")
    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    new_token_data = {"sub": str(user.id)}
    if user.tenant_id:
        new_token_data["tenant_id"] = user.tenant_id
    if user.is_superadmin:
        new_token_data["is_superadmin"] = True

    access_token = create_access_token(data=new_token_data)
    refresh_token = create_refresh_token(data=new_token_data)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return current_user


@router.post("/external-login", response_model=Token)
async def external_login(
    request: ExternalLoginRequest,
    db: Session = Depends(get_db)
):
    """외부 SSO 토큰으로 로그인"""
    payload = await validate_external_token(request.external_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired external token"
        )

    external_user_id = payload.get("userid")
    if not external_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing userid"
        )

    user = db.query(User).filter(
        User.external_user_id == external_user_id
    ).first()

    if not user:
        logger.info(f"Creating new external user: {external_user_id}")

        # Default to readytalk tenant for external SSO users
        tenant = db.query(Tenant).filter(Tenant.slug == "readytalk").first()
        tenant_id = tenant.id if tenant else None

        staff_no = payload.get("staff_no")
        if staff_no:
            group = db.query(Group).filter(Group.name == "관리자").first()
        else:
            group = db.query(Group).filter(Group.name == "일반").first()

        temp_email = f"{external_user_id}@ccc.external"

        user = User(
            email=temp_email,
            username=payload.get("name", external_user_id),
            password_hash="",
            external_user_id=external_user_id,
            staff_no=staff_no,
            external_branch=payload.get("branch"),
            external_univ=payload.get("univ"),
            phone=payload.get("hp"),
            auth_provider="external",
            group_id=group.id if group else None,
            tenant_id=tenant_id,
            is_admin=False
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info(f"External user created: {external_user_id}")
    else:
        user.username = payload.get("name", user.username)
        user.staff_no = payload.get("staff_no")
        user.external_branch = payload.get("branch")
        user.external_univ = payload.get("univ")
        user.phone = payload.get("hp")

        staff_no = payload.get("staff_no")
        if staff_no and user.group and user.group.name != "간사":
            new_group = db.query(Group).filter(Group.name == "관리자").first()
            if new_group:
                user.group_id = new_group.id
        elif not staff_no and user.group and user.group.name != "일반":
            new_group = db.query(Group).filter(Group.name == "일반").first()
            if new_group:
                user.group_id = new_group.id

        db.commit()
        logger.info(f"External user updated: {external_user_id}")

    token_data = {"sub": str(user.id)}
    if user.tenant_id:
        token_data["tenant_id"] = user.tenant_id

    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }
