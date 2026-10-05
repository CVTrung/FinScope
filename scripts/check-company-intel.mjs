import 'dotenv/config';
import fs from 'node:fs/promises';
import { researchCompanyIntel, companyIntelModel } from '../server/companyIntel.js';
import { generateGemini } from '../server/gemini.js';
import { modelOutputLimit, stageConfig } from '../server/groundedResearch.js';
import { publicError } from '../server/research.js';
import { retrieveIntelUpdates } from '../server/intelEvidence.js';

// One real second-model call, no Search or retries; optional live public publisher evidence.
const saved = JSON.parse(
  await fs.readFile('artifacts/vietstock-quarterly-history-verified.json', 'utf8'),
);
const model = companyIntelModel();
const sources = saved.sources.filter((source) => ['D1', 'D3'].includes(source.id));
const text = `Company HPG, Hoa Phat Group, HOSE. Public financial records with explicit units and periods: ${JSON.stringify(saved.quarters || saved.financials || [])}`;
const result = { text, sources, claims: [{ text, sourceIds: sources.map((source) => source.id) }] };
const diagnostic = {
  model,
  searchGrounding: false,
  requests: 0,
  checkedAt: new Date().toISOString(),
  evidence: 'Saved public Vietstock history',
};
try {
  const updates = process.argv.includes('--updates')
    ? await retrieveIntelUpdates({
        query: 'HPG',
        company: { name: 'Hoa Phat Group', ticker: 'HPG', exchange: 'HOSE' },
        now: new Date(),
        signal: AbortSignal.timeout(25000),
      })
    : null;
  const results = [result, ...(updates ? [updates] : [])];
  const combinedSources = [...sources, ...(updates?.sources || [])];
  Object.assign(diagnostic, {
    inputArticles: updates?.articles.length || 0,
    publisherBodies:
      updates?.articles.filter((row) => row.contentStatus === 'publisher_paragraphs').length || 0,
  });
  if (updates)
    await fs.writeFile(
      'artifacts/company-intel-updates-evidence.json',
      JSON.stringify(updates, null, 2),
    );
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const limit = await modelOutputLimit(model, undefined, apiKey);
  const intel = await researchCompanyIntel({
    query: 'HPG',
    company: { name: 'Hoa Phat Group', ticker: 'HPG', exchange: 'HOSE' },
    language: 'vi',
    now: new Date(),
    evidence: {
      sources: combinedSources,
      results,
      claims: results.flatMap((row) => row.claims),
      financials: saved.quarters,
    },
    request: async (model, contents, config) => {
      diagnostic.requests++;
      const response = await generateGemini(
        { model, contents, config: { ...stageConfig(model, limit, 'intelligence'), ...config } },
        { apiKey },
      );
      await fs.writeFile('artifacts/company-intel-provider.json', response.text);
      return response;
    },
  });
  Object.assign(diagnostic, {
    status: 'success',
    outputLimit: limit,
    articles: intel.articles.length,
    insights: intel.insights.length,
    watchlist: intel.watchlist.length,
    sources: intel.sources.length,
  });
  await fs.writeFile('artifacts/company-intel-live.json', JSON.stringify(intel, null, 2));
} catch (error) {
  const safe = publicError(error);
  Object.assign(diagnostic, {
    status: 'failed',
    message: safe.message,
    httpStatus: safe.status,
    gemini: safe.gemini,
  });
  process.exitCode = 1;
}
await fs.writeFile('artifacts/company-intel-diagnostic.json', JSON.stringify(diagnostic, null, 2));
console.log(JSON.stringify(diagnostic, null, 2));
