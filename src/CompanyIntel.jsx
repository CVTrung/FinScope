import { useState } from 'react';
import { useLanguage } from './i18n.jsx';
import { Card, Heading, Pill } from './components.jsx';
import { safeUrl } from '../shared/report.js';

const labels = {
  positive: 'Positive',
  negative: 'Negative',
  neutral: 'Neutral',
  mixed: 'Mixed',
  short_term: 'Short term',
  medium_term: 'Medium term',
  long_term: 'Long term',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  company: 'Company',
  sector: 'Sector',
  valuation: 'Valuation',
  macro: 'Macro',
  market: 'Market',
};

function SourceList({ sources }) {
  const { t } = useLanguage();
  const rows = sources.filter((row) => safeUrl(row.source_url));
  if (!rows.length) return null;
  return (
    <details className="intel-sources">
      <summary>
        {t('Sources')} ({rows.length})
      </summary>
      <ul>
        {rows.map((row) => (
          <li key={row.source_url}>
            <a href={safeUrl(row.source_url)} target="_blank" rel="noreferrer">
              {row.source_name} ↗
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Tags({ row }) {
  const { t } = useLanguage();
  if (row.assessmentAvailable === false) return null;
  return (
    <div className="intel-tags">
      <Pill>{t(labels[row.sentiment] || 'Neutral')}</Pill>
      <span>{t(labels[row.impact_horizon || row.horizon])}</span>
      <span>
        {t('Model confidence')}: {t(labels[row.confidence])}
      </span>
    </div>
  );
}

export default function CompanyIntel({ data }) {
  const { t, formatDate } = useLanguage();
  const [tab, setTab] = useState(data?.articles?.length ? 'articles' : 'insights');
  if (!data) return null;
  const tabs = [
    ['articles', 'Company updates'],
    ['insights', 'Insights & watch points'],
  ];
  return (
    <Card className="company-intel">
      <Heading
        title="Company intelligence"
        subtitle="Organized from gathered evidence · No additional Search"
      />
      <div className="intel-heading-meta">
        <span>
          {formatDate(data.metadata.start_date)} — {formatDate(data.metadata.end_date)}
        </span>
        <span>{data.model}</span>
      </div>
      <p className="small muted">{t('Sources provided; individual claims not verified')}</p>
      <div className="tabs" role="tablist" aria-label={t('Company intelligence')}>
        {tabs.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="stack intel-content">
        {tab === 'articles' &&
          (data.articles.length ? (
            data.articles.map((row, index) => (
              <article className="intel-entry" key={`${row.source_url}:${index}`}>
                <p className="small muted">
                  {formatDate(row.published_at)} · {row.tickers.join(' · ')}
                </p>
                <h3>{row.title}</h3>
                <p>{row.summary}</p>
                <Tags row={row} />
                {(row.facts.length > 0 || row.analysis) && (
                  <details>
                    <summary>{t('Facts & interpretation')}</summary>
                    {row.facts.length > 0 && (
                      <>
                        <h4>{t('Reported facts')}</h4>
                        <ul>
                          {row.facts.map((fact, i) => (
                            <li key={i}>{fact}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {row.analysis && (
                      <>
                        <h4>{t('Model interpretation')}</h4>
                        <p>{row.analysis}</p>
                      </>
                    )}
                    {row.event_date && (
                      <p>
                        {t('Event date')}: {formatDate(row.event_date)}
                      </p>
                    )}
                  </details>
                )}
                <SourceList sources={[row]} />
              </article>
            ))
          ) : (
            <p className="muted">{t('No dated company updates in the gathered evidence.')}</p>
          ))}
        {tab === 'insights' && (
          <>
            {data.insights.map((row, index) => (
              <article className="intel-entry" key={index}>
                <p className="report-kicker">{t(labels[row.category])}</p>
                <h3>{row.subject}</h3>
                <p>{row.analysis}</p>
                <Tags row={row} />
                {row.risks.length > 0 && (
                  <details>
                    <summary>{t('Factors to monitor')}</summary>
                    <ul>
                      {row.risks.map((risk, i) => (
                        <li key={i}>{risk}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <SourceList sources={row.evidence_sources} />
              </article>
            ))}
            {data.watchlist.map((row, index) => (
              <article className="intel-entry" key={`watch-${index}`}>
                <h3>
                  {row.ticker} · {t('Watch points')}
                </h3>
                <p>{row.reason}</p>
                <Tags row={row} />
                {row.valuation_view && <p>{row.valuation_view}</p>}
                {row.catalysts.length > 0 && (
                  <>
                    <h4>{t('Catalysts')}</h4>
                    <ul>
                      {row.catalysts.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </>
                )}
                {row.risks.length > 0 && (
                  <>
                    <h4>{t('Factors to monitor')}</h4>
                    <ul>
                      {row.risks.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </>
                )}
                <SourceList sources={row.evidence_sources} />
              </article>
            ))}
            {!data.insights.length && !data.watchlist.length && (
              <p className="muted">{t('No sourced insights in the gathered evidence.')}</p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
