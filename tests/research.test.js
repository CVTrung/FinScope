import test from 'node:test';
import assert from 'node:assert/strict';
import {
  researchCompany,
  retryCompanyAnalysis,
  localizeCompanyReport,
} from '../server/research.js';
import { calculateGrowth } from '../server/companyResearch.js';
import { validateReport, stageConfig } from '../server/groundedResearch.js';
import { fixture, vietstockFixture, priceFixture, target } from './fixtures.js';
import { createApp } from '../server/app.js';
const now = new Date('2026-10-04T03:00:00Z');
let modelId = 0;
export function groundedFixture(
  text = 'FPT Corporation ticker FPT exchange HOSE Vietnam. Annual 2025 revenue 12000 billion VND and consolidated net income 2200 billion VND. Report period 2025-12-31.',
) {
  return {
    text,
    candidates: [
      {
        finishReason: 'STOP',
        groundingMetadata: {
          webSearchQueries: ['FPT filings'],
          groundingChunks: [{ web: { uri: 'https://fpt.com/ir', title: 'FPT filing' } }],
          groundingSupports: [{ segment: { text }, groundingChunkIndices: [0] }],
        },
      },
    ],
  };
}
function formatted() {
  const data = fixture();
  data.company = {
    ...data.company,
    name: 'FPT Corporation',
    ticker: 'FPT',
    exchange: 'HOSE',
    sourceIds: ['G1'],
  };
  data.quote.price = null;
  data.financials = vietstockFixture().financials;
  data.metrics = [];
  data.analysis = {
    question: '',
    observations: [
      {
        title: 'Reported revenue',
        detail: 'Annual 2025 revenue was 12000 billion VND.',
        alternative: '',
        nextStep: '',
        sourceIds: ['G1'],
      },
    ],
    risks: [],
    conclusion: '',
  };
  return data;
}
function input(client, extra = {}) {
  process.env.GEMINI_MODEL = 'grounded-test-' + ++modelId;
  return {
    query: 'FPT (HOSE)',
    language: 'vi',
    now,
    client,
    vietstock: async () => vietstockFixture(),
    prices: async () => priceFixture(),
    ...extra,
  };
}
function sequence(responses, calls = []) {
  return {
    models: {
      generateContent: async (args) => {
        calls.push(args);
        const response = responses.shift();
        if (response instanceof Error || response?.status) throw response;
        return response;
      },
    },
  };
}
const json = (data = formatted()) => ({ text: JSON.stringify(data) });

