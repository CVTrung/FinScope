import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { companyIntelSchema, intelRequest, acceptCompanyIntel } from '../shared/companyIntel.js';
import { safeUrl, validDate } from '../shared/report.js';
import { matchesNewsQuery } from '../shared/companyAliases.js';
import { companyAliases } from '../shared/companyAliases.js';
import { ResearchError } from './research.js';

export const companyIntelModel = () => 'gemini-3.5-flash';
export const fallbackIntelModel = 'gemini-3.5-flash-lite';
const prompt = readFile(new URL('./prompts/companyIntel.md', import.meta.url), 'utf8');

// Preserve dated publisher listings the model omitted, without inventing an assessment or long summary.
export function retainPublisherUpdates(intel, evidence, input) {
  const range = input.analysis_request;
  const known = new Set(evidence.sources.map((source) => source.url));
  const seen = new Set(intel.articles.map((row) => row.source_url));
  for (const row of evidence.results.flatMap((result) => result.articles || [])) {
    if (
      !safeUrl(row.url) ||
      !known.has(row.url) ||
      seen.has(row.url) ||
      !validDate(row.publishedAt) ||
      row.publishedAt < range.start_date ||
      row.publishedAt > range.end_date ||
      !matchesNewsQuery(
        { title: row.title, content: row.summary || '' },
        range.tickers?.[0] || range.company_name,
      )
    )
      continue;
    seen.add(row.url);
    intel.articles.push({
      published_at: row.publishedAt,
      event_date: null,
      tickers: range.tickers || [],
      title: row.title,
      summary: `${range.language === 'vi' ? '[Chỉ có đoạn trích]' : '[Excerpt only]'} ${row.summary || row.title}`,
      facts: [],
      analysis: '',
      sentiment: 'neutral',
      impact_horizon: 'short_term',
      confidence: 'low',
      source_name: row.publisher || new URL(row.url).hostname,
      source_url: row.url,
      verification_status: 'snippet_only',
      evidenceStatus: 'sources-only',
      assessmentAvailable: false,
    });
    if (!intel.sources.some((source) => source.source_url === row.url))
      intel.sources.push({
        source_name: row.publisher || new URL(row.url).hostname,
        source_url: row.url,
        source_type: 'news',
        published_at: row.publishedAt,
        verification_status: 'snippet_only',
        evidenceStatus: 'sources-only',
      });
  }
  intel.articles.sort((a, b) => b.published_at.localeCompare(a.published_at));
  intel.articles = intel.articles.slice(0, range.max_articles);
  return intel;
}

function numberValues(text) {
  return (text.match(/\d+(?:[.,]\d+)*/g) || []).map((token) => [
    Number(token),
    Number(token.replace(/\./g, '').replace(',', '.')),
    Number(token.replace(/,/g, '')),
  ]);
}

function sameNumber(value, available) {
  if (!Number.isFinite(value)) return false;
  // Accept normal displayed rounding, never a different scale or inferred ratio.
  const decimals = String(value).split('.')[1]?.length || 0;
  const tolerance = 0.5 * 10 ** -decimals;
  return available.some((reported) => Math.abs(reported - value) <= tolerance);
}

