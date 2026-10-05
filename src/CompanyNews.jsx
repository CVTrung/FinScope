import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ArrowRight, LoaderCircle, RefreshCw } from 'lucide-react';
import { Card } from './components.jsx';
import { useLanguage } from './i18n.jsx';
import { safeUrl } from '../shared/report.js';
import { resolveNewsCompany } from '../shared/companyAliases.js';
import { recentCompanyNews, previewArticles } from './companyNews.js';

function Article({ article }) {
  const { t, formatDate } = useLanguage();
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article className="company-news-article">
      <div className="company-news-headline">
        {!imageFailed && safeUrl(article.imageUrl) && (
          <img
            src={safeUrl(article.imageUrl)}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
        <div>
          <small className="muted">
            {article.publisher} · {formatDate(article.publishedAt)}
          </small>
          <h4>
            <a href={safeUrl(article.url)} target="_blank" rel="noreferrer">
              {article.title} ↗
            </a>
          </h4>
        </div>
      </div>
      {article.summary && (
        <details>
          <summary>{t('Article details')}</summary>
          <p className="small">{article.summary}</p>
        </details>
      )}
    </article>
  );
}

export default function CompanyNews({ report }) {
  const { language, t, formatDate } = useLanguage();
  const query = report.query || report.company.ticker || report.company.name;
  const [state, setState] = useState({ busy: true, data: null, error: '' });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    if (!resolveNewsCompany(query)) {
      setState({
        busy: false,
        data: null,
        error: 'Choose a supported Vietnamese company name or stock ticker.',
      });
      return;
    }
    setState({ busy: true, data: null, error: '' });
    recentCompanyNews(query, language, { refresh: refresh > 0 })
      .then((data) => {
        if (active) setState({ busy: false, data, error: '' });
      })
      .catch((error) => {
        if (active) setState({ busy: false, data: null, error: error.message });
      });
    return () => {
      active = false;
    };
  }, [query, language, refresh]);
  const articles = state.data ? previewArticles(state.data, query) : [];
  return (
    <Card className="report-news">
      <FileText size={20} />
      <h3>{t('Follow company news')}</h3>
      <p className="small muted">
        {query} · {t('Last 30 days')} · Google News
      </p>
      {state.busy && (
        <p className="small" role="status">
          <LoaderCircle size={14} className="spin" /> {t('Searching news with Google News…')}
        </p>
      )}
      {state.error && (
        <p className="small" role="alert">
          {t(state.error)}
        </p>
      )}
      {!state.busy && !state.error && !articles.length && (
        <p className="small muted">{t('No recent company news found.')}</p>
      )}
      {articles.slice(0, 3).map((article) => (
        <Article key={article.url} article={article} />
      ))}
      {articles.length > 3 && (
        <details className="company-news-more">
          <summary>
            {t('More company news')} ({articles.length - 3})
          </summary>
          {articles.slice(3).map((article) => (
            <Article key={article.url} article={article} />
          ))}
        </details>
      )}
      {state.data?.retrievedAt && (
        <small className="muted">
          {t('Retrieved')} {formatDate(state.data.retrievedAt)}
        </small>
      )}
      <button
        className="text-button"
        disabled={state.busy}
        onClick={() => setRefresh((value) => value + 1)}
      >
        <RefreshCw size={14} /> {t(state.error ? 'Try again' : 'Refresh news')}
      </button>
      <Link className="button" to={`/news?q=${encodeURIComponent(query)}&search=1`}>
        {t('Open all news & filters')} <ArrowRight size={15} />
      </Link>
      <p className="small muted">
        {t('News is searched separately and is not part of this snapshot.')}
      </p>
    </Card>
  );
}
