"""Create hitl_requests table for HITL (Human-In-The-Loop) tracking

Revision ID: 011
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "011_create_hitl_requests"
down_revision = "010_add_search_backend"
branch_labels = None
depends_on = None


def upgrade():
    # Enum 타입 raw SQL로 생성 (Alembic 이벤트 리스너 중복 생성 방지)
    op.execute("CREATE TYPE hitl_status AS ENUM ('pending', 'resolved')")

    # create_type=False: 위에서 이미 만들었으므로 SQLAlchemy가 재생성하지 않도록
    hitl_status_enum = postgresql.ENUM(
        "pending", "resolved", name="hitl_status", create_type=False
    )

    op.create_table(
        "hitl_requests",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False
        ),
        sa.Column(
            "session_id",
            sa.Integer(),
            sa.ForeignKey("chat_sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("user_message", sa.Text(), nullable=False),
        sa.Column("ai_response", sa.Text(), nullable=True),
        sa.Column("hitl_reason", sa.Text(), nullable=True),
        sa.Column(
            "status",
            hitl_status_enum,
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "resolved_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # 복합 인덱스: 어드민 목록 조회 최적화 (tenant_id + status + created_at)
    op.create_index(
        "idx_hitl_tenant_status_created",
        "hitl_requests",
        ["tenant_id", "status", "created_at"],
    )


def downgrade():
    op.drop_index("idx_hitl_tenant_status_created", table_name="hitl_requests")
    op.drop_table("hitl_requests")
    op.execute("DROP TYPE IF EXISTS hitl_status")
