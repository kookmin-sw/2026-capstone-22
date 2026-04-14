"""Create exam tables

Revision ID: 017_create_exam_tables
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "017_create_exam_tables"
down_revision = "016_create_assignment_tables"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE exam_result_status AS ENUM ('pending', 'completed', 'absent', 'excused');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """)

    op.create_table(
        "exams",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "class_id",
            sa.Integer(),
            sa.ForeignKey("student_classes.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("exam_date", sa.Date(), nullable=False),
        sa.Column(
            "max_score",
            sa.Numeric(6, 2),
            nullable=False,
            server_default="100",
        ),
        sa.Column("exam_type", sa.String(50), nullable=True),
        sa.Column("memo", sa.Text(), nullable=True),
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

    op.create_index(
        "idx_exam_tenant_date",
        "exams",
        ["tenant_id", "exam_date"],
    )
    op.create_index(
        "idx_exam_tenant_class_date",
        "exams",
        ["tenant_id", "class_id", "exam_date"],
    )

    op.create_table(
        "exam_results",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "exam_id",
            sa.BigInteger(),
            sa.ForeignKey("exams.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "student_id",
            sa.BigInteger(),
            sa.ForeignKey("students.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(
                "pending",
                "completed",
                "absent",
                "excused",
                name="exam_result_status",
                create_type=False,
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("score", sa.Numeric(6, 2), nullable=True),
        sa.Column("grade", sa.String(20), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_unique_constraint(
        "uq_exam_result_exam_student",
        "exam_results",
        ["tenant_id", "exam_id", "student_id"],
    )

    op.create_index(
        "idx_exam_result_tenant_student_status",
        "exam_results",
        ["tenant_id", "student_id", "status"],
    )
    op.create_index(
        "idx_exam_result_tenant_exam",
        "exam_results",
        ["tenant_id", "exam_id"],
    )


def downgrade():
    op.drop_index("idx_exam_result_tenant_exam", table_name="exam_results")
    op.drop_index("idx_exam_result_tenant_student_status", table_name="exam_results")
    op.drop_constraint("uq_exam_result_exam_student", "exam_results", type_="unique")
    op.drop_table("exam_results")

    op.drop_index("idx_exam_tenant_class_date", table_name="exams")
    op.drop_index("idx_exam_tenant_date", table_name="exams")
    op.drop_table("exams")

    op.execute("DROP TYPE IF EXISTS exam_result_status")
