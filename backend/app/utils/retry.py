"""Async retry helper with exponential backoff for external API calls."""
import asyncio
import random
from typing import Awaitable, Callable, Optional, TypeVar

T = TypeVar("T")


def backoff_seconds(attempt: int, retry_after: Optional[float] = None, cap: float = 20.0) -> float:
    if retry_after and retry_after > 0:
        return min(retry_after, cap)
    return min(0.5 * (2 ** attempt) + random.uniform(0, 0.25), 8.0)


async def with_retries(
    fn: Callable[[], Awaitable[T]],
    *,
    max_retries: int = 3,
    should_retry: Callable[[Exception], bool] = lambda e: True,
) -> T:
    """Call ``fn`` retrying transient failures with backoff. Raises the final error."""
    attempt = 0
    while True:
        try:
            return await fn()
        except Exception as exc:  # noqa: BLE001
            if attempt >= max_retries or not should_retry(exc):
                raise
            await asyncio.sleep(backoff_seconds(attempt))
            attempt += 1
