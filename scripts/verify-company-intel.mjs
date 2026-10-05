// Local UI replay: real saved public HPG intelligence and an explicit FPT sample for article controls.
import fs from 'node:fs/promises';
import express from 'express';
import { createApp } from '../server/app.js';
import { fixture } from '../tests/fixtures.js';
import { intelFixture } from '../tests/companyIntelFixture.js';
process.env.GEMINI_API_KEY = 'ui-replay-only';
const saved = JSON.parse(
  await fs.readFile('artifacts/vietstock-quarterly-history-verified.json', 'utf8'),
);
const intel = JSON.parse(await fs.readFile('artifacts/company-intel-live.json', 'utf8'));
const report = {
  ...fixture(),
  id: 'intel-ui-replay',
  query: 'HPG',
  language: 'vi',
  company: {
    name: 'Hòa Phát · Public evidence replay',
    ticker: 'HPG',
    exchange: 'HOSE',
    sector: '',
    country: 'Việt Nam',
    description: '',
    sourceIds: ['D1'],
  },
  sources: saved.sources,
  financials: saved.quarters,
  metrics: [],
  quote: { price: null, currency: 'VND', asOf: '', changePercent: null, basis: '', sourceIds: [] },
  research: [],
  workflow: 'grounded-research-v2',
  companyIntel: intel,
  generatedAt: intel.metadata.generated_at,
  analysisStatus: { state: process.argv.includes('--partial') ? 'partial' : 'ready' },
  modelNotice: process.argv.includes('--partial') ? 'Gemini 3.5 Flash gặp lỗi hoặc giới hạn hạn ngạch. Đã chuyển sang Gemini 3.5 Flash-Lite.' : '',
  model: intel.model,
  priceData: { ticker: 'HPG', points: [], sources: [], provider: 'Vietstock', currency: 'VND' },
};
const app = createApp({
  news: async ({ query, days, language }) => {
    console.log(`Replay news search: ${query} / ${days} / ${language}`);
    return {
      query,
      days,
      language,
      startDate: '2026-09-05',
      endDate: '2026-10-05',
      retrievedAt: '2026-10-05T03:00:00Z',
      articles: Array.from({ length: 6 }, (_, i) => ({
        title: `${query} · Company news UI sample ${i + 1}`,
        summary: 'Explicit sample to verify the expandable company news preview and article details.',
        url: `https://vietstock.vn/ui-sample-${i + 1}`, publisher: 'Vietstock · UI sample',
        publishedAt: `2026-10-0${5 - Math.min(i, 4)}`, imageUrl: '',
      })),
    };
  },
  research: async ({ query }) => {
    if (query === 'FPT')
      return {
        ...report,
        company: { ...report.company, name: 'FPT · Sample UI data', ticker: 'FPT' },
        companyIntel: {
          ...intelFixture(),
          model: 'UI sample only',
          language: 'vi',
          searchGrounding: false,
        },
        financials: [],
      };
    return structuredClone(report);
  },
});
app.use(express.static('dist'));
app.get('/{*path}', (_, res) => res.sendFile('index.html', { root: 'dist' }));
app.listen(3002, '127.0.0.1', () =>
  console.log('Company intelligence UI replay: http://localhost:3002'),
);
