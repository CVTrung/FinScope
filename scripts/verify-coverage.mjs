// Deterministic UI verification only: no external API calls or genuine financial facts.
import express from 'express';
import { createApp } from '../server/app.js';
import { acceptReport } from '../server/reportAcceptance.js';
import { coverageFixture } from '../tests/coverageFixture.js';
import fs from 'node:fs/promises';
process.env.GEMINI_API_KEY = 'ui-fixture-only';
const { data, snapshot } = coverageFixture(true);
data.targets[0].thesis = 'FPT KBSV report';
const report = {
  ...acceptReport(data, snapshot),
  id: 'coverage-ui-fixture',
  query: 'FPT UI fixture',
  generatedAt: snapshot.generatedAt,
  language: 'vi',
  researchLanguage: 'vi',
  workflow: 'grounded-research-v2',
  model: 'fixture-only',
  warnings: ['UI fixture only: sample data, not real company figures.'],
  sources: snapshot.results.flatMap((section) => section.sources),
  research: snapshot.results.map((section) => ({
    ...section,
    evidenceStatus: 'sources-only',
    sourceIds: section.sources.map((source) => source.id),
  })),
  analysisStatus: { state: 'ready' },
  requestUsage: { requests: 2, maximum: 3 },
  priceData: JSON.parse(
    (await fs.readFile('artifacts/news-prices-availability.json', 'utf8')).replace(/^\uFEFF/, ''),
  ).prices,
};
const app = createApp({ research: async () => structuredClone(report) });
report.company.name = '[UI fixture] FPT Corporation';
report.targets.push({
  ...report.targets[1],
  firm: 'DSC',
  title: 'FPT: Khuyến nghị MUA với giá mục tiêu 26,900 đồng/cổ phiếu',
  listedAt: '2026-08-07',
  sourceIds: ['C'],
});
app.use(express.static('dist'));
app.get('/{*path}', (_, res) => res.sendFile('index.html', { root: 'dist' }));
app.listen(3002, '127.0.0.1', () => console.log('Coverage UI fixtures: http://localhost:3002'));
