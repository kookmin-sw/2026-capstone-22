from typing import List, Optional
from sqlalchemy.orm import Session
from ..models.user import User
from ..models.store_permission import StoreGroupPermission


def get_accessible_stores(user: User, db: Session, api_key: Optional[str] = None) -> List[str]:
    """
    Get list of RAG corpus names that the user has access to.

    DB-based isolation: uses group permissions + tenant_id filter.
    No external API calls needed — Vertex AI uses a shared service account,
    so tenant isolation is enforced entirely at the DB level.

    Superadmin/admin without group: returns all stores for their tenant.

    Args:
        user: Current user
        db: SQLAlchemy session
        api_key: Ignored (kept for backward compatibility)

    Returns:
        List of corpus names (e.g., ["projects/.../ragCorpora/xxx"])
    """
    # Superadmin or admin without group: return all stores for their tenant
    if not user.group_id:
        if user.is_superadmin or user.is_admin:
            from ..models.corpus import Corpus
            if user.tenant_id is not None:
                corpora = db.query(Corpus).filter(Corpus.tenant_id == user.tenant_id).all()
            else:
                corpora = db.query(Corpus).all()
            return [c.corpus_name for c in corpora]
        return []

    # Get all stores the user's group has permission to access (filtered by tenant)
    query = db.query(StoreGroupPermission).filter(
        StoreGroupPermission.group_id == user.group_id,
        StoreGroupPermission.can_read == True
    )
    if user.tenant_id is not None:
        query = query.filter(StoreGroupPermission.tenant_id == user.tenant_id)
    permissions = query.all()

    return [perm.store_name for perm in permissions]
