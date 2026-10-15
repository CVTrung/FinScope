import json
from copy import deepcopy
from typing import Any

from bs4 import BeautifulSoup

from app.config import settings
from app.connectors.base import Connector
from app.core.cache import cache
from app.core.http import NotFound, SourceParseError


class Simplize(Connector):
    name = 'simplize'

    async def fetch(self, path: str) -> Any:
        async def load():
            data = await self.http.json(self.name, settings.simplize_base + path, headers={'Referer': 'https://simplize.vn/'})
            if data.get('status') != 200:
                raise SourceParseError(f'upstream_{data.get("status")}', self.name)
            return data.get('data')
        ttl = 90 if '/summary/' in path else 900 if '/news-event/' in path else 21600
        result, _ = await cache.get('simplize:'+path, load, ttl)
        return deepcopy(result)

    async def fetch_profile(self, ticker: str) -> dict[str, Any]:
        data = await self.fetch('/api/company/summary/' + ticker)
        if not data or data.get('country') != 'vn' or data.get('type') != 'stock':
            raise NotFound('not_found', self.name)
        return data

    async def fetch_page(self, ticker: str) -> dict[str, Any]:
        async def load() -> dict[str, Any]:
            r = await self.http.request(self.name, 'GET', f'https://simplize.vn/co-phieu/{ticker}')
            script = BeautifulSoup(r.text, 'html.parser').select_one('#__NEXT_DATA__')
            if not script:
                raise SourceParseError('missing_page_data', self.name)
            return json.loads(script.text)['props']['pageProps']
        return (await cache.get('page:' + ticker, load, 900))[0]

    async def fetch_financials(self, ticker: str, statement: str, period: str) -> dict[str, Any]:
        # The anonymous UI requests 12 quarters; larger histories require membership.
        type_param = '&type=null' if statement in ('is', 'bs') else ''
        size = 12 if period == 'quarter' else 3
        return await self.fetch(f'/api/company/fi/{statement}/{ticker}?period={"Q" if period == "quarter" else "Y"}&size={size}{type_param}')

    async def search(self, query: str) -> list[dict[str, Any]]:
        from urllib.parse import quote
        return await self.fetch('/api/search/company/suggestions?q=' + quote(query))
