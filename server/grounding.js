import { safeUrl } from '../shared/report.js';

const list = (value) => (Array.isArray(value) ? value : []);
let latest = [];
export const groundingStatus = () => latest;

export function extractGrounding(response, prefix) {
  const candidate = response.candidates?.[0];
  const metadata = candidate?.groundingMetadata;
  const text =
    typeof response.text === 'string'
      ? response.text
      : list(candidate?.content?.parts)
          .filter((part) => !part.thought && typeof part.text === 'string')
          .map((part) => part.text)
          .join('');
  const sources = [],
    indexToId = new Map();
  for (const [index, chunk] of list(metadata?.groundingChunks).entries()) {
    const url = safeUrl(chunk?.web?.uri);
    if (!url) continue;
    const id = `${prefix}${index + 1}`;
    sources.push({ id, title: chunk.web.title || new URL(url).hostname, url });
    indexToId.set(index, id);
  }
  const claims = list(metadata?.groundingSupports)
    .map((support) => {
      const segment = support?.segment;
      let claimText = typeof segment?.text === 'string' ? segment.text : '';
      if (
        !claimText.trim() &&
        Number.isInteger(segment?.startIndex) &&
        Number.isInteger(segment?.endIndex) &&
        segment.startIndex >= 0 &&
        segment.endIndex > segment.startIndex &&
        segment.endIndex <= text.length
      )
        claimText = text.slice(segment.startIndex, segment.endIndex);
      return {
        text: claimText,
        sourceIds: [
          ...new Set(
            list(support?.groundingChunkIndices)
              .map((index) => indexToId.get(index))
              .filter(Boolean),
          ),
        ],
      };
    })
    .filter((claim) => claim.text.trim() && claim.sourceIds.length);
  return {
    text,
    sources,
    claims,
    queries: list(metadata?.webSearchQueries).filter((query) => typeof query === 'string'),
    searchSuggestions:
      typeof metadata?.searchEntryPoint?.renderedContent === 'string'
        ? metadata.searchEntryPoint.renderedContent
        : '',
  };
}

export function groundingDiagnostic(response, result, stage) {
  const candidate = response.candidates?.[0],
    metadata = candidate?.groundingMetadata;
  // Only code-owned labels, counts and documented enums. No prompts, answers, URLs or raw errors.
  const finish = candidate?.finishReason;
  const block = response.promptFeedback?.blockReason;
  return {
    stage,
    checkedAt: new Date().toISOString(),
    hasText: Boolean(result.text.trim()),
    textCharacters: result.text.length,
    usableSources: result.sources.length,
    mappedClaims: result.claims.length,
    searchQueries: list(metadata?.webSearchQueries).length,
    rawChunks: list(metadata?.groundingChunks).length,
    rawSupports: list(metadata?.groundingSupports).length,
    finishReason: [
      'STOP',
      'MAX_TOKENS',
      'SAFETY',
      'RECITATION',
      'OTHER',
      'BLOCKLIST',
      'PROHIBITED_CONTENT',
      'SPII',
      'MALFORMED_FUNCTION_CALL',
    ].includes(finish)
      ? finish
      : 'UNKNOWN',
    blockReason: ['SAFETY', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY'].includes(
      block,
    )
      ? block
      : block
        ? 'UNKNOWN'
        : null,
  };
}

export function recordGrounding(diagnostics) {
  latest = diagnostics.slice(-2).map((item) => ({ ...item }));
}

export function groundingFailure(diagnostic) {
  if (
    diagnostic.blockReason ||
    ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(diagnostic.finishReason)
  )
    return 'Google blocked the research response. Please try a specific company name and exchange.';
  if (!diagnostic.hasText)
    return 'Gemini returned no research text. Please try again; no report was saved.';
  if (!diagnostic.usableSources)
    return 'Gemini returned no usable Google Search sources. Please try again; no report was saved.';
  return 'Gemini returned source links without usable claim citations. Please try again; no unchecked report was saved.';
}

export function validatedDirectEvidence(direct) {
  if (
    !direct?.company?.ticker ||
    !direct.company.exchange ||
    !direct.company.name ||
    !direct.company.url
  )
    return null;
  const sources = list(direct.sources).filter((source) => {
    const url = safeUrl(source.url);
    return typeof source.id === 'string' && url && new URL(url).hostname === 'finance.vietstock.vn';
  });
  const ids = new Set(sources.map((source) => source.id));
  const claims = list(direct.claims)
    .map((claim) => ({
      text: typeof claim.text === 'string' ? claim.text : '',
      sourceIds: list(claim.sourceIds).filter((id) => ids.has(id)),
    }))
    .filter((claim) => claim.text.trim() && claim.sourceIds.length);
  const profile = sources.find((source) => source.id === 'D1');
  const identity = claims.find(
    (claim) =>
      claim.sourceIds.includes('D1') &&
      claim.text.startsWith('Company:') &&
      claim.text.includes(`ticker=${direct.company.ticker};`) &&
      claim.text.includes(`exchange=${direct.company.exchange};`),
  );
  if (!profile || profile.url !== direct.company.url || !identity) return null;
  const supported = new Set(claims.flatMap((claim) => claim.sourceIds));
  return {
    ...direct,
    queries: [],
    searchSuggestions: '',
    sources: sources.filter((source) => supported.has(source.id)),
    claims,
    text: claims.map((claim) => `${claim.sourceIds.join(',')}: ${claim.text}`).join('\n\n'),
    financials: list(direct.financials).filter(
      (row) => list(row.sourceIds).length && row.sourceIds.every((id) => supported.has(id)),
    ),
    reports: list(direct.reports),
    events: list(direct.events),
    documents: list(direct.documents),
    gaps: list(direct.gaps),
    quote:
      direct.quote &&
      list(direct.quote.sourceIds).length &&
      direct.quote.sourceIds.every((id) => supported.has(id))
        ? direct.quote
        : null,
  };
}
