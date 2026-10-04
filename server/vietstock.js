import { safeUrl, validDate } from '../shared/report.js';
import { companyAliases } from '../shared/companyAliases.js';

const cache = new Map();
const newsCache = new Map();
const base = 'https://finance.vietstock.vn';
const normalized = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const plain = (s) =>
  String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function vietstockDate(value) {
  const milliseconds = /^\/Date\((\d+)(?:[+-]\d+)?\)\/$/.exec(value || '');
  if (milliseconds)
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
      new Date(Number(milliseconds[1])),
    );
  return validDate(value) ? value.slice(0, 10) : '';
}

function publicUrl(value, root = base) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, root);
    return safeUrl(url.href) &&
      (url.hostname === 'vietstock.vn' || url.hostname.endsWith('.vietstock.vn'))
      ? url.href
      : '';
  } catch {
    return '';
  }
}

export function resolveVietstockCompany(data, query) {
  if (typeof data?.data !== 'string') return null;
  const text = normalized(query);
  const candidates = data.data.split(/\r?\n/).flatMap((line) => {
    const [ticker, name, url, shortName, exchange, type] = line.split('|');
    return type === '2' && /^(HOSE|HNX|UPCOM)$/i.test(exchange || '') && publicUrl(url)
      ? [{ ticker, name, url, shortName, exchange }]
      : [];
  });
  const aliases = Object.entries(companyAliases)
    .filter(([ticker, names]) =>
      [ticker, ...names].some((name) => ` ${text} `.includes(` ${normalized(name)} `)),
    )
    .map(([ticker]) => ticker);
  const exact = candidates.filter(
    (company) =>
      ` ${text} `.includes(` ${normalized(company.ticker)} `) ||
      aliases.includes(company.ticker) ||
      normalized(company.name.split(' - ')[0]) === text ||
      normalized(company.shortName) === text,
  );
  return exact.length === 1 ? exact[0] : null;
}

