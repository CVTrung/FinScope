import { GoogleGenAI } from '@google/genai';
import { groundingStatus } from './grounding.js';

export const defaultGeminiModel = 'gemini-3.5-flash-lite';
export function geminiModel() {
  return process.env.GEMINI_MODEL?.trim() || defaultGeminiModel;
}

// GenerateContent uses camelCase tool names; Interactions uses a different API shape.
// Keep Search separate from JSON formatting for compatibility with Gemini 2.5.
export function googleSearchConfig() {
  return { tools: [{ googleSearch: {} }] };
}

const limits = new Map();
let lastError = null;
export function geminiStatus() {
  return {
    model: geminiModel(),
    modelSource: process.env.GEMINI_MODEL?.trim() ? 'environment' : 'default',
    api: 'generateContent',
    apiVersion: 'v1beta',
    groundingTool: 'googleSearch',
    researchWorkflow: 'grounded-research-v2',
    requestLimit: 3,
    outputTokenCeiling: 36000,
    groundingDiagnostics: groundingStatus(),
    lastError,
  };
}

export function quotaDetails(error, model) {
  let body;
  try {
    body = JSON.parse(error.message)?.error;
  } catch {
    /* Not a JSON API error. */
  }
  body ||= error.error;
  if (
    Number(error.status || error.code || body?.code) !== 429 &&
    body?.status !== 'RESOURCE_EXHAUSTED' &&
    !/RESOURCE_EXHAUSTED|too many requests/i.test(error.message || '')
  )
    return null;
  const details = Array.isArray(body?.details) ? body.details : [];
  // Expose only quota identifiers and seconds, never raw provider text or credential URLs.
  const identifiers = details
    .flatMap((item) => item.violations || [])
    .flatMap((item) =>
      [item.quotaMetric, item.quotaId].filter(
        (value) => typeof value === 'string' && /^[\w./-]{1,200}$/.test(value),
      ),
    );
  const delay = details.find((item) => item.retryDelay)?.retryDelay;
  const seconds =
    typeof delay === 'string' && /^\d+(\.\d+)?s$/.test(delay) ? Math.ceil(parseFloat(delay)) : 10;
  return {
    model,
    status: 429,
    quotaIdentifiers: [...new Set(identifiers)],
    retryAfterSeconds: Math.max(1, seconds),
    retryDelaySource:
      typeof delay === 'string' && /^\d+(\.\d+)?s$/.test(delay) ? 'provider' : 'local',
    checkedAt: new Date().toISOString(),
  };
}

export function assertGeminiAvailable(model) {
  const limit = limits.get(model);
  if (limit && Date.now() < limit.until) {
    const error = new Error('Gemini quota cooldown.');
    error.status = 429;
    error.gemini = {
      ...limit.details,
      retryAfterSeconds: Math.ceil((limit.until - Date.now()) / 1000),
    };
    throw error;
  }
  limits.delete(model);
}

export async function generateGemini(input, { client, apiKey } = {}) {
  assertGeminiAvailable(input.model);
  // The installed SDK does not retry generateContent unless retryOptions are enabled.
  const ai = client || new GoogleGenAI({ apiKey, vertexai: false, apiVersion: 'v1beta' });
  try {
    return await ai.models.generateContent(input);
  } catch (error) {
    const details = quotaDetails(error, input.model);
    if (details) {
      error.status = 429;
      lastError = details;
      limits.set(input.model, { until: Date.now() + details.retryAfterSeconds * 1000, details });
      error.gemini = details;
    }
    throw error;
  }
}
