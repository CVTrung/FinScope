import express from 'express';
import fs from 'node:fs/promises';
import { createApp } from '../server/app.js';
import { fixture } from '../tests/fixtures.js';
import { calculateGrowth } from '../server/companyResearch.js';
const saved = JSON.parse(
  await fs.readFile('artifacts/vietstock-quarterly-history-verified.json', 'utf8'),
);
process.env.GEMINI_API_KEY = 'fixture-only';
const report = {
  ...fixture(),
  id: 'quarterly-history-ui',
  query: 'HPG public history replay',
  language: 'vi',
  researchLanguage: 'vi',
  workflow: 'grounded-research-v2',
  generatedAt: saved.retrievedAt,
  sources: saved.sources,
  company: {
    ...fixture().company,
    name: '[Public evidence replay] HPG',
    ticker: 'HPG',
    exchange: 'HOSE',
    description: 'Vietstock historical quarterly statements',
    sourceIds: ['D1'],
  },
  quote: { ...fixture().quote, price: null, sourceIds: [] },
  metrics: [],
  financials: saved.quarters.map((row) => ({ ...row, evidenceStatus: 'direct' })),
  growth: calculateGrowth(saved.quarters),
  research: [],
  analysis: { question: '', observations: [], risks: [], conclusion: '' },
  targets: [],
  priceData: { ticker: 'HPG', currency: 'VND', points: [], sources: [] },
  analysisStatus: { state: 'ready' },
  requestUsage: { requests: 0, limit: 3 },
};
const app = createApp({ research: async () => report, prices: async () => report.priceData });
app.use(express.static('dist'));
app.get('/{*path}', (_, res) => res.sendFile('index.html', { root: 'dist' }));
app.listen(3002, '127.0.0.1', () =>
  console.log('Public Vietstock history replay: http://localhost:3002'),
);
