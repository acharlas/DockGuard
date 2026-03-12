"""Redis-backed scan result cache keyed by immutable digest."""

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


def _digest_key(digest: str) -> str:
    return f"dockguard:scan:digest:{digest}"


def extract_requested_digest(image: str) -> str | None:
    _, separator, digest = image.partition("@")
    if separator and digest.startswith("sha256:"):
        return digest
    return None


async def get_cached_scan_id_for_digest(digest: str | None) -> int | None:
    """Return the cached scan_id for *digest*, or None on miss / error."""
    if not digest:
        return None
    r = await _get_client()
    if r is None:
        return None
    try:
        val = await r.get(_digest_key(digest))
        return int(val) if val else None
    except Exception as e:
        logger.warning("Redis GET error: %s", e)
        return None


async def cache_scan_result(digest: str | None, scan_id: int) -> None:
    """Store *scan_id* for *digest* with a 10-minute TTL."""
    if not digest:
        return
    r = await _get_client()
    if r is None:
        return
    try:
        await r.setex(_digest_key(digest), CACHE_TTL, str(scan_id))
    except Exception as e:
        logger.warning("Redis SETEX error: %s", e)
