import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateGemini, geminiModel, googleSearchConfig } from '../server/gemini.js';
import { extractGrounding, publicError } from '../server/research.js';
import { groundingDiagnostic } from '../server/grounding.js';

// One small real request. No model fallback, retries, or full company research.
const diagnostic = {
  model: geminiModel(),
  api: 'generateContent',
  tool: 'googleSearch',
  checkedAt: new Date().toISOString(),
};
try {
  const response = await generateGemini(
    {
      model: diagnostic.model,
      contents:
        'Use Google Search to find the official FPT Corporation investor relations website in Vietnam. Give a short answer with a citation.',
      config: {
        ...googleSearchConfig(),
        temperature: 0.2,
        maxOutputTokens: 1000,
        httpOptions: { timeout: 60000 },
        abortSignal: AbortSignal.timeout(65000),
      },
    },
    { apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY },
  );
  const evidence = extractGrounding(response, 'G');
  diagnostic.response = groundingDiagnostic(response, evidence, 'probe');
  Object.assign(diagnostic, {
    status: 'success',
    sources: evidence.sources.length,
    claims: evidence.claims.length,
    searchQueries: evidence.queries,
    grounded: Boolean(evidence.sources.length && evidence.claims.length),
  });
  if (!diagnostic.grounded) process.exitCode = 1;
} catch (error) {
  const safe = publicError(error);
  // Keep the provider reason only after removing keys, URLs, and credential references.
  let reason = String(error.message || '');
  for (const key of [process.env.GEMINI_API_KEY, process.env.GOOGLE_API_KEY].filter(Boolean))
    reason = reason.split(key).join('[redacted]');
  reason = reason
    .replace(/https?:\/\/[^\s"<>]+/g, '[provider URL]')
    .replace(/AIza[\w-]+/g, '[redacted]');
  Object.assign(diagnostic, {
    status: 'failed',
    httpStatus: Number(error.status || error.code) || null,
    message: safe.message,
    providerReason: reason.slice(0, 1500),
    gemini: safe.gemini,
  });
  process.exitCode = 1;
}
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/grounding-diagnostic.json', JSON.stringify(diagnostic, null, 2));
console.log(JSON.stringify(diagnostic, null, 2));
