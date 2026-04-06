"""Create student_classes and students tables

Revision ID: 012
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "012_create_student_tables"
down_revision = "011_create_hitl_requests"
branch_labels = None
depends_on = None


def upgrade():
    # Enum 타입 raw SQL로 생성 (Alembic 이벤트 리스너 중복 생성 방지)
    op.execute("CREATE TYPE student_class_status AS ENUM ('active', 'closed')")
    op.execute("CREATE TYPE student_status AS ENUM ('active', 'inactive', 'graduated')")

    student_class_status_enum = postgresql.ENUM(
        "active", "closed", name="student_class_status", create_type=False
    )
    student_status_enum = postgresql.ENUM(
        "active", "inactive", "graduated", name="student_status", create_type=False
    )

    # student_classes 먼저 생성 (students FK 참조 순서)
    op.create_table(
        "student_classes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(50), nullable=True),
        sa.Column("grade_level", sa.String(50), nullable=True),
        sa.Column("subject", sa.String(50), nullable=True),
        sa.Column("teacher_name", sa.String(50), nullable=True),
        sa.Column("day_of_week", sa.String(20), nullable=True),
        sa.Column("start_time", sa.String(10), nullable=True),
        sa.Column("end_time", sa.String(10), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            student_class_status_enum,
            nullable=False,
            server_default="active",
        ),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "code", name="uq_student_class_code_tenant"),
    )

    op.create_index("idx_student_classes_tenant", "student_classes", ["tenant_id"])

    # students 생성
    op.create_table(
        "students",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False
        ),
        sa.Column(
            "class_id",
            sa.Integer(),
            sa.ForeignKey("student_classes.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("student_no", sa.String(50), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("birth_date", sa.Date(), nullable=False),
        sa.Column("school_name", sa.String(100), nullable=True),
        sa.Column("grade", sa.String(50), nullable=True),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column(
            "status",
            student_status_enum,
            nullable=False,
            server_default="active",
        ),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "student_no", name="uq_student_no_tenant"),
    )

    op.create_index("idx_students_tenant", "students", ["tenant_id"])
    op.create_index("idx_students_class", "students", ["class_id"])


def downgrade():
    op.drop_index("idx_students_class", table_name="students")
    op.drop_index("idx_students_tenant", table_name="students")
    op.drop_table("students")

    op.drop_index("idx_student_classes_tenant", table_name="student_classes")
    op.drop_table("student_classes")

    op.execute("DROP TYPE IF EXISTS student_status")
    op.execute("DROP TYPE IF EXISTS student_class_status")