test('three-stage grounded flow uses env model, two Search calls and one JSON call', async () => {
  const calls = [];
  const report = await researchCompany(
    input(
      sequence(
        [groundedFixture(), groundedFixture('FPT broker report unavailable.'), json()],
        calls,
      ),
    ),
  );
  assert.equal(calls.length, 3);
  assert.ok(
    calls
      .slice(0, 2)
      .every((call) => call.config.tools[0].googleSearch && !call.config.responseMimeType),
  );
  assert.equal(calls[2].config.responseMimeType, 'application/json');
  assert.equal(calls[2].config.tools, undefined);
  assert.ok(
    calls.every(
      (call) => call.model === process.env.GEMINI_MODEL && call.config.maxOutputTokens <= 36000,
    ),
  );
  assert.equal(report.workflow, 'grounded-research-v2');
  assert.equal(report.requestUsage.requests, 3);
  assert.equal(report.analysisStatus.state, 'ready');
  assert.equal(report.analysis.observations.length, 1);
  assert.equal(report.financials[1].revenue, 12000);
  await assert.rejects(retryCompanyAnalysis({ id: report.id, client: sequence([]) }), {
    status: 409,
  });
});
test('valuation can be skipped, direct listing optional, invented figures and observations removed', async () => {
  const data = formatted();
  data.financials = [
    { ...data.financials[1], sourceIds: ['G1'], revenue: 999999, netIncome: 2200 },
  ];
  data.analysis.observations[0].detail = 'Revenue 999999.';
  const calls = [];
  const report = await researchCompany(
    input(sequence([groundedFixture(), json(data)], calls), {
      includeTargets: false,
      vietstock: async () => null,
    }),
  );
  assert.equal(calls.length, 2);
  assert.equal(report.financials[0].revenue, null);
  assert.equal(report.financials[0].netIncome, 2200);
  assert.equal(report.analysis.observations.length, 0);
  assert.deepEqual(report.priceData, priceFixture());
});
test('direct period financials cannot be overwritten; price failure remains independent', async () => {
  const data = formatted();
  data.financials[1].revenue = 999999;
  const report = await researchCompany(
    input(sequence([groundedFixture(), json(data)]), {
      includeTargets: false,
      prices: async () => {
        throw Error('offline');
      },
    }),
  );
  assert.equal(report.financials[1].revenue, 12000);
  assert.equal(report.priceData, null);
});
test('missing citations, model access, quota and truncated core stop after one attempt', async () => {
  for (const response of [
    { text: 'uncited', candidates: [] },
    { status: 404, message: 'private' },
    { status: 429, message: 'Too many requests' },
    { ...groundedFixture(), candidates: [{ finishReason: 'MAX_TOKENS' }] },
  ]) {
    const calls = [];
    let retrievals = 0;
    await assert.rejects(
      researchCompany(
        input(sequence([response], calls), {
          vietstock: async () => {
            retrievals++;
            return vietstockFixture();
          },
        }),
      ),
    );
    assert.equal(calls.length, 1);
    assert.equal(retrievals, 0);
  }
});
test('broker quota stops formatting; manual continuation shares original budget and cached evidence', async () => {
  const calls = [];
  let retrievals = 0;
  const client = sequence(
    [
      groundedFixture(),
      { status: 429, message: JSON.stringify({ error: { details: [{ retryDelay: '2s' }] } }) },
      json(),
    ],
    calls,
  );
  const report = await researchCompany(
    input(client, {
      vietstock: async () => {
        retrievals++;
        return vietstockFixture();
      },
    }),
  );
  assert.equal(calls.length, 2);
  assert.equal(report.analysisStatus.status, 429);
  assert.equal(report.financials.length, 2);
  assert.equal(report.analysisStatus.requestsRemaining, 1);
  await assert.rejects(retryCompanyAnalysis({ id: report.id, client }), { status: 429 });
  const old = Date.now;
  Date.now = () => old() + 2001;
  try {
    const resumed = await retryCompanyAnalysis({ id: report.id, client });
    assert.equal(resumed.requestUsage.requests, 3);
    assert.equal(resumed.analysisStatus.state, 'ready');
  } finally {
    Date.now = old;
  }
  assert.equal(retrievals, 1);
  assert.equal(calls.length, 3);
});
test('malformed third call has no repair or fourth call and directs to new Home search', async () => {
  const calls = [];
  const client = sequence(
    [groundedFixture(), groundedFixture('No broker report found.'), { text: '{bad' }],
    calls,
  );
  const report = await researchCompany(input(client));
  assert.equal(calls.length, 3);
  assert.equal(report.analysisStatus.state, 'unavailable');
  assert.equal(report.analysisStatus.retryAllowed, false);
  assert.equal(report.analysis.observations.length, 0);
  await assert.rejects(retryCompanyAnalysis({ id: report.id, client }), { status: 409 });
});
test('second-call formatting failure permits one cached manual repair', async () => {
  const calls = [];
  const client = sequence([groundedFixture(), { text: 'bad' }, json()], calls);
  const report = await researchCompany(input(client, { includeTargets: false }));
  assert.equal(report.analysisStatus.retryAllowed, true);
  const ready = await retryCompanyAnalysis({ id: report.id, client });
  assert.equal(ready.requestUsage.requests, 3);
  assert.equal(calls[2].config.tools, undefined);
  await assert.rejects(retryCompanyAnalysis({ id: report.id, client }), { status: 409 });
});
test('successful cache and language switch do not call Gemini again', async () => {
  const calls = [];
  const args = input(sequence([groundedFixture(), json()], calls), {
    includeTargets: false,
    cache: true,
  });
  const report = await researchCompany(args);
  const cached = await researchCompany(args);
  assert.equal(cached.id, report.id);
  assert.equal(calls.length, 2);
  const localized = localizeCompanyReport(report, 'en');
  assert.equal(localized.language, 'en');
  assert.equal(localized.researchLanguage, 'vi');
  assert.deepEqual(localized.financials, report.financials);
  assert.equal(calls.length, 2);
});
test('expired cached evidence rejects manual retry', async () => {
  const report = await researchCompany(
    input(sequence([groundedFixture(), { text: 'bad' }]), { includeTargets: false }),
  );
  const old = Date.now;
  Date.now = () => old() + 1800001;
  try {
    await assert.rejects(retryCompanyAnalysis({ id: report.id }), { status: 410 });
  } finally {
    Date.now = old;
  }
});
test('broker records keep missing fields but reject invented numbers, wrong authors and future dates', () => {
  const claim = 'FPT KBSV original report 15/09/2026 target price 86000 VND. Mua.';
  const data = formatted();
  data.targets = [
    target({ firm: 'KBSV', publishedAt: '2026-09-15', target: 86000, sourceIds: ['B1'] }),
  ];
  const snapshot = {
    language: 'vi',
    generatedAt: now.toISOString(),
    direct: null,
    results: [
      {
        sources: [
          { id: 'G1', title: 'FPT', url: 'https://fpt.com/ir' },
          { id: 'B1', title: 'KBSV', url: 'https://kbsec.com.vn/fpt.pdf' },
        ],
        text: groundedFixture().text + '\n\n' + claim,
        claims: [
          { text: groundedFixture().text, sourceIds: ['G1'] },
          { text: claim, sourceIds: ['B1'] },
        ],
      },
    ],
  };
  assert.equal(validateReport(data, snapshot).targets.length, 1);
  for (const change of [{ publishedAt: '2027-01-01' }, { firm: 'Consensus' }]) {
    const invalid = formatted();
    invalid.targets = [{ ...data.targets[0], ...change }];
    assert.equal(validateReport(invalid, snapshot).targets.length, 0);
  }
  for (const [change, field, expected] of [
    [{ target: 999999 }, 'target', null],
    [{ currency: 'USD' }, 'currency', ''],
    [{ publishedAt: '2026-09-21' }, 'publishedAt', ''],
  ]) {
    const partial = formatted();
    partial.targets = [{ ...data.targets[0], ...change }];
    const rows = validateReport(partial, snapshot).targets;
    assert.equal(rows.length, 1);
    assert.equal(rows[0][field], expected);
  }
});
test('budgets respect metadata output limits and control thinking per stage', () => {
  assert.equal(stageConfig('gemini-2.5-pro', 65536, 'format').thinkingConfig.thinkingBudget, 128);
  assert.equal(stageConfig('gemini-2.5-flash', 65536, 'company').maxOutputTokens, 16000);
  assert.equal(stageConfig('gemini-2.5-flash', 4096, 'format').maxOutputTokens, 4096);
  assert.equal(stageConfig('gemini-2.5-flash', 65536, 'format').thinkingConfig.thinkingBudget, 0);
  assert.equal(
    stageConfig('gemini-3.5-flash', 65536, 'company').thinkingConfig.thinkingLevel,
    'LOW',
  );
});
test('growth requires matching periods and units', () => {
  const rows = vietstockFixture().financials;
  assert.equal(calculateGrowth(rows).length, 2);
  assert.equal(calculateGrowth([rows[0], { ...rows[1], unit: 'million VND' }]).length, 0);
});
test('grounded flow retains source URLs without mappings and sends section excerpts to formatting', async () => {
  const core = groundedFixture();
  core.candidates[0].groundingMetadata.groundingSupports = [];
  const data = formatted();
  data.financials = [{ ...data.financials[1], sourceIds: ['G1'] }];
  const calls = [];
  const report = await researchCompany(
    input(sequence([core, json(data)], calls), {
      vietstock: async () => null,
      includeTargets: false,
    }),
  );
  assert.equal(calls.length, 2);
  assert.equal(report.analysisStatus.state, 'ready');
  assert.equal(report.financials[0].evidenceStatus, 'sources-only');
  assert.equal(report.research[0].evidenceStatus, 'sources-only');
  assert.match(calls[1].contents, /sectionExcerpt/);
});

test('academic/social evidence is excluded and cannot support company research alone', async () => {
  const response = groundedFixture();
  response.candidates[0].groundingMetadata.groundingChunks[0].web = {
    title: 'prezi.com',
    uri: 'https://prezi.com/fpt-swot',
  };
  const calls = [];
  await assert.rejects(
    researchCompany(input(sequence([response], calls))),
    /no usable Google Search sources/,
  );
  assert.equal(calls.length, 1);
});
test('API language switch avoids translation and manual formatting consumes remaining request', async () => {
  const client = sequence([groundedFixture(), { text: 'bad' }, json()]);
  const report = await researchCompany(input(client, { includeTargets: false }));
  const server = createApp({
    translate: () => {
      throw Error('unexpected translation');
    },
    analyze: (args) => retryCompanyAnalysis({ ...args, client }),
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const localized = await fetch(base + '/api/translate-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report, language: 'en' }),
    });
    assert.equal(localized.status, 200);
    const retry = await fetch(base + '/api/research/' + report.id + '/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'vi' }),
    });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).requestUsage.requests, 3);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
