"""Create assignment tables

Revision ID: 016_create_assignment_tables
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "016_create_assignment_tables"
down_revision = "015_create_attendance_records"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE assignment_submission_status AS ENUM ('assigned', 'submitted', 'excused');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """)

    op.create_table(
        "assignments",
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
        sa.Column("subject", sa.String(100), nullable=True),
        sa.Column("assigned_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
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
        "idx_assign_tenant_due",
        "assignments",
        ["tenant_id", "due_date"],
    )
    op.create_index(
        "idx_assign_tenant_class_due",
        "assignments",
        ["tenant_id", "class_id", "due_date"],
    )
    op.create_index(
        "idx_assign_tenant_subject_due",
        "assignments",
        ["tenant_id", "subject", "due_date"],
    )

    op.create_table(
        "assignment_submissions",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "assignment_id",
            sa.BigInteger(),
            sa.ForeignKey("assignments.id", ondelete="CASCADE"),
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
                "assigned",
                "submitted",
                "excused",
                name="assignment_submission_status",
                create_type=False,
            ),
            nullable=False,
            server_default="assigned",
        ),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("score", sa.Numeric(6, 2), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_unique_constraint(
        "uq_submission_assignment_student",
        "assignment_submissions",
        ["tenant_id", "assignment_id", "student_id"],
    )

    op.create_index(
        "idx_sub_tenant_student_status",
        "assignment_submissions",
        ["tenant_id", "student_id", "status"],
    )
    op.create_index(
        "idx_sub_tenant_assignment",
        "assignment_submissions",
        ["tenant_id", "assignment_id"],
    )


def downgrade():
    op.drop_index("idx_sub_tenant_assignment", table_name="assignment_submissions")
    op.drop_index("idx_sub_tenant_student_status", table_name="assignment_submissions")
    op.drop_constraint(
        "uq_submission_assignment_student", "assignment_submissions", type_="unique"
    )
    op.drop_table("assignment_submissions")

    op.drop_index("idx_assign_tenant_subject_due", table_name="assignments")
    op.drop_index("idx_assign_tenant_class_due", table_name="assignments")
    op.drop_index("idx_assign_tenant_due", table_name="assignments")
    op.drop_table("assignments")

    op.execute("DROP TYPE IF EXISTS assignment_submission_status")
