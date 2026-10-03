import express from 'express';
import { researchCompany, publicError, ResearchError } from './research.js';
import { searchNews, getPriceHistory } from './providers.js';
import { translateReport } from './localization.js';
import { reportSchema } from '../shared/report.js';
import { newsWindows } from '../shared/news.js';

export function createApp({
  research = researchCompany,
  news = searchNews,
  prices = getPriceHistory,
  translate = translateReport,
} = {}) {
  const app = express();
  app.post('/api/translate-report', express.json({ limit: '1mb' }), async (req, res) => {
    if (
      !reportSchema.safeParse(req.body?.report).success ||
      !['en', 'vi'].includes(req.body?.language)
    )
      return res.status(400).json({ error: 'Invalid report or language.' });
    try {
      res.json(
        await translate({
          report: req.body.report,
          language: req.body.language,
          signal: AbortSignal.timeout(150000),
        }),
      );
    } catch (error) {
      const result = publicError(error);
      res.status(result.status).json({ error: result.message });
    }
  });
  app.use(express.json({ limit: '12kb' }));
  app.get('/api/health', (_req, res) =>
    res.json({
      status: 'ok',
      configured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      newsConfigured: Boolean(process.env.TAVILY_API_KEY),
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    }),
  );
  app.post('/api/research', async (req, res) => {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (query.length < 2 || query.length > 200)
      return res
        .status(400)
        .json({ error: 'Enter a company or ticker between 2 and 200 characters.' });
    const language = req.body.language === 'en' ? 'en' : 'vi';
    const streaming = req.get('accept')?.includes('application/x-ndjson');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 270000);
    res.on('close', () => controller.abort());
    const send = (value) => {
      if (!res.destroyed) res.write(`${JSON.stringify(value)}\n`);
    };
    let heartbeat;
    if (streaming) {
      res.set({
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
      heartbeat = setInterval(() => send({ type: 'heartbeat' }), 15000);
    }
    try {
      const report = await research({
        query,
        language,
        signal: controller.signal,
        onProgress: (data) => {
          if (streaming) send({ type: 'progress', ...data });
        },
      });
      if (!res.destroyed) {
        if (streaming) {
          send({ type: 'result', report });
          res.end();
        } else res.json(report);
      }
    } catch (error) {
      const result = publicError(error);
      if (!res.destroyed) {
        if (streaming) {
          send({ type: 'error', error: result.message });
          res.end();
        } else res.status(result.status).json({ error: result.message });
      }
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
    }
  });
  app.post('/api/news', async (req, res) => {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (query.length < 2 || query.length > 200)
      return res.status(400).json({ error: 'Enter a news topic between 2 and 200 characters.' });
    try {
      res.json(
        await news({
          query,
          language: req.body.language === 'en' ? 'en' : 'vi',
          days: newsWindows.some((item) => item.days === req.body.days) ? req.body.days : 30,
          signal: AbortSignal.timeout(150000),
        }),
      );
    } catch (error) {
      res.status(error instanceof ResearchError ? error.status : 502).json({
        error:
          error instanceof ResearchError
            ? error.message
            : 'Tavily news search is unavailable. Please retry.',
      });
    }
  });
  app.get('/api/prices', async (req, res) => {
    try {
      res.json(
        await prices({
          ticker: req.query.ticker,
          exchange: req.query.exchange,
          signal: AbortSignal.timeout(30000),
        }),
      );
    } catch (error) {
      res.status(error.status || 502).json({
        error:
          error instanceof Error && error.status
            ? error.message
            : 'Vietstock historical prices are currently unavailable.',
      });
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use((error, _req, res, _next) =>
    res.status(error.status === 413 ? 413 : 400).json({ error: 'Invalid request body.' }),
  );
  return app;
}
