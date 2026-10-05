import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptCompanyIntel, intelRequest } from '../shared/companyIntel.js';
import {
  researchCompanyIntel,
  checkIntelEvidence,
  retainPublisherUpdates,
} from '../server/companyIntel.js';
import { researchCompany, retryCompanyAnalysis } from '../server/research.js';
import { fixture, vietstockFixture, priceFixture } from './fixtures.js';
import { intelFixture } from './companyIntelFixture.js';

const now = new Date('2026-10-05T03:00:00Z');
const company = { name: 'FPT Corporation', ticker: 'FPT', exchange: 'HOSE' };
const text =
  'FPT Corporation ticker FPT HOSE Vietnam. Publication date 2026-09-20. Annual 2025 revenue 12000 billion VND and consolidated net income 2200 billion VND. Technology demand and demand uncertainty.';
const source = { id: 'G1', title: 'FPT disclosure', url: 'https://fpt.com/ir' };
const result = { text, sources: [source], claims: [{ text, sourceIds: ['G1'] }] };
const evidence = { sources: [source], results: [result], claims: result.claims };

test('website company/language input becomes a three-month window with Vietnam runtime date', () => {
  const data = intelRequest({ query: 'FPT', company, now, language: 'en' });
  assert.equal(data.analysis_request.start_date, '2026-07-05');
  assert.equal(data.analysis_request.end_date, '2026-10-05');
  assert.equal(data.analysis_request.language, 'en');
  assert.deepEqual(data.analysis_request.tickers, ['FPT']);
  assert.equal(
    intelRequest({ query: 'FPT', now: new Date('2026-05-31T00:00:00Z') }).analysis_request
      .start_date,
    '2026-02-28',
  );
  assert.equal(
    intelRequest({ query: 'FPT', now: new Date('2026-10-04T18:00:00Z') }).runtime_context
      .current_date,
    '2026-10-05',
  );
});

test('second model receives supplied evidence and JSON schema without Search or any other tool', async () => {
  let args;
  const data = await researchCompanyIntel({
    query: 'FPT',
    company,
    language: 'en',
    now,
    evidence,
    request: async (...input) => {
      args = input;
      return { text: JSON.stringify(intelFixture()) };
    },
  });
  assert.equal(args[0], 'gemini-3.5-flash');
  assert.equal(args[2].tools, undefined);
  assert.equal(args[2].responseMimeType, 'application/json');
  assert.match(args[2].systemInstruction, /Output in English/);
  assert.ok(JSON.parse(args[1]).supporting_evidence.sources.length);
  assert.equal(data.articles.length, 1);
  assert.equal(data.searchGrounding, false);
  assert.equal(data.articles[0].evidenceStatus, 'sources-only');
});

test('invalid dates, wrong tickers, invented URLs and unsupported numeric claims are excluded', () => {
  const data = intelFixture();
  const original = data.articles[0];
  data.articles.push(
    { ...original, title: 'future', published_at: '2027-01-01' },
    { ...original, title: 'wrong company', tickers: ['HPG'] },
    { ...original, title: 'old', published_at: '2026-01-01' },
    { ...original, title: 'made-up source', source_url: 'https://fake.example/article' },
    { ...original, title: 'made-up revenue', summary: 'FPT revenue 999999 billion VND.' },
  );
  data.sources.push({ ...data.sources[0], source_url: 'https://fake.example/article' });
  const accepted = checkIntelEvidence(
    acceptCompanyIntel(data, intelRequest({ query: 'FPT', company, now }), evidence),
    evidence,
    company,
  );
  assert.equal(accepted.articles.length, 2);
  assert.equal(accepted.articles[1].summary, '');
  assert.ok(accepted.articles[1].facts.length);
  assert.doesNotMatch(JSON.stringify(accepted.articles), /999999/);
  assert.equal(accepted.sources.length, 1);
  assert.equal(accepted.metadata.status, 'partial');
});

