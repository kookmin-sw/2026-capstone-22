from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from typing import List
from datetime import datetime, timedelta, timezone
from ..database import get_db
from ..models.user import User
from ..models.group import Group
from ..models.store_permission import StoreGroupPermission
from ..models.chat import ChatSession, Message
from ..models.corpus import Corpus, Document
from ..schemas.user import UserResponse, AdminPasswordChange, AdminUserUpdate
from ..schemas.group import GroupCreate, GroupUpdate, GroupResponse
from ..schemas.store_permission import StorePermissionCreate, StorePermissionResponse
from ..utils.dependencies import get_current_admin_user
from ..utils.security import get_password_hash

router = APIRouter()


# ==================== User Management ====================

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """List all users in current tenant (Admin only)"""
    users = db.query(User).filter(User.tenant_id == current_user.tenant_id).all()
    return users


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: AdminUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Update user info including group assignment (Admin only)"""
    user = db.query(User).filter(User.id == user_id, User.tenant_id == current_user.tenant_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_update.username is not None:
        user.username = user_update.username
    if user_update.email is not None:
        existing = db.query(User).filter(User.email == user_update.email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already exists")
        user.email = user_update.email
    if user_update.preferred_model is not None:
        user.preferred_model = user_update.preferred_model
    if user_update.group_id is not None:
        if user_update.group_id and not db.query(Group).filter(
            Group.id == user_update.group_id, Group.tenant_id == current_user.tenant_id
        ).first():
            raise HTTPException(status_code=404, detail="Group not found")
        user.group_id = user_update.group_id
    if user_update.is_admin is not None:
        user.is_admin = user_update.is_admin

    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}/password")
async def update_user_password(
    user_id: int,
    password_data: AdminPasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Update user password (Admin only)"""
    user = db.query(User).filter(User.id == user_id, User.tenant_id == current_user.tenant_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if len(password_data.new_password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")

    user.password_hash = get_password_hash(password_data.new_password)
    db.commit()

    return {"message": "Password updated successfully"}


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Delete user (Admin only)"""
    user = db.query(User).filter(User.id == user_id, User.tenant_id == current_user.tenant_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    db.delete(user)
    db.commit()


# ==================== Group Management ====================

@router.post("/groups", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    group: GroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Create a new group (Admin only)"""
    existing = db.query(Group).filter(
        Group.name == group.name, Group.tenant_id == current_user.tenant_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Group with this name already exists")

    new_group = Group(
        name=group.name,
        description=group.description,
        tenant_id=current_user.tenant_id
    )
    db.add(new_group)
    db.commit()
    db.refresh(new_group)
    return new_group


@router.get("/groups", response_model=List[GroupResponse])
async def list_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """List all groups (Admin only)"""
    groups = db.query(Group).filter(Group.tenant_id == current_user.tenant_id).all()
    return groups


@router.get("/groups/{group_id}", response_model=GroupResponse)
async def get_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Get group details (Admin only)"""
    group = db.query(Group).filter(Group.id == group_id, Group.tenant_id == current_user.tenant_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


@router.put("/groups/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: int,
    group_update: GroupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Update group (Admin only)"""
    group = db.query(Group).filter(Group.id == group_id, Group.tenant_id == current_user.tenant_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    if group_update.name is not None:
        existing = db.query(Group).filter(
            Group.name == group_update.name,
            Group.id != group_id,
            Group.tenant_id == current_user.tenant_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Group with this name already exists")
        group.name = group_update.name

    if group_update.description is not None:
        group.description = group_update.description

    db.commit()
    db.refresh(group)
    return group


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Delete group (Admin only)"""
    group = db.query(Group).filter(Group.id == group_id, Group.tenant_id == current_user.tenant_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    db.delete(group)
    db.commit()


# ==================== Store Permission Management ====================

@router.post("/store-permissions", response_model=StorePermissionResponse, status_code=status.HTTP_201_CREATED)
async def grant_store_permission(
    permission: StorePermissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Grant a group permission to access a store (Admin only)"""
    group = db.query(Group).filter(
        Group.id == permission.group_id, Group.tenant_id == current_user.tenant_id
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    existing = db.query(StoreGroupPermission).filter(
        StoreGroupPermission.store_name == permission.store_name,
        StoreGroupPermission.group_id == permission.group_id,
        StoreGroupPermission.tenant_id == current_user.tenant_id
    ).first()
    if existing:
        # Already exists - update can_read and return (idempotent)
        existing.can_read = permission.can_read
        db.commit()
        db.refresh(existing)
        return existing

    new_permission = StoreGroupPermission(
        store_name=permission.store_name,
        group_id=permission.group_id,
        tenant_id=current_user.tenant_id,
        can_read=permission.can_read
    )
    db.add(new_permission)
    db.commit()
    db.refresh(new_permission)
    return new_permission


@router.get("/store-permissions", response_model=List[StorePermissionResponse])
async def list_store_permissions(
    store_name: str = None,
    group_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """List all store permissions with optional filtering (Admin only)"""
    query = db.query(StoreGroupPermission).filter(
        StoreGroupPermission.tenant_id == current_user.tenant_id
    )

    if store_name:
        query = query.filter(StoreGroupPermission.store_name == store_name)
    if group_id:
        query = query.filter(StoreGroupPermission.group_id == group_id)

    permissions = query.all()
    return permissions


@router.delete("/store-permissions/{permission_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_store_permission(
    permission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Revoke store permission (Admin only)"""
    permission = db.query(StoreGroupPermission).filter(
        StoreGroupPermission.id == permission_id,
        StoreGroupPermission.tenant_id == current_user.tenant_id
    ).first()
    if not permission:
        raise HTTPException(status_code=404, detail="Permission not found")

    db.delete(permission)
    db.commit()


# ==================== Dashboard Stats ====================

@router.get("/stats")
async def get_tenant_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Get current tenant usage statistics (Admin only)"""
    tid = current_user.tenant_id
    return {
        "user_count": db.query(func.count(User.id)).filter(User.tenant_id == tid).scalar(),
        "document_count": db.query(func.count(Document.id)).filter(Document.tenant_id == tid).scalar(),
        "corpus_count": db.query(func.count(Corpus.id)).filter(Corpus.tenant_id == tid).scalar(),
        "session_count": db.query(func.count(ChatSession.id)).filter(ChatSession.tenant_id == tid).scalar(),
        "message_count": db.query(func.count(Message.id)).filter(Message.tenant_id == tid).scalar(),
    }


@router.get("/analytics")
async def get_tenant_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Get tenant time-series analytics (Admin only)"""
    tid = current_user.tenant_id
    now = datetime.now(timezone.utc)
    days_14 = now - timedelta(days=14)
    days_30 = now - timedelta(days=30)

    daily_messages = (
        db.query(func.date(Message.timestamp).label("date"), func.count(Message.id).label("count"))
        .filter(Message.tenant_id == tid, Message.timestamp >= days_14, Message.role == "assistant")
        .group_by(func.date(Message.timestamp))
        .order_by(func.date(Message.timestamp))
        .all()
    )

    daily_sessions = (
        db.query(func.date(ChatSession.created_at).label("date"), func.count(ChatSession.id).label("count"))
        .filter(ChatSession.tenant_id == tid, ChatSession.created_at >= days_14)
        .group_by(func.date(ChatSession.created_at))
        .order_by(func.date(ChatSession.created_at))
        .all()
    )

    daily_users = (
        db.query(func.date(User.created_at).label("date"), func.count(User.id).label("count"))
        .filter(User.tenant_id == tid, User.created_at >= days_30)
        .group_by(func.date(User.created_at))
        .order_by(func.date(User.created_at))
        .all()
    )

    kst_timestamp = Message.timestamp + text("INTERVAL '9 hours'")
    hourly_dist = (
        db.query(func.extract('hour', kst_timestamp).label("hour"), func.count(Message.id).label("count"))
        .filter(Message.tenant_id == tid, Message.timestamp >= days_30)
        .group_by(func.extract('hour', kst_timestamp))
        .order_by(func.extract('hour', kst_timestamp))
        .all()
    )

    return {
        "daily_messages": [{"date": str(r.date), "count": r.count} for r in daily_messages],
        "daily_sessions": [{"date": str(r.date), "count": r.count} for r in daily_sessions],
        "daily_users": [{"date": str(r.date), "count": r.count} for r in daily_users],
        "hourly_distribution": [{"hour": int(r.hour), "count": r.count} for r in hourly_dist],
    }


# ==================== Chat Session Management (Admin) ====================

@router.get("/chat-sessions")
async def list_tenant_chat_sessions(
    user_id: int = Query(None, description="Filter by user ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """List all chat sessions in tenant with user info (Admin only)"""
    tid = current_user.tenant_id
    query = (
        db.query(
            ChatSession.id,
            ChatSession.title,
            ChatSession.created_at,
            ChatSession.updated_at,
            ChatSession.model_used,
            User.id.label("user_id"),
            User.username,
            User.email,
            func.count(Message.id).label("message_count"),
        )
        .join(User, ChatSession.user_id == User.id)
        .outerjoin(Message, Message.session_id == ChatSession.id)
        .filter(ChatSession.tenant_id == tid)
    )

    if user_id:
        query = query.filter(ChatSession.user_id == user_id)

    total = db.query(func.count(ChatSession.id)).filter(
        ChatSession.tenant_id == tid,
        *([ChatSession.user_id == user_id] if user_id else [])
    ).scalar()

    sessions = (
        query.group_by(ChatSession.id, User.id, User.username, User.email)
        .order_by(ChatSession.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "sessions": [
            {
                "id": s.id,
                "title": s.title,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
                "model_used": s.model_used,
                "user_id": s.user_id,
                "username": s.username,
                "email": s.email,
                "message_count": s.message_count,
            }
            for s in sessions
        ],
    }


@router.get("/chat-sessions/{session_id}/messages")
async def get_session_messages(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Get all messages in a chat session (Admin only)"""
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.tenant_id == current_user.tenant_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    user = db.query(User).filter(User.id == session.user_id).first()

    messages = (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .order_by(Message.timestamp)
        .all()
    )

    return {
        "session": {
            "id": session.id,
            "title": session.title,
            "created_at": session.created_at.isoformat() if session.created_at else None,
            "user": {
                "id": user.id if user else None,
                "username": user.username if user else "Unknown",
                "email": user.email if user else "",
            },
        },
        "messages": [
            {
                "id": m.id,
                "role": m.role.value if hasattr(m.role, 'value') else str(m.role),
                "content": m.content,
                "timestamp": m.timestamp.isoformat() if m.timestamp else None,
                "cited_sources": m.cited_sources_json,
            }
            for m in messages
        ],
    }
