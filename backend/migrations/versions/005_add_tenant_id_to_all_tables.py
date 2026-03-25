"""Add tenant_id to all existing tables and is_superadmin to users

Revision ID: 005_add_tenant_id
Revises: 004_create_tenants
Create Date: 2026-03-11

"""
from alembic import op
import sqlalchemy as sa


revision = '005_add_tenant_id'
down_revision = '004_create_tenants'
branch_labels = None
depends_on = None


def upgrade():
    # Users: add tenant_id and is_superadmin
    op.add_column('users', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=True))
    op.add_column('users', sa.Column('is_superadmin', sa.Boolean(), server_default='false', nullable=False))
    op.create_index('idx_users_tenant', 'users', ['tenant_id'])

    # Groups: add tenant_id
    op.add_column('groups', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=True))
    op.create_index('idx_groups_tenant', 'groups', ['tenant_id'])

    # Corpora
    op.add_column('corpora', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=True))
    op.create_index('idx_corpora_tenant', 'corpora', ['tenant_id'])

    # Documents
    op.add_column('documents', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=True))
    op.create_index('idx_documents_tenant', 'documents', ['tenant_id'])

    # Chat Sessions
    op.add_column('chat_sessions', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=True))
    op.create_index('idx_chat_sessions_tenant', 'chat_sessions', ['tenant_id'])

    # Messages
    op.add_column('messages', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=True))
    op.create_index('idx_messages_tenant', 'messages', ['tenant_id'])

    # Store Group Permissions
    op.add_column('store_group_permissions', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=True))
    op.create_index('idx_store_permissions_tenant', 'store_group_permissions', ['tenant_id'])

    # Prompt Templates
    op.add_column('prompt_templates', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=True))
    op.create_index('idx_prompt_templates_tenant', 'prompt_templates', ['tenant_id'])

    # AI Models
    op.add_column('ai_models', sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=True))
    op.create_index('idx_ai_models_tenant', 'ai_models', ['tenant_id'])


def downgrade():
    # AI Models
    op.drop_index('idx_ai_models_tenant')
    op.drop_column('ai_models', 'tenant_id')

    # Prompt Templates
    op.drop_index('idx_prompt_templates_tenant')
    op.drop_column('prompt_templates', 'tenant_id')

    # Store Group Permissions
    op.drop_index('idx_store_permissions_tenant')
    op.drop_column('store_group_permissions', 'tenant_id')

    # Messages
    op.drop_index('idx_messages_tenant')
    op.drop_column('messages', 'tenant_id')

    # Chat Sessions
    op.drop_index('idx_chat_sessions_tenant')
    op.drop_column('chat_sessions', 'tenant_id')

    # Documents
    op.drop_index('idx_documents_tenant')
    op.drop_column('documents', 'tenant_id')

    # Corpora
    op.drop_index('idx_corpora_tenant')
    op.drop_column('corpora', 'tenant_id')

    # Groups
    op.drop_index('idx_groups_tenant')
    op.drop_column('groups', 'tenant_id')

    # Users
    op.drop_index('idx_users_tenant')
    op.drop_column('users', 'is_superadmin')
    op.drop_column('users', 'tenant_id')