test('display rounding is accepted, but unsupported article publication dates are rejected', async () => {
  const data = intelFixture();
  data.articles[0].published_at = '2026-09-19';
  data.insights[0].analysis = 'Quarter 2 2026 revenue 55158.9 billion VND.';
  const row = {
    period: '2026-06-30',
    kind: 'quarterly',
    unit: 'billion VND',
    profitBasis: 'consolidated',
    revenue: 55158.902298901,
    netIncome: null,
    sourceIds: ['G1'],
  };
  const intel = await researchCompanyIntel({
    query: 'FPT',
    company,
    language: 'en',
    now,
    evidence: { ...evidence, financials: [row] },
    request: async () => ({ text: JSON.stringify(data) }),
  });
  assert.equal(intel.articles.length, 0);
  assert.equal(intel.insights.length, 1);
});

test('malformed second-model output stops after its single attempt', async () => {
  let calls = 0;
  await assert.rejects(
    researchCompanyIntel({
      query: 'FPT',
      company,
      language: 'en',
      now,
      evidence,
      request: async () => {
        calls++;
        return { text: '{bad' };
      },
    }),
    /invalid JSON/,
  );
  assert.equal(calls, 1);
});

test('omitted publisher updates remain as sourced excerpts without invented assessments', () => {
  const data = intelFixture();
  data.articles = [];
  const supported = {
    ...evidence,
    results: [
      {
        ...result,
        articles: [
          {
            title: 'FPT company update',
            publishedAt: '2026-09-20',
            url: source.url,
            summary: 'FPT disclosed a company update.',
            publisher: 'FPT',
          },
        ],
      },
    ],
  };
  const intel = retainPublisherUpdates(
    data,
    supported,
    intelRequest({ query: 'FPT', company, now }),
  );
  assert.equal(intel.articles.length, 1);
  assert.equal(intel.articles[0].assessmentAvailable, false);
  assert.equal(intel.articles[0].analysis, '');
  assert.match(intel.articles[0].summary, /Chỉ có đoạn trích/);
});

test('shared source URLs retain every claim, omitted source list entries are recovered and partial insights survive', () => {
  const data = intelFixture();
  data.sources = [];
  data.insights[0].analysis =
    'Revenue 12000 billion VND. Unsupported target 999999 VND. Demand remains uncertain.';
  const shared = {
    ...evidence,
    sources: [source, { ...source, id: 'G2' }],
    results: [
      result,
      {
        text: 'FPT debt data unavailable.',
        sources: [{ ...source, id: 'G2' }],
        claims: [{ text: 'FPT debt data unavailable.', sourceIds: ['G2'] }],
      },
    ],
  };
  const intel = checkIntelEvidence(
    acceptCompanyIntel(data, intelRequest({ query: 'FPT', company, now }), shared),
    shared,
    company,
  );
  assert.equal(intel.sources.length, 1);
  assert.equal(intel.insights.length, 1);
  assert.match(intel.insights[0].analysis, /12000/);
  assert.doesNotMatch(intel.insights[0].analysis, /999999/);
  assert.ok(intel.validation.trimmedFields);
});

