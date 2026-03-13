import asyncio
import logging

logger = logging.getLogger(__name__)
_MAX_CAPTURED_STDERR_BYTES = 32 * 1024

# In-process state — requires single uvicorn worker (default).
# Multi-worker deployments would need an external store for cancellation.
running_processes: dict[int, asyncio.subprocess.Process] = {}


async def cancel_running_process(scan_id: int) -> None:
    process = running_processes.get(scan_id)
    if process is not None and process.returncode is None:
        process.kill()


async def _stream_stderr(
    process: asyncio.subprocess.Process,
    scan_id: int,
    label: str,
) -> bytes:
    lines = bytearray()
    truncated = False
    while True:
        line = await process.stderr.readline()
        if not line:
            break
        logger.info(
            "Scan %d [%s]: %s",
            scan_id,
            label,
            line.decode(errors="replace").rstrip(),
        )
        remaining = _MAX_CAPTURED_STDERR_BYTES - len(lines)
        if remaining <= 0:
            truncated = True
            continue
        lines.extend(line[:remaining])
        truncated = truncated or len(line) > remaining
    if truncated:
        lines.extend(b"\n... stderr truncated ...")
    return bytes(lines)


async def _read_stdout(
    process: asyncio.subprocess.Process,
    capture_stdout: bool,
) -> bytes:
    chunks: list[bytes] = []
    while True:
        chunk = await process.stdout.read(4096)
        if not chunk:
            break
        if capture_stdout:
            chunks.append(chunk)
    return b"".join(chunks)


async def run_logged_command(
    scan_id: int,
    label: str,
    *args: str,
    timeout: int,
    capture_stdout: bool = True,
) -> bytes:
    process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    running_processes[scan_id] = process
    try:
        stdout, stderr = await asyncio.wait_for(
            asyncio.gather(
                _read_stdout(process, capture_stdout),
                _stream_stderr(process, scan_id, label),
            ),
            timeout=timeout,
        )
    finally:
        running_processes.pop(scan_id, None)
        if process.returncode is None:
            try:
                await asyncio.wait_for(process.wait(), timeout=1)
            except TimeoutError:
                process.kill()
                await process.wait()
        else:
            await process.wait()

    if process.returncode != 0:
        raise RuntimeError(
            f"{label} exited with code {process.returncode}: {stderr.decode().strip()}"
        )
    return stdout
