"""Add external SSO fields to users table

Revision ID: 002
Revises: 001_add_realtime_file_list_json
Create Date: 2026-01-27

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '002_add_external_sso_fields'
down_revision = '001_add_realtime_file_list'
branch_labels = None
depends_on = None


def upgrade():
    # Add external SSO fields to users table
    op.add_column('users', sa.Column('external_user_id', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('staff_no', sa.Integer(), nullable=True))
    op.add_column('users', sa.Column('external_branch', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('external_univ', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('phone', sa.String(20), nullable=True))
    op.add_column('users', sa.Column('auth_provider', sa.String(20), nullable=True, server_default='local'))

    # Create unique index on external_user_id
    op.create_index('ix_users_external_user_id', 'users', ['external_user_id'], unique=True)


def downgrade():
    op.drop_index('ix_users_external_user_id', table_name='users')
    op.drop_column('users', 'auth_provider')
    op.drop_column('users', 'phone')
    op.drop_column('users', 'external_univ')
    op.drop_column('users', 'external_branch')
    op.drop_column('users', 'staff_no')
    op.drop_column('users', 'external_user_id')
