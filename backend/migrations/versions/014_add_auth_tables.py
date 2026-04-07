"""Add student_access_links and verification_challenges tables

Revision ID: 014_add_auth_tables
"""

import sqlalchemy as sa
from alembic import op

revision = "014_add_auth_tables"
down_revision = "013_add_parent_fields"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "student_access_links",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "relationship_type",
            sa.Enum(
                "self", "mother", "father", "guardian", name="relationship_type_enum"
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("active", "revoked", name="access_link_status_enum"),
            nullable=False,
        ),
        sa.Column(
            "verified_by",
            sa.Enum("phone_otp", "admin", name="verified_by_enum"),
            nullable=False,
        ),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "tenant_id", "user_id", "student_id", name="uq_student_access_link"
        ),
    )
    op.create_index(op.f("ix_student_access_links_id"), "student_access_links", ["id"])

    op.create_table(
        "verification_challenges",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("target_phone", sa.String(30), nullable=False),
        sa.Column("code_hash", sa.String(128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        op.f("ix_verification_challenges_id"), "verification_challenges", ["id"]
    )


def downgrade():
    op.drop_index(
        op.f("ix_verification_challenges_id"), table_name="verification_challenges"
    )
    op.drop_table("verification_challenges")

    op.drop_index(op.f("ix_student_access_links_id"), table_name="student_access_links")
    op.drop_table("student_access_links")

    op.execute("DROP TYPE IF EXISTS verified_by_enum")
    op.execute("DROP TYPE IF EXISTS access_link_status_enum")
    op.execute("DROP TYPE IF EXISTS relationship_type_enum")
