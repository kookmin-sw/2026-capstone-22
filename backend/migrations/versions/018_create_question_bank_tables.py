"""Create question bank tables

Revision ID: 018_create_question_bank_tables
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "018_create_question_bank_tables"
down_revision = "017_create_exam_tables"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE paper_status AS ENUM ('pending', 'processing', 'done', 'failed');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE review_status AS ENUM ('pending', 'reviewed');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    op.create_table(
        "exam_papers",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("subject", sa.String(50), nullable=False, server_default="영어"),
        sa.Column("grade", sa.String(20), nullable=True),
        sa.Column("source_year", sa.Integer(), nullable=True),
        sa.Column("source_type", sa.String(50), nullable=True),
        sa.Column("source", sa.String(200), nullable=True),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(
                "pending", "processing", "done", "failed",
                name="paper_status",
                create_type=False,
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("total_questions", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_exam_paper_tenant", "exam_papers", ["tenant_id"])

    op.create_table(
        "question_items",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "paper_id",
            sa.BigInteger(),
            sa.ForeignKey("exam_papers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("question_number", sa.Integer(), nullable=False),
        sa.Column("area", sa.String(20), nullable=True),
        sa.Column("problem_type", sa.String(50), nullable=True),
        sa.Column("concept_tag", sa.String(100), nullable=True),
        sa.Column("difficulty", sa.String(10), nullable=True),
        sa.Column("question_format", sa.String(20), nullable=True, server_default="객관식"),
        sa.Column("is_listening", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("score_point", sa.Integer(), nullable=True),
        sa.Column("question_body", sa.Text(), nullable=True),
        sa.Column("choices", postgresql.JSONB(), nullable=True),
        sa.Column("answer", sa.String(10), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("classifier_reason", sa.Text(), nullable=True),
        sa.Column(
            "review_status",
            postgresql.ENUM(
                "pending", "reviewed",
                name="review_status",
                create_type=False,
            ),
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
    )
    op.create_index("idx_question_item_paper", "question_items", ["paper_id"])
    op.create_index(
        "idx_question_item_tenant_type",
        "question_items",
        ["tenant_id", "problem_type"],
    )


def downgrade():
    op.drop_index("idx_question_item_tenant_type", table_name="question_items")
    op.drop_index("idx_question_item_paper", table_name="question_items")
    op.drop_table("question_items")

    op.drop_index("idx_exam_paper_tenant", table_name="exam_papers")
    op.drop_table("exam_papers")

    op.execute("DROP TYPE IF EXISTS review_status")
    op.execute("DROP TYPE IF EXISTS paper_status")
