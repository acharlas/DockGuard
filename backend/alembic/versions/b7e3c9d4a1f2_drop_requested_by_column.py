"""drop requested_by column

Revision ID: b7e3c9d4a1f2
Revises: 9c6e5f0f2b7c
Create Date: 2026-03-12 18:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7e3c9d4a1f2"
down_revision: Union[str, Sequence[str], None] = "9c6e5f0f2b7c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("scan_results", "requested_by")


def downgrade() -> None:
    op.add_column(
        "scan_results",
        sa.Column("requested_by", sa.String(length=255), nullable=True),
    )
