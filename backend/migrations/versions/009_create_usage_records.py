"""Create usage_records table for billing/usage tracking

Revision ID: 009
"""
from alembic import op
import sqlalchemy as sa


revision = '009_create_usage_records'
down_revision = '008_tenant_not_null'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'usage_records',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('session_id', sa.Integer(), sa.ForeignKey('chat_sessions.id', ondelete='SET NULL'), nullable=True),
        sa.Column('call_type', sa.String(50), nullable=False),
        sa.Column('model_name', sa.String(255), nullable=False),
        sa.Column('prompt_token_count', sa.Integer(), server_default='0'),
        sa.Column('candidates_token_count', sa.Integer(), server_default='0'),
        sa.Column('total_token_count', sa.Integer(), server_default='0'),
        sa.Column('estimated_cost_usd', sa.Float(), server_default='0.0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_usage_tenant_date', 'usage_records', ['tenant_id', 'created_at'])


def downgrade():
    op.drop_index('idx_usage_tenant_date', table_name='usage_records')
    op.drop_table('usage_records')