test('Home flow uses primary, second and primary models with at most three requests; cache preserves intel', async () => {
  const calls = [];
  let updateRetrievals = 0;
  const formatted = fixture();
  formatted.company = { ...formatted.company, ...company, sourceIds: ['G1'] };
  formatted.metrics = [];
  formatted.analysis = { question: '', observations: [], risks: [], conclusion: '' };
  const responses = [
    {
      text,
      candidates: [
        {
          finishReason: 'STOP',
          groundingMetadata: {
            groundingChunks: [{ web: { uri: source.url, title: source.title } }],
            groundingSupports: [{ segment: { text }, groundingChunkIndices: [0] }],
          },
        },
      ],
    },
    { text: JSON.stringify(intelFixture()) },
    { text: JSON.stringify(formatted) },
  ];
  const client = {
    models: {
      generateContent: async (input) => {
        calls.push(input);
        return responses.shift();
      },
    },
  };
  process.env.GEMINI_MODEL = 'primary-intel-test';
  process.env.GEMINI_INTEL_MODEL = 'gemini-3.5-flash';
  const input = {
    query: 'FPT',
    now,
    client,
    includeIntel: true,
    cache: true,
    updates: async () => {
      updateRetrievals++;
      return { ...result, section: 'Dated publisher updates' };
    },
    vietstock: async () => vietstockFixture(),
    prices: async () => priceFixture(),
  };
  const report = await researchCompany(input);
  assert.deepEqual(
    calls.map((row) => row.model),
    ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'],
  );
  assert.ok(calls[0].config.tools);
  assert.equal(calls[1].config.tools, undefined);
  assert.equal(
    JSON.parse(calls[1].contents).supporting_evidence.results.some(
      (row) => row.section === 'Dated publisher updates',
    ),
    true,
  );
  assert.equal(calls[2].config.tools, undefined);
  assert.equal(report.requestUsage.requests, 3);
  assert.equal(report.companyIntel.articles.length, 1);
  assert.equal(report.analysisStatus.state, 'ready');
  assert.equal((await researchCompany(input)).id, report.id);
  assert.equal(calls.length, 3);
  assert.equal(updateRetrievals, 1);
  await assert.rejects(retryCompanyAnalysis({ id: report.id, client }), { status: 409 });
});

test('second model quota stops the flow and never retries or calls final formatter automatically', async () => {
  let calls = 0;
  process.env.GEMINI_MODEL = 'primary-quota-intel-test';
  process.env.GEMINI_INTEL_MODEL = 'second-quota-intel-test';
  const client = {
    models: {
      generateContent: async () => {
        calls++;
        if (calls === 2) throw Object.assign(new Error('Too many requests'), { status: 429 });
        return {
          text,
          candidates: [
            {
              finishReason: 'STOP',
              groundingMetadata: { groundingChunks: [{ web: { uri: source.url } }] },
            },
          ],
        };
      },
    },
  };
  const report = await researchCompany({
    intelFallbackModel: null,
    query: 'FPT',
    now,
    client,
    includeIntel: true,
    vietstock: async () => vietstockFixture(),
    prices: async () => priceFixture(),
  });
  assert.equal(calls, 2);
  assert.equal(report.analysisStatus.status, 429);
  assert.equal(report.financials.length, 2);
  assert.equal(report.companyIntel, null);
});

test('intelligence errors switch to 3.5 Lite without Search and retain partial data at the cap', async () => {
  const calls = [],
    responses = [
      {
        text,
        candidates: [
          {
            finishReason: 'STOP',
            groundingMetadata: { groundingChunks: [{ web: { uri: source.url } }] },
          },
        ],
      },
      { status: 503 },
      { text: JSON.stringify(intelFixture()) },
    ];
  const client = {
    models: {
      generateContent: async (args) => {
        calls.push(args);
        const answer = responses.shift();
        if (answer.status) throw answer;
        return answer;
      },
    },
  };
  // Previous legacy quota test sets a cooldown on the same fixed model; advance beyond it.
  const originalNow = Date.now;
  Date.now = () => originalNow() + 20000;
  try {
    const report = await researchCompany({
      query: 'FPT',
      now,
      client,
      includeIntel: true,
      vietstock: async () => vietstockFixture(),
      prices: async () => priceFixture(),
    });
    assert.deepEqual(
      calls.map((call) => call.model),
      ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'],
    );
    assert.equal(calls[2].config.tools, undefined);
    assert.equal(report.companyIntel.model, 'gemini-3.5-flash-lite');
    assert.equal(report.requestUsage.requests, 3);
    assert.equal(report.analysisStatus.state, 'unavailable');
    assert.match(report.modelNotice, /3.5 Flash-Lite/);
  } finally {
    Date.now = originalNow;
  }
});
