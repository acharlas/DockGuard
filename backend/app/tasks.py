"""Background task registry — holds strong references to prevent GC."""

import asyncio
from collections.abc import Coroutine

_background_tasks: set[asyncio.Task] = set()


def create_background_task(coro: Coroutine) -> asyncio.Task:
    """Create an asyncio task with a strong reference held until completion."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task
