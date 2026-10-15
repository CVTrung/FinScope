import asyncio
from typing import Any

from bs4 import BeautifulSoup

from app.config import settings
from app.connectors.base import Connector
from app.core.http import NotFound, SourceParseError


class Vietstock(Connector):
    name = 'vietstock'

    def __init__(self, http):
        super().__init__(http)
        self.session_lock = asyncio.Lock()

    async def post(self, ticker: str, endpoint: str, params: dict[str, Any]) -> Any:
        # Keep cookie/token exchange together: a shared client must not mix form sessions.
        async with self.session_lock:
            url = settings.vietstock_base + '/'
            page = await self.http.request(self.name, 'GET', url)
            token = BeautifulSoup(page.text, 'html.parser').select_one('input[name=__RequestVerificationToken]')
            if not token:
                raise SourceParseError('missing_token', self.name)
            r = await self.http.request(self.name, 'POST', settings.vietstock_base + '/data/' + endpoint,
                                        data={**params, '__RequestVerificationToken': token['value']},
                                        headers={'Referer': str(page.url), 'X-Requested-With': 'XMLHttpRequest'})
            try:
                return r.json()
            except ValueError as exc:
                raise SourceParseError('invalid_json', self.name) from exc

    async def fetch_profile(self, ticker: str) -> dict[str, Any]:
        rows = await self.post(ticker, 'GetStockDeal_OverviewTrading', {'stockCode': ticker})
        if not rows or not rows.get('data'):
            raise NotFound('not_found', self.name)
        return rows['data'][0]

    async def fetch_financials(self, ticker: str, period: str) -> Any:
        return await self.post(ticker, 'financeinfo', {'Code': ticker, 'Page': 1, 'PageSize': 8,
                               'ReportTermType': 2 if period == 'quarter' else 1,
                               'ReportType': 'BCTQ', 'Unit': 1000000000})
