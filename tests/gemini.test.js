import test from 'node:test';
import assert from 'node:assert/strict';
import {
  geminiModel,
  geminiStatus,
  quotaDetails,
  generateGemini,
  googleSearchConfig,
} from '../server/gemini.js';
import { publicError } from '../server/research.js';
import { generateJson } from '../server/localization.js';
import { z } from 'zod';

test('environment model is trimmed and used consistently by research and translation', async () => {
  const previous = process.env.GEMINI_MODEL;
  process.env.GEMINI_MODEL = '  test-env-model  ';
  const calls = [];
  const client = {
    models: {
      generateContent: async (input) => {
        calls.push(input.model);
        return { text: '{}' };
      },
    },
  };
  try {
    assert.equal(geminiModel(), 'test-env-model');
    assert.equal(geminiStatus().modelSource, 'environment');
    await generateGemini({ model: geminiModel(), contents: 'test' }, { client });
    await generateJson({ prompt: 'test', schema: z.object({}), client });
    assert.deepEqual(calls, ['test-env-model', 'test-env-model']);
    delete process.env.GEMINI_MODEL;
    assert.equal(geminiStatus().modelSource, 'default');
  } finally {
    if (previous === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previous;
  }
});

test('quota response exposes only safe identifiers and retry seconds', () => {
  const error = {
    status: 429,
    message: JSON.stringify({
      error: {
        details: [
          {
            violations: [
              {
                quotaMetric: 'generate_content_requests',
                quotaId: 'RequestsPerMinute',
                description: 'secret',
                quotaDimensions: { model: 'ignored' },
              },
            ],
          },
          { retryDelay: '12.5s' },
          { links: [{ url: 'https://secret.test/?key=secret' }] },
        ],
      },
    }),
  };
  const details = quotaDetails(error, 'configured-model');
  assert.equal(details.retryAfterSeconds, 13);
  assert.equal(details.retryDelaySource, 'provider');
  const fallback = quotaDetails({ status: 429, message: 'Too many requests' }, 'model');
  assert.equal(fallback.retryDelaySource, 'local');
  assert.equal(fallback.retryAfterSeconds, 10);
  assert.deepEqual(details.quotaIdentifiers, ['generate_content_requests', 'RequestsPerMinute']);
  assert.ok(!JSON.stringify(details).includes('secret'));
  assert.equal(quotaDetails({ status: 503, message: 'unavailable' }, 'model'), null);
});

test('GenerateContent grounding uses the documented Search tool without JSON output', () => {
  assert.deepEqual(googleSearchConfig(), { tools: [{ googleSearch: {} }] });
  assert.equal(geminiStatus().apiVersion, 'v1beta');
  assert.equal(geminiStatus().groundingTool, 'googleSearch');
});

test('model access restrictions and Search configuration errors are distinct and stop research', async () => {
  for (const error of [
    { status: 404, message: 'This model is no longer available to new users. private details' },
    { status: 400, message: 'Google Search grounding is not supported. private details' },
  ]) {
    let calls = 0;
    const client = {
      models: {
        generateContent: async () => {
          calls++;
          throw error;
        },
      },
    };
    await assert.rejects(
      generateGemini({ model: 'access-check' }, { client }),
      (cause) => cause === error,
    );
    assert.equal(calls, 1);
    const safe = publicError(error);
    assert.equal(safe.status, 503);
    assert.ok(!safe.message.includes('private details'));
    assert.match(safe.message, error.status === 404 ? /existing users/ : /Search grounding/);
    if (error.status === 404) assert.ok(!safe.message.includes('Google Search support'));
  }
});

test('alternate quota error formats are recognized and normalized without retries', async () => {
  for (const [index, error] of [
    { code: 429, message: 'Provider details must stay private' },
    { message: 'Too many requests' },
    { error: { status: 'RESOURCE_EXHAUSTED', details: [{ retryDelay: '2s' }] } },
    { message: JSON.stringify({ error: { code: 429, details: {} } }) },
  ].entries()) {
    let calls = 0;
    const model = `alternate-quota-${index}`;
    const client = {
      models: {
        generateContent: async () => {
          calls++;
          throw error;
        },
      },
    };
    await assert.rejects(generateGemini({ model }, { client }), { status: 429 });
    assert.equal(error.gemini.status, 429);
    await assert.rejects(generateGemini({ model }, { client }), { status: 429 });
    assert.equal(calls, 1);
  }
});

test('cooldown permits a manual attempt after its provider delay', async () => {
  const originalNow = Date.now;
  let now = originalNow(),
    calls = 0;
  const client = {
    models: {
      generateContent: async () => {
        calls++;
        throw {
          status: 429,
          message: JSON.stringify({ error: { details: [{ retryDelay: '2s' }] } }),
        };
      },
    },
  };
  Date.now = () => now;
  try {
    await assert.rejects(generateGemini({ model: 'expiry-test' }, { client }), { status: 429 });
    await assert.rejects(generateGemini({ model: 'expiry-test' }, { client }), { status: 429 });
    assert.equal(calls, 1);
    now += 2001;
    await assert.rejects(generateGemini({ model: 'expiry-test' }, { client }), { status: 429 });
    assert.equal(calls, 2);
  } finally {
    Date.now = originalNow;
  }
});
