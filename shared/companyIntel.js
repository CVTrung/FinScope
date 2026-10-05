import { z } from 'zod';
import { safeUrl, validDate } from './report.js';

const text = z.string();
const nullable = text.nullable();
const sentiment = z.enum(['positive', 'negative', 'neutral', 'mixed']);
const horizon = z.enum(['short_term', 'medium_term', 'long_term']);
const confidence = z.enum(['high', 'medium', 'low']);
const verification = z.enum(['full_text', 'snippet_only', 'cross_checked']);
const references = z.array(z.object({ source_name: text, source_url: text }));
export const companyIntelSchema = z.object({
  metadata: z.object({
    market: nullable,
    exchange: nullable,
    start_date: nullable,
    end_date: nullable,
    generated_at: text,
    focus: nullable,
    status: z.enum(['complete', 'partial']),
  }),
  articles: z.array(
    z.object({
      published_at: text,
      event_date: nullable,
      tickers: z.array(text),
      title: text,
      summary: text,
      facts: z.array(text),
      analysis: text,
      sentiment,
      impact_horizon: horizon,
      confidence,
      source_name: text,
      source_url: text,
      verification_status: verification,
    }),
  ),
  insights: z.array(
    z.object({
      category: z.enum(['market', 'macro', 'sector', 'company', 'valuation', 'bond']),
      subject: text,
      analysis: text,
      sentiment,
      impact_horizon: horizon,
      confidence,
      risks: z.array(text),
      evidence_sources: references,
    }),
  ),
  watchlist: z.array(
    z.object({
      ticker: text,
      reason: text,
      valuation_view: nullable,
      catalysts: z.array(text),
      risks: z.array(text),
      horizon,
      confidence,
      evidence_sources: references,
    }),
  ),
  sources: z.array(
    z.object({
      source_name: text,
      source_url: text,
      source_type: z.enum([
        'official',
        'company_disclosure',
        'market_data',
        'news',
        'research',
        'other',
      ]),
      published_at: nullable,
      verification_status: verification,
    }),
  ),
  limitations: z.array(text),
  disclaimer: text,
});

export function intelRequest({ query, language = 'vi', company, now = new Date() }) {
  const end = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [year, month, day] = end.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 4, 1));
  start.setUTCDate(
    Math.min(
      day,
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate(),
    ),
  );
  return {
    runtime_context: {
      current_date: end,
      current_datetime: now.toISOString(),
      timezone: 'Asia/Ho_Chi_Minh',
    },
    analysis_request: {
      market: 'Việt Nam',
      ...(company?.exchange ? { exchange: company.exchange } : {}),
      ...(company?.ticker ? { tickers: [company.ticker] } : {}),
      company_name: company?.name || query,
      lookback_period: '3 tháng',
      start_date: start.toISOString().slice(0, 10),
      end_date: end,
      max_articles: 10,
      include_bonds: false,
      language,
    },
    free_prompt: `Research only ${company?.name || query}${company?.ticker ? ` (${company.ticker})` : ''}. Company events, business drivers, risks, and sourced broker valuation reports. No unrelated stock watchlist.`,
  };
}

function sourceUrl(value) {
  const url = safeUrl(value);
  if (!url) return '';
  const parsed = new URL(url);
  if (/^(localhost|127\.|0\.|10\.|192\.168\.|\[::1\])/.test(parsed.hostname)) return '';
  if (/(^|\.)(facebook|youtube|tiktok|reddit|scribd|studocu|prezi)\./i.test(parsed.hostname))
    return '';
  if (/(^|\.)(google|bing)\./i.test(parsed.hostname) && /\/search/i.test(parsed.pathname))
    return '';
  return url;
}

