"""Create attendance_records table

Revision ID: 015_create_attendance_records
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "015_create_attendance_records"
down_revision = "014_add_auth_tables"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'early_leave');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """)

    op.create_table(
        "attendance_records",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "student_id",
            sa.BigInteger(),
            sa.ForeignKey("students.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "class_id",
            sa.Integer(),
            sa.ForeignKey("student_classes.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("attendance_date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "present",
                "absent",
                "late",
                "early_leave",
                name="attendance_status",
                create_type=False,
            ),
            nullable=False,
            server_default="present",
        ),
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

    op.create_unique_constraint(
        "uq_attendance_student_date",
        "attendance_records",
        ["tenant_id", "student_id", "attendance_date"],
    )

    op.create_index(
        "idx_att_tenant_date",
        "attendance_records",
        ["tenant_id", "attendance_date"],
    )
    op.create_index(
        "idx_att_tenant_class_date",
        "attendance_records",
        ["tenant_id", "class_id", "attendance_date"],
    )
    op.create_index(
        "idx_att_tenant_status",
        "attendance_records",
        ["tenant_id", "status", "attendance_date"],
    )


def downgrade():
    op.drop_index("idx_att_tenant_status", table_name="attendance_records")
    op.drop_index("idx_att_tenant_class_date", table_name="attendance_records")
    op.drop_index("idx_att_tenant_date", table_name="attendance_records")
    op.drop_constraint(
        "uq_attendance_student_date", "attendance_records", type_="unique"
    )
    op.drop_table("attendance_records")
    op.execute("DROP TYPE IF EXISTS attendance_status")
