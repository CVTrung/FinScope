import { ResearchError } from './research.js';
import { auditEvidence } from './evidenceAudit.js';
import { cleanReport, validDate, safeUrl } from '../shared/report.js';
import { combineFinancials, freshness, prioritizeVietstock } from '../shared/evidence.js';
import { resolveNewsCompany } from '../shared/companyAliases.js';
import { enrichListingTargets } from '../shared/brokerListing.js';

export function acceptanceEvidence(snapshot) {
  const results = [...snapshot.results, ...(snapshot.direct ? [snapshot.direct] : [])].map(
    (result) => {
      const sources = result.sources.filter((source) => safeUrl(source.url));
      const allowed = new Set(sources.map((source) => source.id));
      const claims = (result.claims || [])
        .map((claim) => ({ ...claim, sourceIds: claim.sourceIds.filter((id) => allowed.has(id)) }))
        .filter((claim) => claim.sourceIds.length);
      // A whole-section excerpt is not a manufactured sentence-to-source mapping.
      const status = claims.length
        ? result === snapshot.direct
          ? 'direct'
          : 'claim-mapped'
        : 'sources-only';
      return {
        ...result,
        sources,
        evidenceStatus: status,
        claims: claims.length
          ? claims
          : result.text?.trim() && sources.length
            ? result.text
                .split(/\n\s*\n/)
                .filter((text) => text.trim())
                .map((text) => ({
                  text,
                  sourceIds: sources.map((source) => source.id),
                  evidenceStatus: 'sources-only',
                  sectionExcerpt: true,
                }))
            : [],
      };
    },
  );
  return {
    results,
    sources: results.flatMap((result) => result.sources),
    claims: results.flatMap((result) => result.claims),
  };
}
const normalize = (text) =>
  String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase();
const numbered = (text, value) =>
  Number.isFinite(value) &&
  (text.match(/-?\d+(?:[.,]\d+)*/g) || []).some((token) =>
    [
      Number(token),
      Number(token.replace(/,/g, '')),
      Number(token.replace(/\./g, '').replace(',', '.')),
    ].includes(value),
  );
const cited = (row, claims) =>
  claims.filter((claim) => claim.sourceIds.some((id) => row.sourceIds.includes(id)));
const dated = (value, now) => validDate(value) && new Date(value) <= new Date(now);
const currencyIn = (currency, text) =>
  currency === 'VND'
    ? /\bvnd\b|\bdong\b|₫/.test(normalize(text))
    : /^[A-Z]{3}$/.test(currency) && text.toUpperCase().includes(currency);
function statusFor(row, results) {
  const sections = results.filter((result) =>
    result.sources.some((source) => row.sourceIds.includes(source.id)),
  );
  return sections.some((result) => result.evidenceStatus === 'sources-only')
    ? 'sources-only'
    : sections.every((result) => result.evidenceStatus === 'direct')
      ? 'direct'
      : 'claim-mapped';
}
function textSupported(row, claims) {
  const text = [row.title, row.detail, row.alternative, row.nextStep].filter(Boolean).join(' ');
  const context = cited(row, claims)
    .map((claim) => claim.text)
    .join('\n');
  return (
    context &&
    !/https?:\/\//i.test(text) &&
    (text.match(/-?\d+(?:[.,]\d+)*/g) || []).every((token) =>
      [
        Number(token),
        Number(token.replace(/,/g, '')),
        Number(token.replace(/\./g, '').replace(',', '.')),
      ].some((number) => numbered(context, number)),
    )
  );
}

