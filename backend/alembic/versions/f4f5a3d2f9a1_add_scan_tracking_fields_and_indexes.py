"""add scan tracking fields and indexes

Revision ID: f4f5a3d2f9a1
Revises: 0ae581b116c7
Create Date: 2026-03-12 14:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f4f5a3d2f9a1"
down_revision: Union[str, Sequence[str], None] = "0ae581b116c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scan_results",
        sa.Column("requested_by", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "scan_results",
        sa.Column("failure_reason", sa.String(length=255), nullable=True),
    )
    op.create_index(
        "idx_image_status",
        "scan_results",
        ["image_name", "scan_status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_image_status", table_name="scan_results")
    op.drop_column("scan_results", "failure_reason")
    op.drop_column("scan_results", "requested_by")
