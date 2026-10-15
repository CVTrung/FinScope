from typing import Any

from app.config import settings
from app.connectors.base import Connector
from app.core.http import NotFound


class Yahoo(Connector):
    name = 'yahoo'

    async def fetch_prices(self, ticker: str, range_: str = '1y') -> dict[str, Any]:
        data = await self.http.json(self.name, f'{settings.yahoo_base}/v8/finance/chart/{ticker}.VN',
                                    params={'range': range_, 'interval': '1d'})
        results = data.get('chart', {}).get('result')
        if not results:
            raise NotFound('not_found', self.name)
        return results[0]

    async def fetch_profile(self, ticker: str) -> dict[str, Any]:
        return (await self.fetch_prices(ticker, '5d'))['meta']
