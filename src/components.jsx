import { useLanguage } from './i18n.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Search, X, Download } from 'lucide-react';
import { safeUrl, validDate } from '../shared/report.js';
import { freshness } from '../shared/evidence.js';
import { reportCsv } from '../shared/reportCsv.js';
import { companyAliases } from '../shared/companyAliases.js';

export function EvidenceStatus({ row, date, report }) {
  const { t } = useLanguage();
  const label =
    row.evidenceStatus === 'sources-only'
      ? 'Sources provided; individual claims not verified'
      : row.evidenceStatus === 'direct'
        ? 'Retrieved from source'
        : 'Citation linked; not independently verified';
  return (
    <div className="evidence-status small muted">
      <span>{t(label)}</span>
      {date !== undefined && <span> · {t(freshness(date, report.generatedAt))}</span>}
      {row.conflictGroup && <span> · {t('Conflicting sourced figures')}</span>}
    </div>
  );
}
export function Heading({ title, subtitle, children }) {
  const { t } = useLanguage();
  return (
    <div className="section-heading">
      <div>
        <h2>{t(title)}</h2>
        {subtitle && <p className="muted small">{t(subtitle)}</p>}
      </div>
      {children}
    </div>
  );
}
export function Card({ children, className = '', ...props }) {
  return (
    <section className={`card ${className}`} {...props}>
      {children}
    </section>
  );
}
export function Pill({ children, tone = '' }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
export function Empty({ title = 'No evidence available', children }) {
  const { t } = useLanguage();
  return (
    <div className="empty">
      <span className="empty-mark">◎</span>
      <h3>{t(title)}</h3>
      <p className="muted">
        {children || t('Gemini did not find enough supporting information for this section.')}
      </p>
    </div>
  );
}
export function Sources({ ids = [], report }) {
  const sources = ids
    .map((id) => report.sources.find((source) => source.id === id))
    .filter(Boolean);
  return (
    <span className="source-links">
      {sources.map((source) => (
        <a
          key={source.id}
          href={safeUrl(source.url) || undefined}
          target="_blank"
          rel="noreferrer"
          title={source.title}
        >
          [{source.id}] <ArrowUpRight size={11} />
        </a>
      ))}
    </span>
  );
}
export function ResearchForm({ onResearch, busy, blocked = false, initial = '', compact = false }) {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState(initial);
  const suggestionId = useId();
  const inputRef = useRef(null);
  useEffect(() => setQuery(initial), [initial]);
  return (
    <div className="research-search">
      <form
        className={`research-form ${compact ? 'compact' : ''}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !blocked && query.trim().length >= 2) onResearch(query.trim(), language);
        }}
      >
        <label className="search-input">
          <Search size={19} />
          <input
            aria-label={t('Company or stock ticker')}
            value={query}
            ref={inputRef}
            list={suggestionId}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Type a company or ticker, e.g. FPT, HPG, Vinamilk…')}
            minLength={2}
            maxLength={200}
            required
            disabled={busy}
          />
        </label>
        <datalist id={suggestionId}>
          {Object.entries(companyAliases).map(([ticker, names]) => (
            <option key={ticker} value={ticker} label={names.join(' · ')} />
          ))}
        </datalist>
        <button
          className="button primary"
          disabled={busy || blocked || query.trim().length < 2}
          type="submit"
        >
          {busy ? t('Researching…') : blocked ? t('Please wait to retry') : t('Research company')}{' '}
          {!busy && !blocked && <span>→</span>}
        </button>
      </form>
      {!compact && (
        <div className="company-suggestions" aria-label={t('Company suggestions')}>
          <span>{t('Suggestions')}:</span>
          {['FPT', 'HPG', 'VNM', 'VCB', 'MWG', 'VIC'].map((ticker) => (
            <button
              key={ticker}
              type="button"
              disabled={busy}
              title={companyAliases[ticker][0]}
              onClick={() => {
                setQuery(ticker);
                inputRef.current?.focus();
              }}
            >
              <strong>{ticker}</strong>
              <span>{companyAliases[ticker][0]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function CompanyBanner({ report, dark = false }) {
  const { t, formatNumber, formatDate } = useLanguage();
  const { company, quote } = report;
  return (
    <Card className={`company-banner ${dark ? 'navy' : 'teal'}`}>
      <div className="section-heading">
        <div>
          <h1>{company.name}</h1>
          <p>{[company.exchange, company.ticker, company.sector].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="quote">
          <strong>{formatNumber(quote.price, quote.currency ? ` ${quote.currency}` : '')}</strong>
          {quote.changePercent !== null && (
            <span className={quote.changePercent < 0 ? 'negative' : 'positive'}>
              {quote.changePercent > 0 ? '+' : ''}
              {formatNumber(quote.changePercent, '%')}
            </span>
          )}
          <small>
            {' '}
            {t('As of')} {formatDate(quote.asOf)} <Sources ids={quote.sourceIds} report={report} />
          </small>
        </div>
      </div>
      <p>
        {company.description} <Sources ids={company.sourceIds} report={report} />
      </p>
      <small>
        {' '}
        {t('Search-sourced snapshot ·')} {quote.basis || t('Share basis not confirmed')}{' '}
        {t('· Not a live market feed')}{' '}
      </small>
    </Card>
  );
}
export function Modal({ title, children, onClose }) {
  const { t } = useLanguage();
  const ref = useRef();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="dialog-content">
        <Heading title={t(title)}>
          <button className="icon-button" onClick={onClose} aria-label={t('Close dialog')}>
            <X size={20} />
          </button>
        </Heading>
        {children}
      </div>
    </dialog>
  );
}
export function Evidence({ report }) {
  const { t, formatDate } = useLanguage();
  return (
    <div className="stack">
      <p>
        {' '}
        {t(
          'Gemini researches company facts and analysis with Google Search. A broker-report search is optional; structured formatting combines the evidence. At most three Gemini requests are used. Code checks sources, dates, units and figures. Vietstock supports the evidence and chart. Source links are not an independent audit.',
        )}{' '}
      </p>
      <div className="grid two">
        <Card className="subtle">
          <h3>{t('Research snapshot')}</h3>
          <p>{formatDate(report.generatedAt)}</p>
          <p className="small">
            {t('Model:')} {report.model}
          </p>
          <p className="small">
            {t('Query:')} {report.query}
          </p>
          {report.requestUsage && (
            <p className="small">
              {t('Gemini requests:')} {report.requestUsage.requests} / {report.requestUsage.limit}
            </p>
          )}
        </Card>
        <Card className="caution">
          <h3>{t('Coverage & limitations')}</h3>
          <ul>
            {report.limitations.map((item, i) => (
              <li key={i}>{t(item)}</li>
            ))}
          </ul>
        </Card>
      </div>
      {report.requestUsage?.stages?.length > 0 && (
        <details>
          <summary>{t('Model request history')}</summary>
          {report.requestUsage.stages.map((attempt, i) => (
            <p className="small" key={i}>
              {i + 1}. {attempt.stage} · {attempt.model || report.model} ·{' '}
              {t(attempt.state || 'received')}
              {attempt.status ? ` (${attempt.status})` : ''}
            </p>
          ))}
        </details>
      )}
      <h3>
        {t('Source library ·')} {report.sources.length}
      </h3>
      <div className="source-library">
        {report.sources.map((source) => (
          <a
            key={source.id}
            href={safeUrl(source.url) || undefined}
            target="_blank"
            rel="noreferrer"
          >
            <Pill>{source.id}</Pill>
            <span>{source.title}</span>
            <ArrowUpRight size={16} />
          </a>
        ))}
      </div>
      {report.research.map((section, i) => (
        <details key={i}>
          <summary>
            {t(section.section)}{' '}
            {t(
              report.workflow === 'direct-analysis-v1'
                ? '· original evidence'
                : '· search queries and original evidence',
            )}
          </summary>
          <EvidenceStatus row={section} report={report} />
          <p className="small muted">{section.queries.join(' · ')}</p>
          <div className="raw-research">{section.text}</div>
          {section.claims
            .filter((claim) => claim.sourceIds.length)
            .map((claim, j) => (
              <p className="small" key={j}>
                {claim.text} <Sources ids={claim.sourceIds} report={report} />
              </p>
            ))}
        </details>
      ))}
    </div>
  );
}
export function SearchSuggestions({ report }) {
  const { t } = useLanguage();
  const suggestions = report.research.filter((section) => section.searchSuggestions);
  if (!suggestions.length) return null;
  return (
    <details className="search-suggestions">
      <summary>{t('Related searches from Google')}</summary>
      {suggestions.map((section, i) => (
        <iframe
          key={i}
          title={`Google Search suggestions — ${section.section}`}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={section.searchSuggestions}
        />
      ))}
    </details>
  );
}
export function ExportButton({ report }) {
  const { t, language } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download(format) {
    setError('');
    setBusy(true);
    try {
      let blob;
      if (format === 'xlsx') {
        const response = await fetch('/api/export-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report, language }),
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) throw new Error('Excel export failed. Please try again.');
        blob = await response.blob();
      } else blob = new Blob([reportCsv(report, language)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `finscope-${(report.company.ticker || 'report').replace(/[^a-z0-9-]/gi, '')}-${report.generatedAt.slice(0, 10)}.${format}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('Excel export failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="export-options">
      <button className="button" disabled={busy} onClick={() => download('csv')}>
        <Download size={15} /> CSV
      </button>
      <button className="button" disabled={busy} onClick={() => download('xlsx')}>
        <Download size={15} /> {busy ? t('Exporting…') : 'Excel (.xlsx)'}
      </button>
      {error && (
        <span className="small" role="alert">
          {t(error)}
        </span>
      )}
    </div>
  );
}

export function LineChart({ points, valueKey = 'close', label = 'Price', suffix = '', report }) {
  const { t, language, formatNumber } = useLanguage();
  const [active, setActive] = useState(null);
  if (points.length < 2)
    return (
      <Empty title={t('Not enough comparable observations')}>
        {' '}
        {t(
          'At least two sourced observations are needed for a chart. Missing history is never estimated.',
        )}{' '}
      </Empty>
    );
  const width = 1000,
    height = 230,
    left = 65,
    right = 20,
    top = 20,
    bottom = 35;
  const values = points.map((point) => point[valueKey]);
  const min = Math.min(...values),
    max = Math.max(...values),
    padding = (max - min) * 0.18 || Math.abs(max) * 0.05 || 1;
  const low = min - padding,
    high = max + padding;
  const dated = points.every((point) => validDate(point.date));
  const dates = dated ? points.map((point) => new Date(point.date).getTime()) : [];
  const x = (index) =>
    left +
    (dated && dates.at(-1) !== dates[0]
      ? (dates[index] - dates[0]) / (dates.at(-1) - dates[0])
      : index / (points.length - 1)) *
      (width - left - right);
  const y = (value) => top + ((high - value) / (high - low)) * (height - top - bottom);
  const line = points.map((point, i) => `${x(i)},${y(point[valueKey])}`).join(' ');
  const selected = points[Math.min(active ?? points.length - 1, points.length - 1)];
  return (
    <div className="chart">
      <div className="chart-readout">
        <strong>{selected.date || selected.period}</strong>
        <span>
          {t(label)}: {formatNumber(selected[valueKey], suffix)}
        </span>
        {report && <Sources ids={selected.sourceIds} report={report} />}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${t(label)} · ${points.length} ${t('sourced observations')}`}
      >
        {[0, 1, 2, 3].map((i) => {
          const value = low + ((high - low) * i) / 3;
          return (
            <g key={i}>
              <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#d8e2e0" />
              <text x={left - 10} y={y(value) + 4} textAnchor="end">
                {new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-GB', {
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(value)}
              </text>
            </g>
          );
        })}
        <polygon
          points={`${left},${height - bottom} ${line} ${x(points.length - 1)},${height - bottom}`}
          fill="#dff4f0"
        />
        <polyline points={line} fill="none" stroke="#0f766e" strokeWidth="2.5" />
        {points.map((point, i) => (
          <g key={i}>
            <circle
              cx={x(i)}
              cy={y(point[valueKey])}
              r={active === i ? 6 : 3.5}
              fill="white"
              stroke="#0f766e"
              strokeWidth="2"
            />
            <circle
              cx={x(i)}
              cy={y(point[valueKey])}
              r="12"
              fill="transparent"
              tabIndex="0"
              role="button"
              aria-label={`${point.date || point.period}: ${formatNumber(point[valueKey], suffix)}`}
              onFocus={() => setActive(i)}
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(i)}
            >
              <title>
                {point.date || point.period}: {formatNumber(point[valueKey], suffix)}
              </title>
            </circle>
          </g>
        ))}
        <text x={left} y={height - 8}>
          {points[0].date || points[0].period}
        </text>
        <text x={width - right} y={height - 8} textAnchor="end">
          {points.at(-1).date || points.at(-1).period}
        </text>
      </svg>
      <details>
        <summary>{t('View chart data')}</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Period')}</th>
                <th>{t(label)}</th>
                <th>{t('Sources')}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point, i) => (
                <tr key={i}>
                  <td>{point.date || point.period}</td>
                  <td>{formatNumber(point[valueKey], suffix)}</td>
                  <td>{report && <Sources ids={point.sourceIds} report={report} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
