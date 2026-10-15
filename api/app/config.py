from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / '.env', extra='ignore')
    gemini_api_key: str = Field(default='', validation_alias=AliasChoices('GEMINI_API_KEY', 'GOOGLE_API_KEY'))
    gemini_model_chain: str = 'gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite,gemini-2.5-flash,gemini-2.5-flash-lite'
    allowed_origins: str = 'http://localhost:3000,http://127.0.0.1:3000'
    disabled_sources: str = ''
    source_timeout: float = 10
    ai_timeout_seconds: float = 60
    price_discrepancy: float = .005
    financial_discrepancy: float = .01
    ratio_discrepancy: float = .05
    buy_low: float = .75
    buy_high: float = .85
    sell_low: float = 1.10
    sell_high: float = 1.25
    simplize_base: str = 'https://api2.simplize.vn'
    vietstock_base: str = 'https://finance.vietstock.vn'
    yahoo_base: str = 'https://query1.finance.yahoo.com'


settings = Settings()
