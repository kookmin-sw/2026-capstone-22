"""Add realtime_file_list_json column to messages table

Revision ID: 001_add_realtime_file_list
Revises:
Create Date: 2026-01-06

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001_add_realtime_file_list'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Add realtime_file_list_json column to messages table
    op.add_column('messages', sa.Column('realtime_file_list_json', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('messages', 'realtime_file_list_json')
