from typing import Literal

from pydantic import BaseModel, Field, model_validator


class Claim(BaseModel):
    text: str
    evidence: list[str] = Field(min_length=1)


class Analysis(BaseModel):
    summary: list[Claim] = Field(min_length=5, max_length=8)
    strengths: list[Claim]
    weaknesses: list[Claim]
    risks: list[Claim]


class NewsDigest(BaseModel):
    context: str
    key_developments: str
    key_figures: str
    impact: str
    watch_next: str
    sentiment: Literal['positive', 'neutral', 'negative']
    evidence: list[str] = Field(min_length=1)

    @model_validator(mode='after')
    def word_count(self):
        content = ' '.join(getattr(self, k) for k in ['context', 'key_developments', 'key_figures', 'impact', 'watch_next'])
        if not 25 <= len(content.split()) <= 240:
            raise ValueError('News digest must contain 25–240 words, proportional to source detail')
        return self


class DigestSection(BaseModel):
    title: str
    bullets: list[str] = Field(min_length=1, max_length=4)


class ItemReview(BaseModel):
    id: str
    summary: list[str] = Field(min_length=1, max_length=3)
    sentiment: Literal['positive', 'neutral', 'negative', 'mixed', 'uncertain']
    impact: str
    watch_next: str
    evidence: list[str] = Field(min_length=1)


class ReviewBatch(BaseModel):
    items: list[ItemReview]


class ResearchPlan(BaseModel):
    focus: list[Literal['cash_flow', 'growth', 'valuation', 'risk', 'news', 'ownership']] = Field(min_length=1, max_length=6)
    questions: list[str] = Field(min_length=1, max_length=5)


class MonthlyDigest(BaseModel):
    sections: list[DigestSection] = Field(min_length=1, max_length=3)
    evidence: list[str] = Field(min_length=1)

    @model_validator(mode='after')
    def word_count(self):
        content = ' '.join(b for section in self.sections for b in section.bullets)
        if not 40 <= len(content.split()) <= 220:
            raise ValueError('Company outlook must contain 40–220 words')
        return self
