"""Drop Google Drive related tables and columns

Revision ID: 007_drop_gdrive
Revises: 006_migrate_data
Create Date: 2026-03-11

"""
from alembic import op
import sqlalchemy as sa


revision = '007_drop_gdrive'
down_revision = '006_migrate_data'
branch_labels = None
depends_on = None


def upgrade():
    # Drop gdrive tables (order matters due to no FK dependencies between them)
    op.execute("DROP TABLE IF EXISTS gdrive_sync_logs")
    op.execute("DROP TABLE IF EXISTS gdrive_sync_files")
    op.execute("DROP TABLE IF EXISTS gdrive_sync_config")
    op.execute("DROP TABLE IF EXISTS gdrive_files")

    # Drop gdrive columns from documents
    op.drop_column('documents', 'gdrive_link')
    op.drop_column('documents', 'gdrive_file_link')


def downgrade():
    # Re-add gdrive columns to documents
    op.add_column('documents', sa.Column('gdrive_link', sa.String(), nullable=True))
    op.add_column('documents', sa.Column('gdrive_file_link', sa.String(), nullable=True))

    # Note: gdrive tables are not recreated in downgrade
    # They would need manual recreation if needed
