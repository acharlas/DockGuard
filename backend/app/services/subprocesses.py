import asyncio
import logging

logger = logging.getLogger(__name__)

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
    lines = []
    while True:
        line = await process.stderr.readline()
        if not line:
            break
        lines.append(line)
        logger.info("Scan %d [%s]: %s", scan_id, label, line.decode().rstrip())
    return b"".join(lines)


async def run_logged_command(
    scan_id: int,
    label: str,
    *args: str,
    timeout: int,
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
                process.stdout.read(),
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
