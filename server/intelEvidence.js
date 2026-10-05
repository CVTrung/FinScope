import { retrieveVietstockNews } from './vietstock.js';
import { intelRequest } from '../shared/companyIntel.js';
import { matchesNewsQuery } from '../shared/companyAliases.js';
import { safeUrl } from '../shared/report.js';

function publisherUrl(value) {
  const url = safeUrl(value);
  return url && /(^|\.)vietstock\.vn$/i.test(new URL(url).hostname) ? url : '';
}

export function articleParagraphs(html) {
  const body = String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const article = body.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  // Vietstock's pBody/pLead classes identify original article paragraphs. Never scrape every page paragraph.
  const paragraphs = article
    ? [...article.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    : [
        ...body.matchAll(
          /<p\b[^>]*class=["'][^"']*\b(?:pBody|pLead)\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi,
        ),
      ];
  return paragraphs
    .map((match) =>
      match[1]
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;|&#160;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => {
          const value = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
          return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
        })
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(
      (paragraph) =>
        paragraph.length >= 80 &&
        !/chính sách quyền riêng tư|quý khách hàng|đăng nhập|đăng ký tài khoản/i.test(paragraph),
    )
    .slice(0, 35)
    .join('\n')
    .slice(0, 16000);
}

// Supporting public publisher evidence only; no Gemini or SerpApi calls and no dependency on News UI.
export async function retrieveIntelUpdates({
  query,
  company,
  now,
  signal,
  listing = retrieveVietstockNews,
  fetcher = fetch,
}) {
  const range = intelRequest({ query, company, now }).analysis_request;
  const rows = await listing({ query: company?.ticker || query, now, signal });
  const selected = [
    ...new Map(
      rows
        .filter(
          (row) =>
            publisherUrl(row.url) &&
            row.publishedAt >= range.start_date &&
            row.publishedAt <= range.end_date &&
            matchesNewsQuery(
              { title: row.title, content: row.summary || '' },
              company?.ticker || query,
            ),
        )
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .map((row) => [row.url, row]),
    ).values(),
  ].slice(0, 10);
  const articles = [];
  for (let index = 0; index < selected.length; index += 4) {
    articles.push(
      ...(await Promise.all(
        selected.slice(index, index + 4).map(async (row) => {
          let content = '',
            contentStatus = 'snippet_only';
          try {
            const response = await fetcher(row.url, {
              signal: signal
                ? AbortSignal.any([signal, AbortSignal.timeout(6000)])
                : AbortSignal.timeout(6000),
            });
            if (response.ok && (!response.url || publisherUrl(response.url))) {
              const paragraphs = articleParagraphs(await response.text());
              if (
                matchesNewsQuery(
                  { title: row.title, content: paragraphs },
                  company?.ticker || query,
                )
              ) {
                content = paragraphs;
                if (content) contentStatus = 'publisher_paragraphs';
              }
            }
          } catch {
            /* Keep the dated publisher listing when the article body is unavailable. */
          }
          return { ...row, content: content || row.summary || '', contentStatus };
        }),
      )),
    );
  }
  const sources = articles.map((row, index) => ({
    id: `IU${index + 1}`,
    title: row.title,
    url: row.url,
    publishedAt: row.publishedAt,
  }));
  const claims = articles.map((row, index) => ({
    text: `Publisher listing publication date=${row.publishedAt}; title=${row.title}; evidence access=${row.contentStatus}.\n${row.content}`,
    sourceIds: [sources[index].id],
  }));
  return {
    section: 'Dated Vietstock company updates',
    articles,
    sources,
    claims,
    text: claims.map((claim) => claim.text).join('\n\n'),
  };
}