// This checks consistency with supplied evidence, not the truth of a publisher's claims.
export function checkIntelEvidence(intel, evidence, company) {
  // Financial/profile records can share a URL; keep every associated source ID.
  const sourceIds = new Map();
  for (const source of evidence.sources)
    sourceIds.set(source.url, [...(sourceIds.get(source.url) || []), source.id]);
  const context = (urls) => {
    const ids = urls.flatMap((url) => sourceIds.get(url) || []);
    return evidence.results
      .flatMap((result) => {
        const claims = result.claims.filter((claim) =>
          claim.sourceIds.some((id) => ids.includes(id)),
        );
        if (claims.length) return claims.map((claim) => claim.text);
        return result.sources.some((source) => ids.includes(source.id)) ? [result.text] : [];
      })
      .join('\n');
  };
  const normalize = (value) =>
    value.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
  const sameCompany = (text) => {
    if (!company?.ticker) return true;
    const value = normalize(text);
    const mentions = (code) =>
      [code, ...(companyAliases[code] || [])].some((alias) =>
        ` ${value.replace(/[^a-z0-9]+/g, ' ')} `.includes(` ${normalize(alias)} `),
      );
    return (
      mentions(company.ticker) ||
      !Object.keys(companyAliases).some((code) => code !== company.ticker && mentions(code))
    );
  };
  const supported = (text, urls) => {
    if (!sameCompany(text)) return false;
    const available = numberValues(context(urls)).flat();
    return numberValues(text).every((variants) =>
      variants.some((value) => sameNumber(value, available)),
    );
  };
  let excluded = 0,
    edited = 0;
  const cleanText = (text, urls) => {
    const sentences = text.split(/\n+|(?<!\bTP\.)(?<=[.!?])\s+(?=\p{Lu})/u);
    const kept = sentences.filter((sentence) => supported(sentence, urls));
    if (kept.length < sentences.length) edited++;
    return kept.join(' ').trim();
  };
  const supportedDate = (value, urls) => {
    if (!value) return true;
    const [year, month, day] = value.split('-');
    const content = context(urls);
    if (
      evidence.sources.some((source) => urls.includes(source.url) && source.publishedAt === value)
    )
      return true;
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return (
      content.includes(value) ||
      new RegExp(`\\b0?${Number(day)}[/. -]0?${Number(month)}[/. -]${year}\\b`).test(content) ||
      new RegExp(
        `\\b0?${Number(day)}\\s+tháng\\s+0?${Number(month)}(?:\\s+năm)?\\s+${year}\\b`,
        'i',
      ).test(content) ||
      new RegExp(
        `\\b${months[Number(month) - 1]}\\s+0?${Number(day)},?\\s+${year}\\b|\\b0?${Number(day)}\\s+${months[Number(month) - 1]},?\\s+${year}\\b`,
        'i',
      ).test(content)
    );
  };
  intel.articles = intel.articles
    .map((row) => ({
      ...row,
      summary: cleanText(row.summary, [row.source_url]),
      analysis: cleanText(row.analysis, [row.source_url]),
      facts: row.facts.map((fact) => cleanText(fact, [row.source_url])).filter(Boolean),
    }))
    .filter((row) => {
      const keep = supported(row.title, [row.source_url]) && (row.summary || row.facts.length);
      if (!keep) excluded++;
      return keep;
    });
  intel.articles = intel.articles.filter((row) => {
    const keep = supportedDate(row.published_at, [row.source_url]);
    if (row.event_date && !supportedDate(row.event_date, [row.source_url])) {
      row.event_date = null;
      edited++;
    }
    if (!keep) excluded++;
    return keep;
  });
  intel.sources = intel.sources.map((row) => ({
    ...row,
    published_at: supportedDate(row.published_at, [row.source_url]) ? row.published_at : null,
  }));
  intel.insights = intel.insights
    .map((row) => {
      const urls = row.evidence_sources.map((source) => source.source_url);
      return {
        ...row,
        analysis: cleanText(row.analysis, urls),
        risks: row.risks.map((risk) => cleanText(risk, urls)).filter(Boolean),
      };
    })
    .filter((row) => {
      const keep =
        row.analysis &&
        supported(
          row.subject,
          row.evidence_sources.map((source) => source.source_url),
        );
      if (!keep) excluded++;
      return keep;
    });
  intel.watchlist = intel.watchlist
    .map((row) => {
      const urls = row.evidence_sources.map((source) => source.source_url);
      return {
        ...row,
        reason: cleanText(row.reason, urls),
        valuation_view: cleanText(row.valuation_view || '', urls) || null,
        catalysts: row.catalysts.map((value) => cleanText(value, urls)).filter(Boolean),
        risks: row.risks.map((value) => cleanText(value, urls)).filter(Boolean),
      };
    })
    .filter((row) => {
      if (!row.reason) excluded++;
      return Boolean(row.reason);
    });
  if (excluded || edited) {
    intel.metadata.status = 'partial';
    intel.limitations.push(
      'Unsupported sentences or fields were omitted; supported parts of partial records were retained.',
    );
  }
  intel.validation = { excludedRecords: excluded, trimmedFields: edited };
  return intel;
}

