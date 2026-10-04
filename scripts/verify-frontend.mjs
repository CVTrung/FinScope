import express from 'express';
import fs from 'node:fs';
import { createApp } from '../server/app.js';
import { researchCompany, retryCompanyAnalysis } from '../server/research.js';
import { vietstockFixture, priceFixture } from '../tests/fixtures.js';
import { chartStats } from '../shared/prices.js';
const grounded = JSON.parse(fs.readFileSync('artifacts/live-grounded-report.json', 'utf8'));
const saved = fs.existsSync('artifacts/live-direct-report.json')
  ? JSON.parse(fs.readFileSync('artifacts/live-direct-report.json', 'utf8'))
  : null;
const direct = saved
  ? {
      company: { ...saved.company, url: saved.sources.find((item) => item.id === 'D1').url },
      financials: saved.financials,
      quote: saved.quote,
      ratios: [],
      reports: saved.directEvidence.reports,
      events: saved.directEvidence.events,
      documents: saved.directEvidence.documents,
      gaps: saved.directEvidence.gaps,
      sources: saved.sources,
      claims: saved.research[0].claims,
      section: 'Direct Vietstock evidence',
      text: saved.research[0].text,
      retrievedAt: saved.generatedAt,
    }
  : vietstockFixture();
const prices = saved?.priceData || priceFixture();
prices.windowStats = chartStats(prices.points);
const counts = {
  homeRequests: 0,
  directRetrievals: 0,
  priceRetrievals: 0,
  analysisRequests: 0,
  modelCalls: 0,
  newsCalls: 0,
};
// All providers are fixtures. This server never contacts Gemini, SerpApi or Vietstock.
process.env.GEMINI_API_KEY = 'fixture-only';
process.env.GOOGLE_NEWS_API_KEY = 'fixture-only';
process.env.GEMINI_MODEL = 'fixture-grounded-model';
const client = {
  models: {
    generateContent: async (request) => {
      counts.modelCalls++;
      if (counts.modelCalls === 2)
        throw {
          status: 429,
          message: JSON.stringify({ error: { details: [{ retryDelay: '2s' }] } }),
        };
      if (request.config.tools) {
        const original = grounded.research.find((section) => section.section === 'company');
        const originalSources = grounded.sources.filter((source) => source.id.startsWith('G'));
        return {
          text: original.text,
          candidates: [
            {
              finishReason: 'STOP',
              groundingMetadata: {
                webSearchQueries: original.queries,
                groundingChunks: originalSources.map((source) => ({
                  web: { uri: source.url, title: source.title },
                })),
                groundingSupports: original.claims.map((claim) => ({
                  segment: { text: claim.text },
                  groundingChunkIndices: claim.sourceIds
                    .map((id) => originalSources.findIndex((source) => source.id === id))
                    .filter((index) => index >= 0),
                })),
              },
            },
          ],
        };
      }
      const report = structuredClone(grounded);
      report.targets = [];
      return { text: JSON.stringify(report) };
    },
  },
};
const app = createApp({
  research: (args) => {
    counts.homeRequests++;
    if (args.query === 'FPT quota snapshot') return structuredClone(grounded);
    return researchCompany({
      ...args,
      client,
      vietstock: async () => {
        counts.directRetrievals++;
        return structuredClone(direct);
      },
      prices: async () => {
        counts.priceRetrievals++;
        return structuredClone(prices);
      },
    });
  },
  analyze: (args) => {
    counts.analysisRequests++;
    return retryCompanyAnalysis({ ...args, client });
  },
  prices: async () => {
    counts.priceRetrievals++;
    return structuredClone(prices);
  },
  news: async ({ query, language, days }) => {
    counts.newsCalls++;
    return {
      query,
      language,
      days,
      provider: 'Google News',
      startDate: '2026-09-28',
      endDate: '2026-10-04',
      retrievedAt: new Date().toISOString(),
      articles: [
        {
          title: '[UI fixture] FPT: tin doanh nghiệp Việt Nam',
          url: 'https://vietstock.vn/2026/10/fpt-ui-fixture.htm',
          publisher: 'Vietstock',
          publishedAt: '2026-10-04',
          summary: 'Fixture only: kiểm tra lưu kết quả khi chuyển trang.',
          image: null,
        },
      ],
      searchedDomains: ['vietstock.vn'],
      searchRequests: 0,
    };
  },
});
app.get('/verification-counts', (_, res) => res.json(counts));
app.use(express.static('dist'));
app.get('/{*path}', (_, res) => res.sendFile('index.html', { root: 'dist' }));
app.listen(3002, '127.0.0.1', () => console.log('Provider fixtures only: http://localhost:3002'));
