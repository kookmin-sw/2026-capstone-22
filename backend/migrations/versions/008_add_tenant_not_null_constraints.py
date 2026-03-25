"""Add NOT NULL constraints to tenant_id columns (except users)

Revision ID: 008_tenant_not_null
Revises: 007_drop_gdrive
Create Date: 2026-03-11

"""
from alembic import op
import sqlalchemy as sa


revision = '008_tenant_not_null'
down_revision = '007_drop_gdrive'
branch_labels = None
depends_on = None


def upgrade():
    # Add NOT NULL to tenant_id on tables where all rows should have a tenant
    # users: kept nullable (superadmin has NULL tenant_id)
    tables = [
        'groups', 'corpora', 'documents', 'chat_sessions',
        'messages', 'store_group_permissions', 'prompt_templates', 'ai_models'
    ]
    for table in tables:
        op.alter_column(table, 'tenant_id', nullable=False, existing_type=sa.Integer())


def downgrade():
    tables = [
        'groups', 'corpora', 'documents', 'chat_sessions',
        'messages', 'store_group_permissions', 'prompt_templates', 'ai_models'
    ]
    for table in tables:
        op.alter_column(table, 'tenant_id', nullable=True, existing_type=sa.Integer())
