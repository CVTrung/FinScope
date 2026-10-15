import asyncio
import logging
import time
from typing import Any

import httpx

from app.config import settings

log = logging.getLogger('finscope')


class SourceError(Exception):
    def __init__(self, status: str, source: str):
        self.status, self.source = status, source
        super().__init__(f'{source}: {status}')


class SourceTimeout(SourceError):
    pass


class SourceBlocked(SourceError):
    pass


class SourceParseError(SourceError):
    pass


class NotFound(SourceError):
    pass


class SourceHTTP:
    def __init__(self) -> None:
        self.client = httpx.AsyncClient(timeout=settings.source_timeout, follow_redirects=True,
                                       headers={'User-Agent': 'Mozilla/5.0 (FinScope academic research)'})
        self.locks = {s: asyncio.Lock() for s in ['simplize', 'vietstock', 'yahoo']}
        self.last: dict[str, float] = {}
        self.status: dict[str, str] = {}

    async def request(self, source: str, method: str, url: str, **kwargs: Any) -> httpx.Response:
        if source in settings.disabled_sources.split(','):
            raise SourceError('disabled', source)
        async with self.locks[source]:
            await asyncio.sleep(max(0, .4 - (time.monotonic() - self.last.get(source, 0))))
            self.last[source] = time.monotonic()
        started = time.monotonic()
        try:
            response = await self.client.request(method, url, **kwargs)
            if response.status_code == 404:
                raise NotFound('not_found', source)
            if response.status_code in (401, 403, 429):
                raise SourceBlocked(f'blocked_{response.status_code}', source)
            response.raise_for_status()
            self.status[source] = 'ok'
            return response
        except httpx.TimeoutException as exc:
            self.status[source] = 'timeout'
            raise SourceTimeout('timeout', source) from exc
        except httpx.HTTPError as exc:
            self.status[source] = 'http_error'
            raise SourceError('http_error', source) from exc
        finally:
            log.info('source_request', extra={'source': source, 'latency_ms': round((time.monotonic()-started)*1000)})

    async def json(self, source: str, url: str, **kwargs: Any) -> Any:
        r = await self.request(source, 'GET', url, **kwargs)
        try:
            return r.json()
        except ValueError as exc:
            raise SourceParseError('invalid_json', source) from exc
