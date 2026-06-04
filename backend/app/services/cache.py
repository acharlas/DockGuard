"""Redis-backed scan result cache keyed by immutable digest."""

import logging
import urllib.parse

import httpx
from redis.asyncio import Redis
from redis.exceptions import (
    ConnectionError as RedisConnectionError,
)
from redis.exceptions import (
    TimeoutError as RedisTimeoutError,
)

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
        raw = await r.get(_digest_key(digest))
        if not raw:
            return None
        return int(raw)
    except ValueError:
        logger.warning("Redis cached value for digest %s is not an integer", digest)
        return None
    except (RedisConnectionError, RedisTimeoutError):
        global _client
        _client = None
        logger.warning("Redis connection lost — cache disabled until reconnection")
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
    except (RedisConnectionError, RedisTimeoutError):
        global _client
        _client = None
        logger.warning("Redis connection lost — cache disabled until reconnection")


def _tag_cache_key(image_name: str) -> str:
    return f"dockguard:tag:digest:{image_name}"


async def resolve_tag_digest(image_name: str) -> str | None:
    """Resolve an image tag to its immutable digest.

    Checks Redis cache first (5-min TTL), falls back to the OCI registry
    HTTP API for Docker Hub and GHCR public images.
    """
    if "@" in image_name or ":" not in image_name:
        return None

    r = await _get_client()
    if r is not None:
        try:
            cached = await r.get(_tag_cache_key(image_name))
            if cached:
                return cached
        except Exception:
            pass

    parsed = urllib.parse.urlparse(f"//{image_name}")
    host = parsed.hostname or ""

    has_host = "://" not in image_name and "/" in image_name.split(":")[0]
    if (
        host
        in (
            "docker.io",
            "registry-1.docker.io",
            "index.docker.io",
        )
        or not has_host
    ):
        digest = await _resolve_docker_hub_digest(image_name)
    elif host == "ghcr.io":
        digest = await _resolve_ghcr_digest(image_name)
    else:
        return None

    if digest and r is not None:
        try:
            await r.setex(
                _tag_cache_key(image_name),
                settings.tag_dedup_cache_seconds,
                digest,
            )
        except Exception:
            pass

    return digest


_DOCKER_HUB_REGISTRY = "registry-1.docker.io"


async def _resolve_docker_hub_digest(image_name: str) -> str | None:
    repo, _, tag = image_name.partition(":")
    if not tag:
        tag = "latest"

    parts = repo.split("/")
    if len(parts) == 1:
        namespace = "library"
        repo_name = parts[0]
    else:
        namespace = parts[0]
        repo_name = "/".join(parts[1:])

    repo_path = f"{namespace}/{repo_name}"

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            token_resp = await client.get(
                f"https://auth.docker.io/token"
                f"?service=registry.docker.io"
                f"&scope=repository:{repo_path}:pull",
            )
            token_resp.raise_for_status()
            token = token_resp.json()["token"]
        except Exception as e:
            logger.debug("Docker Hub auth failed for %s: %s", image_name, e)
            return None

        try:
            manifest_url = (
                f"https://{_DOCKER_HUB_REGISTRY}/v2/{repo_path}/manifests/{tag}"
            )
            head_resp = await client.head(
                manifest_url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": (
                        "application/vnd.docker.distribution.manifest.v2+json,"
                        "application/vnd.oci.image.manifest.v1+json,"
                        "application/vnd.docker.distribution.manifest.v1+json"
                    ),
                },
            )
            head_resp.raise_for_status()
        except Exception as e:
            logger.debug("Docker Hub manifest fetch failed for %s: %s", image_name, e)
            return None

    digest = head_resp.headers.get("docker-content-digest")
    if not digest:
        logger.debug("Docker Hub response missing digest header for %s", image_name)
    return digest


_GHCR_REGISTRY = "ghcr.io"


async def _resolve_ghcr_digest(image_name: str) -> str | None:
    repo, _, tag = image_name.partition(":")
    if not tag:
        tag = "latest"
    repo_path = repo if "/" in repo else f"library/{repo}"

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.head(
                f"https://{_GHCR_REGISTRY}/v2/{repo_path}/manifests/{tag}",
                headers={
                    "Accept": (
                        "application/vnd.docker.distribution.manifest.v2+json,"
                        "application/vnd.oci.image.manifest.v1+json,"
                        "application/vnd.docker.distribution.manifest.v1+json"
                    ),
                },
            )
            resp.raise_for_status()
        except Exception as e:
            logger.debug("GHCR manifest fetch failed for %s: %s", image_name, e)
            return None

    digest = resp.headers.get("docker-content-digest")
    if not digest:
        logger.debug("GHCR response missing digest header for %s", image_name)
    return digest