export function acceptReport(input, snapshot) {
  const { results, sources, claims } = acceptanceEvidence(snapshot);
  const allowed = new Set(sources.map((source) => source.id));
  const validRefs = (row) => row.sourceIds.length && row.sourceIds.every((id) => allowed.has(id));
  // Keep useful rows with missing fields, but reject explicit impossible/future dates.
  input = {
    ...input,
    financials: input.financials.filter(
      (row) =>
        validRefs(row) &&
        dated(row.period, snapshot.generatedAt) &&
        (!row.periodStart ||
          (dated(row.periodStart, snapshot.generatedAt) && row.periodStart <= row.period)),
    ),
    targets: input.targets.filter(
      (row) => validRefs(row) && (!row.publishedAt || dated(row.publishedAt, snapshot.generatedAt)),
    ),
    analysis: { ...input.analysis, observations: input.analysis.observations.filter(validRefs) },
  };
  const report = cleanReport(input, sources, snapshot.generatedAt);
  const identity = cited(report.company, claims)
    .map((claim) => claim.text)
    .join('\n');
  const expected = snapshot.direct?.company || resolveNewsCompany(snapshot.query);
  if (expected?.ticker && report.company.ticker && expected.ticker !== report.company.ticker)
    throw new ResearchError(
      'Company identity conflicts with the supporting Vietstock listing. Please refine your search.',
      422,
    );
  if (
    snapshot.direct &&
    report.company.exchange &&
    report.company.exchange !== snapshot.direct.company.exchange
  )
    throw new ResearchError(
      'Company identity conflicts with the supporting Vietstock listing. Please refine your search.',
      422,
    );
  const ticker = report.company.ticker.replace(/[^\w]/g, '');
  if (
    !report.company.sourceIds.length ||
    !identity ||
    (ticker && !new RegExp(`\\b${ticker}\\b`, 'i').test(identity)) ||
    (report.company.name &&
      !normalize(identity).includes(normalize(report.company.name)) &&
      !(ticker && new RegExp(`\\b${ticker}\\b`, 'i').test(report.company.name)))
  )
    throw new ResearchError(
      'Company identity did not match the grounded evidence. Please use a ticker and exchange.',
      422,
    );
  report.company.name ||= snapshot.direct?.company.name || snapshot.query;
  report.company.evidenceStatus = statusFor(report.company, results);
  auditEvidence(report, results, snapshot.language);
  const annotate = (row, date) => ({
    ...row,
    evidenceStatus: statusFor(row, results),
    freshness: freshness(date, snapshot.generatedAt),
  });
  report.financials = report.financials.map((row) => {
    const text = cited(row, claims)
      .map((claim) => normalize(claim.text))
      .join('\n');
    const unit = /billion|\bty\b/.test(normalize(row.unit))
      ? /billion|\bty\b/
      : /million|trieu/.test(normalize(row.unit))
        ? /million|trieu/
        : /vnd|dong/.test(normalize(row.unit))
          ? /vnd|dong/
          : null;
    if (row.unit && (!unit || !unit.test(text))) row.unit = '';
    if (row.currency && !currencyIn(row.currency, text)) row.currency = '';
    const scopes = {
      consolidated: /consolidated|hop nhat/,
      standalone: /standalone|separate|rieng le/,
      attributable: /attributable|parent shareholders|co dong cong ty me/,
    };
    for (const field of ['profitBasis', 'cashFlowBasis'])
      if (row[field] !== 'unknown' && !scopes[row[field]]?.test(text)) row[field] = 'unknown';
    delete row.conflictGroup;
    return annotate(row, row.period);
  });
  if (snapshot.direct) {
    report.financials.push(
      ...snapshot.direct.financials.map((row) => ({
        ...row,
        periodStart: row.periodStart || '',
        evidenceStatus: 'direct',
        freshness: freshness(row.period, snapshot.generatedAt),
      })),
    );
    if (snapshot.direct.quote) {
      const old = report.quote,
        direct = snapshot.direct.quote;
      if (
        old.price > 0 &&
        direct.price > 0 &&
        old.asOf === direct.asOf &&
        old.currency === direct.currency &&
        old.price !== direct.price &&
        cited(old, claims).some((claim) => numbered(claim.text, old.price))
      )
        report.quoteAlternatives = [
          annotate(old, old.asOf),
          {
            ...direct,
            evidenceStatus: 'direct',
            freshness: freshness(direct.asOf, snapshot.generatedAt),
          },
        ];
      report.quote = {
        ...direct,
        evidenceStatus: 'direct',
        freshness: freshness(direct.asOf, snapshot.generatedAt),
      };
    }
  }
  if (report.quote.price !== null && !snapshot.direct?.quote) {
    if (
      !cited(report.quote, claims).some(
        (claim) =>
          numbered(claim.text, report.quote.price) && currencyIn(report.quote.currency, claim.text),
      )
    )
      report.quote = { ...report.quote, price: null, changePercent: null };
    if (
      !cited(report.quote, claims).some((claim) => numbered(claim.text, report.quote.changePercent))
    )
      report.quote.changePercent = null;
    if (
      !cited(report.quote, claims).some(
        (claim) =>
          report.quote.basis && normalize(claim.text).includes(normalize(report.quote.basis)),
      )
    )
      report.quote.basis = '';
    report.quote = annotate(report.quote, report.quote.asOf);
  }
  const combined = combineFinancials(report.financials, sources);
  report.financials = combined.financials;
  report.conflicts = combined.conflicts;
  report.metrics = report.metrics
    .filter(
      (row) =>
        dated(row.period, snapshot.generatedAt) &&
        textSupported({ ...row, title: row.label, detail: row.value }, claims),
    )
    .map((row) => annotate(row, row.period));
  report.analysis.observations = report.analysis.observations
    .filter((row) => textSupported(row, claims))
    .slice(0, 4)
    .map((row) => annotate(row, ''));
  report.analysis.risks = [];
  report.analysis.conclusion = '';
  report.summary = '';
  report.peers = [];
  report.news = [];
  report.priceHistory = [];
  report.targets = report.targets
    .filter(
      (row) =>
        row.firm.trim() &&
        cited(row, claims).some(
          (claim) =>
            normalize(claim.text).includes(normalize(row.firm)) &&
            (!ticker || new RegExp(`\\b${ticker}\\b`, 'i').test(claim.text)),
        ),
    )
    .map((row) => {
      const contexts = cited(row, claims);
      const excerpt = (value) =>
        value && contexts.some((claim) => normalize(claim.text).includes(normalize(value)))
          ? value
          : '';
      if (
        row.target !== null &&
        (!(row.target > 0) ||
          !contexts.some(
            (claim) =>
              /target\s*price|price\s*target|gia\s*muc\s*tieu/i.test(normalize(claim.text)) &&
              numbered(claim.text, row.target),
          ))
      )
        row.target = null;
      if (row.currency && !contexts.some((claim) => currencyIn(row.currency, claim.text)))
        row.currency = '';
      const comparable =
        row.comparable &&
        row.basis &&
        report.quote.basis === row.basis &&
        row.currency === report.quote.currency &&
        contexts.some((claim) => normalize(claim.text).includes(normalize(row.basis))) &&
        report.quote.evidenceStatus !== 'sources-only';
      return annotate(
        {
          ...row,
          conflictGroup: undefined,
          comparable: Boolean(comparable),
          basis: comparable ? row.basis : '',
          assumptions: excerpt(row.assumptions),
          risks: excerpt(row.risks),
          thesis: excerpt(row.thesis),
          horizon: excerpt(row.horizon),
          rating: contexts.some(
            (claim) => row.rating && normalize(claim.text).includes(normalize(row.rating)),
          )
            ? row.rating
            : '',
        },
        row.publishedAt,
      );
    });
  // Keep direct broker listings visibly partial even when PDF target extraction is unavailable.
  for (const broker of snapshot.direct?.reports || []) {
    if (report.targets.some((row) => normalize(row.firm) === normalize(broker.firm))) continue;
    const source = sources.find(
      (source) => source.url === broker.originalPdfUrl || source.url === broker.url,
    );
    if (!source) continue;
    report.targets.push({
      firm: broker.firm,
      publishedAt: '',
      listedAt: broker.listedAt || '',
      title: broker.title,
      target: null,
      currency: '',
      basis: '',
      comparable: false,
      horizon: '',
      rating: '',
      thesis: '',
      assumptions: '',
      risks: '',
      sourceIds: [source.id],
      evidenceStatus: 'direct',
      freshness: freshness(broker.listedAt, snapshot.generatedAt),
    });
  }
  report.targets = enrichListingTargets({ ...report, sources });
  const grouped = new Map();
  report.targets.forEach((row) => {
    const key = row.firm.toLowerCase() + ':' + row.publishedAt;
    if (row.publishedAt && row.target !== null) {
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }
  });
  for (const [key, records] of grouped)
    if (new Set(records.map((row) => row.target)).size > 1)
      records.forEach((row) => (row.conflictGroup = key));
  if (results.some((result) => result.evidenceStatus === 'sources-only'))
    report.limitations.push('Sources provided; individual claims not verified');
  if (report.conflicts.length || report.targets.some((row) => row.conflictGroup))
    report.limitations.push(
      'Conflicting sourced figures are retained separately. No average is used to resolve the difference.',
    );
  report.targets = prioritizeVietstock(report.targets, sources);
  return report;
}
