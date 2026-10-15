from abc import ABC, abstractmethod
from typing import Any

from app.core.http import SourceHTTP


class Connector(ABC):
    name: str

    def __init__(self, http: SourceHTTP):
        self.http = http

    @abstractmethod
    async def fetch_profile(self, ticker: str) -> dict[str, Any]:
        raise NotImplementedError
