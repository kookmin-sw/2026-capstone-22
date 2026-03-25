"""Add gcs_path column to documents table

Revision ID: 003_add_gcs_path
Revises: 002_add_external_sso_fields
Create Date: 2026-03-11

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '003_add_gcs_path'
down_revision = '002_add_external_sso_fields'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('documents', sa.Column('gcs_path', sa.String(), nullable=True))


def downgrade():
    op.drop_column('documents', 'gcs_path')
