import { useEffect, useRef, useState } from 'react';
import { requestError } from './requestError.js';
import { useSearchParams } from 'react-router-dom';
import { Search, ArrowUpRight, LoaderCircle, ImageOff } from 'lucide-react';
import { Card, Heading, Pill, Empty } from './components.jsx';
import { useLanguage } from './i18n.jsx';
import { newsWindows } from '../shared/news.js';
import { loadNewsState, saveNewsState } from './newsState.js';
import { newsDomains } from '../shared/newsSources.js';
import { companyAliases, resolveNewsCompany, matchesNewsQuery } from '../shared/companyAliases.js';

export default function News() {
  const { language, t, formatDate } = useLanguage();
  const [params] = useSearchParams();
  const [saved] = useState(loadNewsState);
  const [query, setQuery] = useState(params.get('q') || saved.query);
  const [days, setDays] = useState(saved.days);
  const [result, setResult] = useState(saved.result);
  const lastResult = useRef(saved.result);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searchRequest, setSearchRequest] = useState(null);
  const visibleResult =
    result?.language === language && resolveNewsCompany(result.query)
      ? {
          ...result,
          articles: result.articles.filter((article) =>
            matchesNewsQuery({ title: article.title, content: article.summary }, result.query),
          ),
        }
      : null;
  useEffect(() => {
    if (result) lastResult.current = result;
    saveNewsState({ query, days, result: lastResult.current });
  }, [query, days, result]);
  useEffect(() => {
    const input =
      searchRequest ||
      (lastResult.current && lastResult.current.language !== language
        ? { query: lastResult.current.query, days: lastResult.current.days }
        : null);
    if (!input) return;
    const request = new AbortController();
    const timeout = setTimeout(() => request.abort('timeout'), 155000);
    setBusy(true);
    setError('');
    fetch('/api/news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, language }),
      signal: request.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!Array.isArray(data.articles))
          throw new Error('Google News returned an unexpected response. Please retry.');
        return data;
      })
      .then((data) => {
        if (!request.signal.aborted) setResult(data);
      })
      .catch((cause) => {
        if (!request.signal.aborted || request.signal.reason === 'timeout')
          setError(
            request.signal.aborted ? 'News search timed out. Please retry.' : requestError(cause),
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!request.signal.aborted || request.signal.reason === 'timeout') setBusy(false);
      });
    return () => {
      request.abort();
      clearTimeout(timeout);
    };
  }, [searchRequest, language]);
  function search(event) {
    event.preventDefault();
    if (!resolveNewsCompany(query)) {
      setError('Choose a supported Vietnamese company name or stock ticker.');
      return;
    }
    if (query.trim().length >= 2 && !busy) setSearchRequest({ query: query.trim(), days });
  }
  return (
    <>
      <Heading
        title={t('Find the story behind the movement')}
        subtitle={t('News about Vietnamese companies and stocks, searched with Google News.')}
      >
        <Pill>GOOGLE NEWS</Pill>
      </Heading>
      <Card>
        <form className="filter-row" onSubmit={search}>
          <label className="search-input">
            <Search size={18} />
            <input
              aria-label={t('News topic')}
              placeholder={t('Enter a Vietnamese company or stock, e.g. FPT, VNM…')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              minLength={2}
              maxLength={200}
              required
              list="news-companies"
              disabled={busy}
            />
          </label>
          <datalist id="news-companies">
            {Object.entries(companyAliases).map(([ticker, names]) => (
              <option key={ticker} value={ticker}>
                {names[0]}
              </option>
            ))}
          </datalist>
          <select
            aria-label={t('News publication window')}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            disabled={busy}
          >
            {newsWindows.map((window) => (
              <option key={window.days} value={window.days}>
                {t(window.label)}
              </option>
            ))}
          </select>
          <button className="button primary" disabled={busy || query.trim().length < 2}>
            {busy ? <LoaderCircle size={18} className="spin" /> : <Search size={18} />}{' '}
            {t(busy ? 'Searching…' : 'Search news')}
          </button>
        </form>
        <p className="small muted">
          {t(
            'Company or stock searches only. Choose a time window, then click Search news to apply it.',
          )}
        </p>
        <p className="small muted">
          {t(
            'Search selected Vietnamese publishers with Google News. Your language choice guides retrieval; article text stays original.',
          )}
        </p>
        <details className="small muted">
          <summary>
            {t('Allowed publishers')} ({newsDomains.length})
          </summary>
          <p>{newsDomains.join(' · ')}</p>
        </details>
        <p className="small muted">
          {t(
            'Newest first. Only articles with a date inside the selected window are shown. Search results may not include every published article.',
          )}
        </p>
      </Card>
      {error && (
        <div className="notice error" role="alert">
          {t(error)}
        </div>
      )}
      {busy && <Card role="status">{t('Searching news with Google News…')}</Card>}
      {visibleResult && (
        <Heading
          title={`${visibleResult.articles.length} ${t('articles')} · ${visibleResult.query}`}
          subtitle={`${formatDate(visibleResult.startDate)} – ${formatDate(visibleResult.endDate)} · ${t('Retrieved')} ${formatDate(visibleResult.retrievedAt)}`}
        />
      )}
      <div className="news-results stack">
        {visibleResult?.articles.map((article) => (
          <Card key={article.url} className="news-result">
            <NewsImage url={article.imageUrl} title={article.title} />
            <div className="news-copy">
              <div className="section-heading">
                <Pill>{article.publisher}</Pill>
                <small className="muted">{formatDate(article.publishedAt)}</small>
              </div>
              <h2>
                <a href={article.url} target="_blank" rel="noreferrer">
                  {article.title} <ArrowUpRight size={17} />
                </a>
              </h2>
              {article.summary && <p className="news-intel">{article.summary}</p>}
              <a className="text-button" href={article.url} target="_blank" rel="noreferrer">
                {t('Read original article')} <ArrowUpRight size={14} />
              </a>
            </div>
          </Card>
        ))}
      </div>
      {!busy && (!visibleResult || !visibleResult.articles.length) && (
        <Card>
          <Empty
            title={t(
              visibleResult ? 'No Vietnamese company news found' : 'Search a topic to begin',
            )}
          >
            {t(
              'Enter a Vietnamese company or stock above. Results are limited to the allowed publishers and selected dates.',
            )}
          </Empty>
        </Card>
      )}
    </>
  );
}

function NewsImage({ url, title }) {
  const { t } = useLanguage();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return url && !failed ? (
    <img
      className="news-photo"
      src={url}
      alt={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="news-photo news-photo-empty">
      <ImageOff size={28} />
      <span>{t('Image unavailable')}</span>
    </div>
  );
}
