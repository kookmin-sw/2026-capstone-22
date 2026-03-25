"""Add search_backend column to tenants table

Revision ID: 010
Revises: 009
Create Date: 2026-03-25
"""
from alembic import op
import sqlalchemy as sa

revision = '010_add_search_backend'
down_revision = '009_create_usage_records'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tenants', sa.Column(
        'search_backend',
        sa.String(30),
        nullable=False,
        server_default='rag_engine'
    ))


def downgrade():
    op.drop_column('tenants', 'search_backend')