// Model-reported full-text/cross-check status is not independent verification.
export function acceptCompanyIntel(input, request, evidence = { sources: [] }) {
  const data = companyIntelSchema.parse(input);
  const range = request.analysis_request;
  const end = request.runtime_context.current_date;
  const date = (value) => validDate(value) && value <= end;
  const supplied = new Set((evidence.sources || []).map((row) => sourceUrl(row.url)));
  const sources = [
    ...new Map(
      [
        ...data.sources,
        ...data.articles.map((row) => ({
          source_name: row.source_name,
          source_url: row.source_url,
          source_type: 'news',
          published_at: null,
          verification_status: 'snippet_only',
        })),
        ...[...data.insights, ...data.watchlist].flatMap((row) =>
          row.evidence_sources.map((source) => ({
            ...source,
            source_type: 'other',
            published_at: null,
            verification_status: 'snippet_only',
          })),
        ),
      ]
        .reverse()
        .filter((row) => sourceUrl(row.source_url) && supplied.has(sourceUrl(row.source_url)))
        .map((row) => [
          sourceUrl(row.source_url),
          {
            ...row,
            source_url: sourceUrl(row.source_url),
            published_at: row.published_at && date(row.published_at) ? row.published_at : null,
            evidenceStatus: 'sources-only',
          },
        ]),
    ).values(),
  ];
  const allowed = new Set(sources.map((row) => row.source_url));
  const refs = (rows) =>
    rows
      .filter((row) => allowed.has(sourceUrl(row.source_url)))
      .map((row) => ({ ...row, source_url: sourceUrl(row.source_url) }));
  const ticker = range.tickers?.[0]?.toUpperCase();
  const relevant = (row) =>
    ticker
      ? row.tickers.map((value) => value.toUpperCase()).includes(ticker)
      : `${row.title} ${row.summary}`.toLowerCase().includes(range.company_name.toLowerCase());
  const seen = new Set();
  const articles = data.articles
    .filter(
      (row) =>
        date(row.published_at) &&
        row.published_at >= range.start_date &&
        (!row.event_date || date(row.event_date)) &&
        relevant(row) &&
        allowed.has(sourceUrl(row.source_url)),
    )
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .filter((row) => {
      const key = `${sourceUrl(row.source_url)}:${row.title.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, range.max_articles)
    .map((row) => ({
      ...row,
      source_url: sourceUrl(row.source_url),
      evidenceStatus: 'sources-only',
    }));
  const insights = data.insights
    .filter((row) => row.category !== 'bond')
    .map((row) => ({
      ...row,
      evidence_sources: refs(row.evidence_sources),
      evidenceStatus: 'sources-only',
    }))
    .filter((row) => row.analysis.trim() && row.evidence_sources.length);
  const watchlist = data.watchlist
    .filter((row) => ticker && row.ticker.toUpperCase() === ticker)
    .map((row) => ({
      ...row,
      evidence_sources: refs(row.evidence_sources),
      evidenceStatus: 'sources-only',
    }))
    .filter((row) => row.reason.trim() && row.evidence_sources.length);
  const removed =
    articles.length < data.articles.length ||
    insights.length < data.insights.length ||
    watchlist.length < data.watchlist.length;
  return {
    ...data,
    metadata: {
      ...data.metadata,
      market: range.market,
      exchange: range.exchange || null,
      start_date: range.start_date,
      end_date: range.end_date,
      generated_at: request.runtime_context.current_datetime,
      focus: range.company_name,
      status: removed || !articles.length ? 'partial' : data.metadata.status,
    },
    articles,
    insights,
    watchlist,
    sources,
    limitations: [
      ...new Set([
        ...data.limitations,
        'Sources provided; individual claims not verified',
        ...(removed
          ? ['Some records were excluded because their company, date or source was invalid.']
          : []),
        'Organized from previously gathered evidence; this model did not search or access sources.',
      ]),
    ],
    disclaimer:
      range.language === 'vi'
        ? 'Chỉ phục vụ học tập và nghiên cứu, không phải khuyến nghị đầu tư.'
        : 'For education and research only; not investment advice.',
  };
}
