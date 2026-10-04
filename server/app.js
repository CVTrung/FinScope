import express from 'express';
import { geminiStatus } from './gemini.js';
import {
  researchCompany,
  retryCompanyAnalysis,
  localizeCompanyReport,
  publicError,
  ResearchError,
} from './research.js';
import { searchNews, getPriceHistory } from './providers.js';
import { translateReport } from './localization.js';
import { reportSchema } from '../shared/report.js';
import { newsWindows } from '../shared/news.js';
import { resolveNewsCompany } from '../shared/companyAliases.js';

export function createApp({
  research = researchCompany,
  news = searchNews,
  prices = getPriceHistory,
  translate = translateReport,
  analyze = retryCompanyAnalysis,
} = {}) {
  const app = express();
  app.post('/api/translate-report', express.json({ limit: '1mb' }), async (req, res) => {
    if (
      !reportSchema.safeParse(req.body?.report).success ||
      !['en', 'vi'].includes(req.body?.language)
    )
      return res.status(400).json({ error: 'Invalid report or language.' });
    try {
      if (['direct-analysis-v1', 'grounded-research-v2'].includes(req.body.report.workflow))
        return res.json(localizeCompanyReport(req.body.report, req.body.language));
      res.json(
        await translate({
          report: req.body.report,
          language: req.body.language,
          signal: AbortSignal.timeout(150000),
        }),
      );
    } catch (error) {
      const result = publicError(error);
      if (result.gemini?.retryAfterSeconds)
        res.set('Retry-After', String(result.gemini.retryAfterSeconds));
      res.status(result.status).json({ error: result.message, gemini: result.gemini });
    }
  });
  app.use(express.json({ limit: '12kb' }));
  app.post('/api/research/:id/analysis', async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 160000);
    res.on('close', () => controller.abort());
    try {
      res.json(
        await analyze({
          id: req.params.id,
          language: req.body?.language === 'en' ? 'en' : 'vi',
          signal: controller.signal,
        }),
      );
    } catch (error) {
      const result = publicError(error);
      res.status(result.status).json({ error: result.message, gemini: result.gemini });
    } finally {
      clearTimeout(timeout);
    }
  });
  app.get('/api/health', (_req, res) =>
    res.json({
      status: 'ok',
      configured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      newsConfigured: Boolean(process.env.GOOGLE_NEWS_API_KEY),
      ...geminiStatus(),
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
    const timeout = setTimeout(() => controller.abort(), 600000);
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
          send({
            type: 'error',
            error: result.message,
            status: result.status,
            gemini: result.gemini,
            diagnostics: result.diagnostics,
          });
          res.end();
        } else {
          if (result.gemini?.retryAfterSeconds)
            res.set('Retry-After', String(result.gemini.retryAfterSeconds));
          res.status(result.status).json({
            error: result.message,
            gemini: result.gemini,
            diagnostics: result.diagnostics,
          });
        }
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
    if (!resolveNewsCompany(query))
      return res
        .status(400)
        .json({ error: 'Choose a supported Vietnamese company name or stock ticker.' });
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
            : 'Google News search is unavailable. Please retry.',
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
