"""clean up scan state and indexes

Revision ID: 9c6e5f0f2b7c
Revises: f4f5a3d2f9a1
Create Date: 2026-03-12 16:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9c6e5f0f2b7c"
down_revision: Union[str, Sequence[str], None] = "f4f5a3d2f9a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scan_results",
        sa.Column("cancel_requested_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.alter_column(
        "scan_results",
        "started_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
        server_default=None,
    )
    op.execute("UPDATE scan_results SET started_at = NULL WHERE scan_status = 'pending'")
    op.execute("DROP INDEX IF EXISTS idx_raw_report")


def downgrade() -> None:
    op.create_index(
        "idx_raw_report",
        "scan_results",
        ["raw_report"],
        unique=False,
        postgresql_using="gin",
    )
    op.execute("UPDATE scan_results SET started_at = created_at WHERE started_at IS NULL")
    op.alter_column(
        "scan_results",
        "started_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )
    op.drop_column("scan_results", "cancel_requested_at")
