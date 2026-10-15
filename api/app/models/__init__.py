from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field


def now() -> str:
    return datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).isoformat()


class DataField(BaseModel):
    field: str
    value: float | str | None = None
    unit: str = 'VND'
    period: str | None = None
    scope: str = 'unknown'
    chosen_source: str = 'unavailable'
    source_url: str | None = None
    alternates: list[dict[str, Any]] = Field(default_factory=list)
    discrepancy: bool = False
    note: str | None = None
    fetched_at: str = Field(default_factory=now)


class Meta(BaseModel):
    sources_status: dict[str, str] = Field(default_factory=dict)
    generated_at: str = Field(default_factory=now)
    cache_hit: bool = False
    warnings: list[str] = Field(default_factory=list)


class Response(BaseModel):
    data: Any
    meta: Meta


class ErrorDetail(BaseModel):
    code: str
    message: str
    hint: str = 'Thử lại sau hoặc chọn nguồn khác.'


class ErrorResponse(BaseModel):
    error: ErrorDetail