export async function vietstockSession({ query, signal, fetcher = fetch }) {
  const timeout = AbortSignal.timeout(12000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  if (/\b(NASDAQ|NYSE|LSE|HKEX)\b/i.test(query)) throw new Error('Non-Vietnamese listing');
  const aliases = Object.entries(companyAliases).filter(([ticker, names]) =>
    [ticker, ...names].some((name) =>
      (' ' + normalized(query) + ' ').includes(' ' + normalized(name) + ' '),
    ),
  );
  const lookup = aliases.length === 1 ? aliases[0][0] : query.slice(0, 100);
  const search = await fetcher(`${base}/search/${encodeURIComponent(lookup)}/3`, {
    signal: requestSignal,
  });
  if (!search.ok) throw new Error('Company lookup unavailable');
  const company = resolveVietstockCompany(await search.json(), query);
  if (!company) throw new Error('No unambiguous Vietnamese listing resolved');
  const page = await fetcher(company.url, { signal: requestSignal });
  if (!page.ok) throw new Error('Company page unavailable');
  const html = await page.text();
  const input = html.match(/<input\b[^>]*name=["']?__RequestVerificationToken["']?[^>]*>/i)?.[0];
  const token = input
    ?.match(/value=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
    ?.slice(1)
    .find(Boolean);
  if (!token) throw new Error('Public data access unavailable');
  const cookie = (page.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  return {
    company,
    html,
    async post(path, values) {
      const time = AbortSignal.timeout(10000);
      const response = await fetcher(base + path, {
        method: 'POST',
        signal: signal ? AbortSignal.any([signal, time]) : time,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: cookie,
          Referer: company.url,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: new URLSearchParams({ ...values, __RequestVerificationToken: token }),
      });
      if (!response.ok) throw new Error('Public data response unavailable');
      const text = await response.text();
      if (!text.trim()) throw new Error('Public data response empty');
      return JSON.parse(text);
    },
  };
}

export function parseVietstockFinancials(data, kind, sourceId, now = new Date()) {
  if (!Array.isArray(data?.[0]) || !data?.[1] || typeof data[1] !== 'object') return [];
  const metrics = Object.values(data[1])
    .flat()
    .filter((row) => row && typeof row === 'object');
  const today = now.toISOString().slice(0, 10);
  return data[0]
    .flatMap((column) => {
      if (!/^\d{6}$/.test(column.PeriodBegin) || !/^\d{6}$/.test(column.PeriodEnd)) return [];
      const endYear = Number(column.PeriodEnd.slice(0, 4)),
        endMonth = Number(column.PeriodEnd.slice(4));
      const startYear = Number(column.PeriodBegin.slice(0, 4)),
        startMonth = Number(column.PeriodBegin.slice(4));
      const months = (endYear - startYear) * 12 + endMonth - startMonth + 1;
      if (
        endMonth < 1 ||
        endMonth > 12 ||
        startMonth < 1 ||
        startMonth > 12 ||
        (kind === 'annual'
          ? months !== 12
          : months !== 3 &&
            !(startMonth === 1 && startYear === endYear && [6, 9, 12].includes(months)))
      )
        return [];
      const period = new Date(Date.UTC(endYear, endMonth, 0)).toISOString().slice(0, 10);
      if (!validDate(period) || period > today) return [];
      const value = (label) => {
        const row = metrics.find((metric) => normalized(metric.NameEn) === label);
        const number = row?.[`Value${column.ID}`];
        return typeof number === 'number' && Number.isFinite(number) ? number : null;
      };
      const revenue = value('net revenue'),
        profit = value('profit after tax');
      if (revenue === null && profit === null) return [];
      return [
        {
          period,
          kind: kind === 'quarterly' && months !== 3 ? 'ytd' : kind,
          periodStart: new Date(Date.UTC(startYear, startMonth - 1, 1)).toISOString().slice(0, 10),
          currency: 'VND',
          unit: 'billion VND',
          profitBasis:
            column.United === 'HN'
              ? 'consolidated'
              : column.United === 'RI'
                ? 'standalone'
                : 'unknown',
          cashFlowBasis: 'unknown',
          revenue: revenue === null ? null : revenue / 1e9,
          netIncome: profit === null ? null : profit / 1e9,
          operatingCashFlow: null,
          netMargin: null,
          debtEquity: null,
          sourceIds: [sourceId],
          originalUnit: 'VND',
          originalRevenue: revenue,
          originalNetIncome: profit,
          auditedStatus: column.AuditedStatus || '',
          originalPeriodBegin: column.PeriodBegin,
          originalPeriodEnd: column.PeriodEnd,
        },
      ];
    })
    .sort((a, b) => a.period.localeCompare(b.period));
}

export async function quarterlyHistory(session, ticker, firstPage, now = new Date()) {
  const rows = parseVietstockFinancials(firstPage, 'quarterly', 'D3', now);
  if (!rows.length) return rows;
  const key = (row) => `${row.kind}:${row.periodStart}:${row.period}:${row.profitBasis}`;
  const seen = new Set(rows.map(key));
  // Vietstock currently returns five columns regardless of requested PageSize.
  // Value1..Value5 restart on each page, so parse pages before combining records.
  for (let page = 2; page <= 3 && rows.length < 12; page++) {
    let data;
    try {
      data = await session.post('/data/financeinfo', {
        Code: ticker,
        Page: page,
        PageSize: 12,
        ReportTermType: 2,
        ReportType: 'BCTQ',
        Unit: 1,
      });
    } catch {
      break; // Preserve already retrieved records; no retry of a failed page.
    }
    const added = parseVietstockFinancials(data, 'quarterly', 'D3', now).filter(
      (row) => !seen.has(key(row)),
    );
    if (!added.length) break;
    for (const row of added) {
      seen.add(key(row));
      rows.push(row);
    }
  }
  return rows.sort((a, b) => a.period.localeCompare(b.period)).slice(-12);
}

export function parseVietstockReports(data, ticker, now = new Date()) {
  if (!Array.isArray(data)) return [];
  const today = now.toISOString().slice(0, 10);
  return data
    .flatMap((row) => {
      const url = publicUrl(row.Url),
        listedAt = vietstockDate(row.PublishDate);
      if (
        row.StockCode !== ticker ||
        !url ||
        !listedAt ||
        listedAt > today ||
        !row.Title ||
        !row.SourceName
      )
        return [];
      return [
        {
          firm: row.SourceName,
          title: row.Title,
          listedAt,
          url,
          reportId: Number.isInteger(row.ReportID) ? row.ReportID : null,
          summary: plain(row.Content),
          reportType: row.TypeName || '',
        },
      ];
    })
    .slice(0, 6);
}

export function parseVietstockNews(data, ticker) {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const url = publicUrl(row.URL, 'https://vietstock.vn'),
      publishedAt = vietstockDate(row.PublishTime);
    if (row.StockCode !== ticker || !url || !publishedAt || !row.Title) return [];
    return [
      {
        title: row.Title,
        url,
        publishedAt,
        publisher: 'vietstock.vn',
        summary: plain(row.Head),
        imageUrl: publicUrl(row.Icon, 'https://vietstock.vn'),
      },
    ];
  });
}

export function parseVietstockRatios(data, sourceId, now = new Date()) {
  if (!Array.isArray(data?.[0]) || !data?.[1]) return [];
  const columns = data[0]
    .filter((row) => /^\d{4}(0[1-9]|1[0-2])$/.test(row.PeriodEnd))
    .sort((a, b) => b.PeriodEnd.localeCompare(a.PeriodEnd));
  const column = columns[0];
  if (!column) return [];
  const period = new Date(
    Date.UTC(Number(column.PeriodEnd.slice(0, 4)), Number(column.PeriodEnd.slice(4)), 0),
  )
    .toISOString()
    .slice(0, 10);
  if (period > now.toISOString().slice(0, 10)) return [];
  const rows = Object.values(data[1]).flat();
  return [
    ['P/E', '×'],
    ['Trailing EPS', 'VND'],
    ['BVPS', 'VND'],
    ['ROS', '%'],
    ['ROEA', '%'],
    ['ROAA', '%'],
  ].flatMap(([label, unit]) => {
    const row = rows.find((item) => item.NameEn === label);
    const value = row?.[`Value${column.ID}`];
    return typeof value === 'number' && Number.isFinite(value)
      ? [{ label, originalLabel: row.Name, value, unit, period, sourceIds: [sourceId] }]
      : [];
  });
}

async function pdfText(url, { fetcher, signal }) {
  const timeout = AbortSignal.timeout(15000);
  const response = await fetcher(url, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (
    !response.ok ||
    (response.url && !publicUrl(response.url)) ||
    Number(response.headers.get('content-length')) > 8 * 1024 * 1024
  )
    return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8 * 1024 * 1024) {
      await reader.cancel();
      return '';
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.subarray(0, 5).toString() !== '%PDF-') return '';
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0,
  });
  const document = await loading.promise;
  const pages = [];
  try {
    for (let page = 1; page <= Math.min(document.numPages, 8); page++) {
      if (signal?.aborted) throw new Error('Cancelled');
      const text = await (await document.getPage(page)).getTextContent();
      pages.push(
        `Page ${page}\n` + text.items.map((item) => item.str + (item.hasEOL ? '\n' : ' ')).join(''),
      );
    }
  } finally {
    await loading.destroy();
  }
  return pages.join('\n\n').slice(0, 22000);
}

export async function retrieveVietstock({
  query,
  signal,
  fetcher = fetch,
  now = new Date(),
  includePdfs = true,
}) {
  const key = normalized(query);
  const previous = cache.get(key);
  if (fetcher === fetch && previous && now.getTime() - previous.time < 15 * 60000)
    return previous.result;
  const session = await vietstockSession({ query, signal, fetcher });
  const { company, html } = session;
  const sources = [
    { id: 'D1', title: `Vietstock · ${company.ticker} · company profile`, url: company.url },
  ];
  const claims = [
    {
      text: `Company: ${company.name}; ticker=${company.ticker}; exchange=${company.exchange}; country=Vietnam.`,
      sourceIds: ['D1'],
    },
  ];
  const requests = [
    [
      'annual',
      '/data/financeinfo',
      {
        Code: company.ticker,
        Page: 1,
        PageSize: 4,
        ReportTermType: 1,
        ReportType: 'BCTQ',
        Unit: 1,
      },
    ],
    [
      'quarterly',
      '/data/financeinfo',
      {
        Code: company.ticker,
        Page: 1,
        PageSize: 12,
        ReportTermType: 2,
        ReportType: 'BCTQ',
        Unit: 1,
      },
    ],
    [
      'reports',
      '/data/Overview_ReportByStockCode',
      { stockCode: company.ticker, page: 1, pageSize: 6 },
    ],
    [
      'events',
      '/data/EventsTypeData',
      {
        code: company.ticker,
        eventTypeID: 0,
        channelID: 0,
        catID: -1,
        page: 1,
        pageSize: 8,
        orderBy: 'Date1',
        orderDir: 'DESC',
      },
    ],
    ['documents', '/data/GetDocument', { code: company.ticker, page: 1, pageSize: 8 }],
  ];
  const settled = await Promise.allSettled(
    requests.map(([, path, params]) => session.post(path, params)),
  );
  const data = {},
    gaps = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') data[requests[index][0]] = result.value;
    else gaps.push(requests[index][0]);
  });
  const quarterly = await quarterlyHistory(session, company.ticker, data.quarterly, now);
  if (signal?.aborted) throw new Error('Vietstock retrieval cancelled');
  const financials = ['annual', 'quarterly'].flatMap((kind, index) => {
    const id = `D${index + 2}`;
    const rows =
      kind === 'quarterly'
        ? quarterly
        : parseVietstockFinancials(data[kind], kind, id, now).slice(-4);
    if (rows.length) {
      sources.push({
        id,
        title: `Vietstock · ${company.ticker} · ${kind} financial statements`,
        url: company.url + '?tab=tai-chinh',
      });
      for (const row of rows)
        claims.push({
          text: `Reported ${row.kind} financial statement (not forecast): period=${row.period}; ${JSON.stringify(row)}`,
          sourceIds: [id],
        });
    } else if (!gaps.includes(kind)) gaps.push(kind);
    return rows;
  });
  const reports = parseVietstockReports(data.reports, company.ticker, now);
  const ratios = parseVietstockRatios(data.quarterly, 'D3', now);
  if (ratios.length && !sources.some((source) => source.id === 'D3'))
    sources.push({
      id: 'D3',
      title: `Vietstock · ${company.ticker} · reported financial ratios`,
      url: company.url + '?tab=tai-chinh',
    });
  for (const ratio of ratios)
    claims.push({
      text: `Reported Vietstock ratio; period-end=${ratio.period}; ${JSON.stringify(ratio)}. Period-end ratio, not a live valuation or an automatically comparable metric.`,
      sourceIds: ['D3'],
    });
  for (const [index, report] of reports.entries()) {
    const id = `DB${index + 1}`;
    sources.push({
      id,
      title: `${report.firm} · ${report.title} · Vietstock listing`,
      url: report.url,
    });
    claims.push({
      text: `Brokerage listing: ${JSON.stringify(report)}. listedAt is the publisher listing date, NOT a verified original report date.`,
      sourceIds: [id],
    });
  }
  if (includePdfs) {
    await Promise.allSettled(
      reports.slice(0, 3).map(async (report, index) => {
        if (!report.reportId) return;
        const url = `${base}/downloadedoc/${report.reportId}`;
        const text = await pdfText(url, { fetcher, signal });
        if (!text) return;
        const id = `DP${index + 1}`;
        sources.push({ id, title: `${report.firm} · original report PDF`, url });
        claims.push({
          text: `Original PDF text for ${report.firm}, ${company.ticker}. Read the printed report date; listing date=${report.listedAt}. Extraction may flatten table columns; do not guess cells.\n${text}`,
          sourceIds: [id],
        });
        report.originalPdfUrl = url;
      }),
    );
    if (reports.slice(0, 3).some((report) => !report.originalPdfUrl)) gaps.push('originalReports');
  }
  const events = (Array.isArray(data.events?.[0]) ? data.events[0] : [])
    .filter((row) => row.Code === company.ticker)
    .flatMap((row) => {
      const url = publicUrl(row.FileUrl),
        exDate = vietstockDate(row.GDKHQDate),
        recordDate = vietstockDate(row.NDKCCDate);
      if (!url || !exDate || exDate > now.toISOString().slice(0, 10)) return [];
      return [
        { title: row.Title, event: row.Name, detail: plain(row.Note), exDate, recordDate, url },
      ];
    });
  for (const [index, event] of events.entries()) {
    const id = `DE${index + 1}`;
    sources.push({ id, title: `Vietstock · ${event.event} · company disclosure`, url: event.url });
    claims.push({
      text: `Corporate action, not report publication: ${JSON.stringify(event)}`,
      sourceIds: [id],
    });
  }
  const documents = (Array.isArray(data.documents) ? data.documents : []).flatMap((row) => {
    const url = publicUrl(row.Url),
      indexedAt = vietstockDate(row.LastUpdate);
    return url && indexedAt ? [{ title: row.Title, url, indexedAt }] : [];
  });
  let quote = null;
  try {
    const trade = JSON.parse(
      html.match(/var\s+_stockTrade\s*=\s*(\{[^;]+?\})\s*\|\|/)?.[1] || '{}',
    );
    const date = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(trade.TradingDate || '');
    const price =
      typeof trade.ClosePrice === 'string' && /^\d+(?:,\d{3})*(?:\.\d+)?$/.test(trade.ClosePrice)
        ? Number(trade.ClosePrice.replace(/,/g, ''))
        : null;
    const asOf = date ? `${date[3]}-${date[2]}-${date[1]}` : '';
    if (price > 0 && validDate(asOf) && asOf <= now.toISOString().slice(0, 10)) {
      quote = {
        price,
        currency: 'VND',
        asOf,
        changePercent: null,
        basis: 'Vietstock close; share adjustment basis not disclosed',
        sourceIds: ['D1'],
      };
      claims.push({
        text: `Dated stock quote: ${JSON.stringify(quote)}. Adjustment basis not disclosed; do not compare to broker targets.`,
        sourceIds: ['D1'],
      });
    }
  } catch {
    /* Unknown markup leaves quote unavailable. */
  }
  const result = {
    section: 'Direct Vietstock evidence',
    company,
    financials,
    ratios,
    quote,
    reports,
    events,
    documents,
    gaps,
    sources,
    claims,
    text: claims.map((claim) => `${claim.sourceIds.join(',')}: ${claim.text}`).join('\n\n'),
    retrievedAt: now.toISOString(),
  };
  if (fetcher === fetch) {
    if (cache.size >= 50) cache.delete(cache.keys().next().value);
    cache.set(key, { time: now.getTime(), result });
  }
  return result;
}

export async function retrieveVietstockNews({ query, signal, fetcher = fetch, now = new Date() }) {
  const key = normalized(query);
  const cached = newsCache.get(key);
  if (fetcher === fetch && cached && now.getTime() - cached.time < 15 * 60000)
    return cached.articles;
  const session = await vietstockSession({ query, signal, fetcher });
  const articles = [];
  // Two public listing pages only; this is supplementary coverage, not a complete archive.
  for (const page of [1, 2]) {
    const data = await session.post('/data/GetNews', {
      code: session.company.ticker,
      type: 1,
      page,
      pageSize: 30,
    });
    const rows = parseVietstockNews(data, session.company.ticker);
    articles.push(...rows);
    if (rows.length < 30) break;
  }
  if (fetcher === fetch) {
    if (newsCache.size >= 50) newsCache.delete(newsCache.keys().next().value);
    newsCache.set(key, { time: now.getTime(), articles });
  }
  return articles;
}
