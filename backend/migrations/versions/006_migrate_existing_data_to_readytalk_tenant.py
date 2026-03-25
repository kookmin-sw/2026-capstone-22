"""Migrate existing data to readytalk tenant

Revision ID: 006_migrate_data
Revises: 005_add_tenant_id
Create Date: 2026-03-11

"""
from alembic import op
import sqlalchemy as sa


revision = '006_migrate_data'
down_revision = '005_add_tenant_id'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Create readytalk tenant
    op.execute("""
        INSERT INTO tenants (name, slug, status)
        VALUES ('ReadyTalk', 'readytalk', 'active')
        ON CONFLICT (slug) DO NOTHING
    """)

    # 2. Get the readytalk tenant id
    # Assign all existing data to readytalk tenant
    op.execute("""
        UPDATE users SET tenant_id = (SELECT id FROM tenants WHERE slug = 'readytalk')
        WHERE tenant_id IS NULL AND is_superadmin = FALSE
    """)
    op.execute("""
        UPDATE groups SET tenant_id = (SELECT id FROM tenants WHERE slug = 'readytalk')
        WHERE tenant_id IS NULL
    """)
    op.execute("""
        UPDATE corpora SET tenant_id = (SELECT id FROM tenants WHERE slug = 'readytalk')
        WHERE tenant_id IS NULL
    """)
    op.execute("""
        UPDATE documents SET tenant_id = (SELECT id FROM tenants WHERE slug = 'readytalk')
        WHERE tenant_id IS NULL
    """)
    op.execute("""
        UPDATE chat_sessions SET tenant_id = (SELECT id FROM tenants WHERE slug = 'readytalk')
        WHERE tenant_id IS NULL
    """)
    op.execute("""
        UPDATE messages SET tenant_id = (SELECT id FROM tenants WHERE slug = 'readytalk')
        WHERE tenant_id IS NULL
    """)
    op.execute("""
        UPDATE store_group_permissions SET tenant_id = (SELECT id FROM tenants WHERE slug = 'readytalk')
        WHERE tenant_id IS NULL
    """)
    op.execute("""
        UPDATE prompt_templates SET tenant_id = (SELECT id FROM tenants WHERE slug = 'readytalk')
        WHERE tenant_id IS NULL
    """)
    op.execute("""
        UPDATE ai_models SET tenant_id = (SELECT id FROM tenants WHERE slug = 'readytalk')
        WHERE tenant_id IS NULL
    """)


def downgrade():
    # Set all tenant_id back to NULL
    op.execute("UPDATE users SET tenant_id = NULL")
    op.execute("UPDATE groups SET tenant_id = NULL")
    op.execute("UPDATE corpora SET tenant_id = NULL")
    op.execute("UPDATE documents SET tenant_id = NULL")
    op.execute("UPDATE chat_sessions SET tenant_id = NULL")
    op.execute("UPDATE messages SET tenant_id = NULL")
    op.execute("UPDATE store_group_permissions SET tenant_id = NULL")
    op.execute("UPDATE prompt_templates SET tenant_id = NULL")
    op.execute("UPDATE ai_models SET tenant_id = NULL")

    # Remove readytalk tenant
    op.execute("DELETE FROM tenants WHERE slug = 'readytalk'")
