"""create scan_results table with GIN index

Revision ID: 0ae581b116c7
Revises:
Create Date: 2026-03-11 00:15:20.638553

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = '0ae581b116c7'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scan_results",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("image_name", sa.String(255), nullable=False),
        sa.Column("image_digest", sa.String(255), nullable=True),
        sa.Column("scan_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary", JSONB, nullable=True),
        sa.Column("raw_report", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_raw_report", "scan_results", ["raw_report"], postgresql_using="gin")


def downgrade() -> None:
    op.drop_index("idx_raw_report", table_name="scan_results")
    op.drop_table("scan_results")
