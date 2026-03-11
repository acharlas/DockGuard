"""Redis-backed scan result cache.

Caches the scan_id of the most recent successful scan for a given image name.
TTL: 10 minutes. Degrades gracefully — if Redis is unavailable, all operations
are no-ops and scanning proceeds normally.
"""

import logging

from redis.asyncio import Redis

from app.config import settings

logger = logging.getLogger(__name__)

CACHE_TTL = 600  # 10 minutes
_client: Redis | None = None


async def _get_client() -> Redis | None:
    global _client
    if _client is not None:
        return _client
    if not settings.redis_url:
        return None
    try:
        _client = Redis.from_url(settings.redis_url, decode_responses=True)
        await _client.ping()
        logger.info("Redis connected: %s", settings.redis_url)
    except Exception as e:
        logger.warning("Redis unavailable: %s — cache disabled", e)
        _client = None
    return _client


def _key(image: str) -> str:
    return f"dockguard:scan:{image}"


async def get_cached_scan_id(image: str) -> int | None:
    """Return the cached scan_id for *image*, or None on miss / error."""
    r = await _get_client()
    if r is None:
        return None
    try:
        val = await r.get(_key(image))
        return int(val) if val else None
    except Exception as e:
        logger.warning("Redis GET error: %s", e)
        return None


async def cache_scan_result(image: str, scan_id: int) -> None:
    """Store *scan_id* for *image* with a 10-minute TTL."""
    r = await _get_client()
    if r is None:
        return
    try:
        await r.setex(_key(image), CACHE_TTL, str(scan_id))
    except Exception as e:
        logger.warning("Redis SETEX error: %s", e)
