"""Add parent_name and parent_phone to students table

Revision ID: 013
"""

import sqlalchemy as sa
from alembic import op

revision = "013_add_parent_fields_to_students"
down_revision = "012_create_student_tables"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("students", sa.Column("parent_name", sa.String(50), nullable=True))
    op.add_column("students", sa.Column("parent_phone", sa.String(30), nullable=True))


def downgrade():
    op.drop_column("students", "parent_phone")
    op.drop_column("students", "parent_name")
