import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGrounding,
  groundingDiagnostic,
  groundingFailure,
  validatedDirectEvidence,
} from '../server/grounding.js';
import { researchCompany, publicError } from '../server/research.js';
import { fixture } from './fixtures.js';

const date = new Date('2026-10-03T03:00:00Z');
function directEvidence() {
  const company = {
    name: 'FPT Corporation',
    ticker: 'FPT',
    exchange: 'HOSE',
    url: 'https://finance.vietstock.vn/FPT-ctcp-fpt.htm',
  };
  const financials = [
    {
      kind: 'annual',
      period: '2025-12-31',
      unit: 'billion VND',
      currency: 'VND',
      revenue: 12345,
      netIncome: 2000,
      operatingCashFlow: null,
      netMargin: null,
      debtEquity: null,
      profitBasis: 'consolidated',
      cashFlowBasis: 'unknown',
      sourceIds: ['D2'],
    },
  ];
  return {
    company,
    financials,
    quote: null,
    reports: [],
    events: [],
    documents: [],
    gaps: [],
    section: 'Direct Vietstock evidence',
    retrievedAt: date.toISOString(),
    sources: [
      { id: 'D1', title: 'Profile', url: company.url },
      { id: 'D2', title: 'Financials', url: company.url + '?tab=tai-chinh' },
    ],
    claims: [
      {
        text: 'Company: FPT Corporation; ticker=FPT; exchange=HOSE; country=Vietnam.',
        sourceIds: ['D1'],
      },
      {
        text: 'Reported annual financial statement: ' + JSON.stringify(financials[0]),
        sourceIds: ['D2'],
      },
    ],
  };
}

test('grounding reconstructs provider-indexed citations without making up mappings', () => {
  const response = {
    candidates: [
      {
        content: { parts: [{ text: 'secret thought', thought: true }, { text: 'FPT is listed.' }] },
        groundingMetadata: {
          groundingChunks: [{ web: { uri: 'https://example.com' } }],
          groundingSupports: [
            { segment: { startIndex: 0, endIndex: 14 }, groundingChunkIndices: [0] },
            { segment: { startIndex: -1, endIndex: 999 }, groundingChunkIndices: [0] },
            { segment: { text: 'unsupported' }, groundingChunkIndices: [3] },
          ],
        },
      },
    ],
  };
  const result = extractGrounding(response, 'F');
  assert.equal(result.text, 'FPT is listed.');
  assert.deepEqual(result.claims, [{ text: 'FPT is listed.', sourceIds: ['F1'] }]);
});

test('diagnostics distinguish missing fields and contain no model text, URLs or unrecognized enums', () => {
  for (const [response, expected] of [
    [{ text: ' ' }, /no research text/],
    [{ text: 'secret prompt' }, /no usable Google Search sources/],
    [
      {
        text: 'secret answer',
        candidates: [
          {
            finishReason: 'secret API key',
            groundingMetadata: {
              groundingChunks: [{ web: { uri: 'https://secret.test/?key=private' } }],
            },
          },
        ],
      },
      /without usable claim citations/,
    ],
    [{ promptFeedback: { blockReason: 'SAFETY' } }, /blocked/],
  ]) {
    const result = extractGrounding(response, 'F');
    const diagnostic = groundingDiagnostic(response, result, 'financials');
    assert.match(groundingFailure(diagnostic), expected);
    assert.ok(!/secret|private|https/.test(JSON.stringify(diagnostic)));
  }
});

test('direct validation rejects unsupported profile sources or missing identity claims', () => {
  const direct = directEvidence();
  direct.sources[0].url = 'https://example.com/fake';
  assert.equal(validatedDirectEvidence(direct), null);
  const empty = directEvidence();
  empty.claims = [];
  assert.equal(validatedDirectEvidence(empty), null);
});