// The caller owns the shared three-request budget, quota handling and model output ceiling.
export async function researchCompanyIntel({ query, company, language, now, evidence, request }) {
  const financialClaims = (evidence.financials || []).map((row) => ({
    text: `${row.kind === 'quarterly' ? `Quarter ${Math.ceil(Number(row.period.slice(5, 7)) / 3)}` : row.kind} ${row.period.slice(0, 4)}; period-end ${row.period}; scope ${row.profitBasis}; unit ${row.unit}; revenue ${row.revenue}; net income ${row.netIncome}.`,
    sourceIds: row.sourceIds,
  }));
  evidence = {
    ...evidence,
    results: [
      ...evidence.results,
      {
        text: financialClaims.map((claim) => claim.text).join('\n'),
        sources: evidence.sources,
        claims: financialClaims,
      },
    ],
  };
  const input = intelRequest({ query, company, language, now });
  const response = await request(
    companyIntelModel(),
    JSON.stringify({ ...input, supporting_evidence: evidence }),
    {
      responseMimeType: 'application/json',
      responseJsonSchema: z.toJSONSchema(companyIntelSchema),
      systemInstruction: `${await prompt}\nAPPLICATION ADAPTATION: No Search tool is supplied. Analyze ONLY supporting_evidence gathered by the application; do not use memory facts or invent articles or URLs. Evidence URLs must be selected exactly from supporting_evidence.sources. Use supplied evidence deeply even without a search tool. COVERAGE: produce up to ten distinct dated article/event records when provided. Summaries should be detailed (100–200 words only if publisher paragraphs support that length); snippets remain short and explicitly marked. Produce separate insights for each supported topic: business segments/growth, profitability/accounting changes, projects/contracts/capacity, balance sheet/cash flow, capital actions/governance, sector/macro drivers, valuation/share basis and risks. Aim for 6–10 useful insights when evidence supports them; do not collapse all topics into one overview or pad empty topics. Each analysis should explain the mechanism, time horizon, conditions and competing evidence in 100–180 words when support allows. Use the watchlist entry for this one company to consolidate concrete sourced catalysts, risks and valuation limitations. Sources missing publication dates remain useful for insights; do not use event dates or period-end dates as article publication dates. Keep supported partial facts, omit only unsupported details. Use explicit period labels from supplied financial evidence; display rounding is allowed, but do not calculate new ratios or growth unless code supplied them. Preserve annual/quarterly/YTD and units/scopes. Cite all directly relevant supplied sources per insight. Unsupported sections remain empty and explain specifically what evidence was unavailable. Output in ${language === 'vi' ? 'Vietnamese' : 'English'}, overriding Vietnamese-only prose rules. Focus only on the requested company. runtime_context.current_datetime is the generated_at timestamp. Distinguish model interpretation from reported facts. Prefer Vietstock when sources conflict, retain and explain alternatives. In valuation insights include original broker name, dated target, currency and basis only when sourced. Older broker evidence can be context with its date; only articles are restricted to the exact window. Never claim independent verification or that you accessed the sources yourself.`,
    },
  );
  let parsed;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    throw new ResearchError(
      'Company intelligence returned invalid JSON. No automatic retry was made. Please try again.',
    );
  }
  let intel;
  try {
    intel = acceptCompanyIntel(parsed, input, evidence);
  } catch {
    throw new ResearchError(
      'Company intelligence returned incomplete data. No automatic retry was made. Please try again.',
    );
  }
  return {
    ...retainPublisherUpdates(checkIntelEvidence(intel, evidence, company), evidence, input),
    model: companyIntelModel(),
    language,
    searchGrounding: false,
  };
}
