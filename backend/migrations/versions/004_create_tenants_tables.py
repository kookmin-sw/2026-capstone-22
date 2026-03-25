"""Create tenants, tenant_gcp_configs, tenant_kakao_configs tables

Revision ID: 004_create_tenants
Revises: 003_add_gcs_path
Create Date: 2026-03-11

"""
from alembic import op
import sqlalchemy as sa


revision = '004_create_tenants'
down_revision = '003_add_gcs_path'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'tenants',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(100), nullable=False),
        sa.Column('status', sa.String(20), server_default='active', nullable=False),
        sa.Column('logo_url', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('idx_tenants_slug', 'tenants', ['slug'], unique=True)

    op.create_table(
        'tenant_gcp_configs',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), unique=True, nullable=False),
        sa.Column('gcp_project_id', sa.String(255), nullable=False),
        sa.Column('gemini_api_key_encrypted', sa.String(500), nullable=True),
        sa.Column('gcs_bucket_name', sa.String(255), nullable=True),
        sa.Column('gcs_credentials_encrypted', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'tenant_kakao_configs',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), unique=True, nullable=False),
        sa.Column('channel_id', sa.String(255), nullable=True),
        sa.Column('bot_id', sa.String(255), nullable=True),
        sa.Column('skill_url', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('idx_kakao_channel', 'tenant_kakao_configs', ['channel_id'], unique=True)


def downgrade():
    op.drop_table('tenant_kakao_configs')
    op.drop_table('tenant_gcp_configs')
    op.drop_table('tenants')
