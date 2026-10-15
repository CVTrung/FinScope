import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from cachetools import TTLCache


class MemoryCache:
    def __init__(self) -> None:
        self.items: TTLCache = TTLCache(maxsize=512, ttl=21600)
        self.flights: dict[str, asyncio.Task] = {}

    async def get(self, key: str, factory: Callable[[], Awaitable[Any]], ttl: int = 120) -> tuple[Any, bool]:
        import time
        cached = self.items.get(key)
        if cached and cached[0] > time.monotonic():
            return cached[1], True
        if key in self.flights:
            return await asyncio.shield(self.flights[key]), True

        async def run() -> Any:
            value = await factory()
            self.items[key] = (time.monotonic() + ttl, value)
            return value

        task = asyncio.create_task(run())
        self.flights[key] = task
        task.add_done_callback(lambda _: self.flights.pop(key, None))
        try:
            return await asyncio.shield(task), False
        finally:
            if task.done():
                self.flights.pop(key, None)


cache = MemoryCache()
