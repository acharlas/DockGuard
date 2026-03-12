"""add build analysis fields

Revision ID: c4a6e7f0b9d1
Revises: b7e3c9d4a1f2
Create Date: 2026-03-12 20:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "c4a6e7f0b9d1"
down_revision: Union[str, Sequence[str], None] = "b7e3c9d4a1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scan_results",
        sa.Column("build_status", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "scan_results",
        sa.Column("build_failure_reason", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "scan_results",
        sa.Column(
            "build_summary",
            sa.JSON().with_variant(
                postgresql.JSONB(astext_type=sa.Text()),
                "postgresql",
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "scan_results",
        sa.Column(
            "build_report",
            sa.JSON().with_variant(
                postgresql.JSONB(astext_type=sa.Text()),
                "postgresql",
            ),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("scan_results", "build_report")
    op.drop_column("scan_results", "build_summary")
    op.drop_column("scan_results", "build_failure_reason")
    op.drop_column("scan_results", "build_status")
