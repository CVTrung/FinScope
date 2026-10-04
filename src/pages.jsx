import { useLanguage } from './i18n.jsx';
import { safeUrl } from '../shared/report.js';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock3, FileText, Check, Minus, LoaderCircle } from 'lucide-react';
import { Valuation } from './Valuation.jsx';
import { priceWindow, priceRanges } from './priceWindow.js';
import { reportView, financialFields } from './reportView.js';
import {
  Card,
  Heading,
  Pill,
  Sources,
  ResearchForm,
  LineChart,
  EvidenceStatus,
} from './components.jsx';

export function Home({ onResearch, busy, searchBlocked, history, onSelect, onClear }) {
  const { t, formatDate } = useLanguage();
  return (
    <>
      <section className="hero research-home">
        <Pill>{t('COMPANY RESEARCH')}</Pill>
        <h1>
          {t('Start with a company.')}
          <br />
          {t('See what the evidence supports.')}
        </h1>
        <p>{t('One report with sourced facts, research observations and clearly marked gaps.')}</p>
        <ResearchForm onResearch={onResearch} busy={busy} blocked={searchBlocked} />
        <p className="hero-note">
          {t(
            'Enter a company and exchange, for example FPT (HOSE). Research availability depends on public sources.',
          )}
        </p>
      </section>
      <Card className="news-entry">
        <div>
          <Pill>{t('INDEPENDENT NEWS')}</Pill>
          <h2>{t('Just looking for company news?')}</h2>
          <p className="muted">
            {t('Search Vietnamese companies and stocks without creating a research report.')}
          </p>
        </div>
        <Link className="button" to="/news">
          <FileText size={17} />
          {t('Open News')}
          <ArrowRight size={16} />
        </Link>
      </Card>
      {history.length > 0 && (
        <section>
          <Heading
            title={t('Saved research')}
            subtitle={t(
              'Stored in this browser. Open a previous report without researching again.',
            )}
          >
            <button className="text-button" onClick={onClear}>
              {t('Clear history')}
            </button>
          </Heading>
          <div className="history-list">
            {history.map((report) => (
              <button
                key={report.id}
                className="history-item"
                disabled={busy}
                onClick={() => onSelect(report)}
              >
                <span className="ticker-icon">
                  {(report.company.ticker || report.company.name).slice(0, 3)}
                </span>
                <span>
                  <strong>{report.company.name}</strong>
                  <small>
                    <Clock3 size={12} />
                    {formatDate(report.generatedAt)}
                  </small>
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        </section>
      )}
      <p className="small muted">
        {t(
          'Reports are dated research snapshots. Source links support the findings; they do not guarantee accuracy or complete coverage.',
        )}
      </p>
    </>
  );
}

export function CompanyReport({ report, onEvidence, onUpdateReport }) {
  const { t, formatNumber, formatDate } = useLanguage();
  const view = reportView(report);
  const [period, setPeriod] = useState(
    view.financials.some((row) => row.kind === 'annual')
      ? 'annual'
      : view.financials[0]?.kind || 'quarterly',
  );
  const rows = view.financials.filter((row) => row.kind === period);
  const growth = (report.growth || []).filter((row) => row.kind === period).slice(-2);
  const fields = financialFields.filter(([, key]) => rows.some((row) => Number.isFinite(row[key])));
  const availableSources = [
    ...new Map(
      report.sources.filter((source) => safeUrl(source.url)).map((source) => [source.url, source]),
    ).values(),
  ];
  return (
    <div className="stack company-report report-redesign">
      {report.researchLanguage && report.researchLanguage !== report.language && (
        <Card className="caution">
          <p>
            {t(
              'Research text remains in its original language. Start a new company search for the selected language.',
            )}
          </p>
          <Link className="text-button" to="/">
            {t('New company research')}
          </Link>
        </Card>
      )}
      <Card className="report-identity">
        {report.company.evidenceStatus === 'sources-only' && (
          <p className="small muted">{t('Sources provided; individual claims not verified')}</p>
        )}
        <div className="report-company-heading">
          <div className="company-monogram">
            {(report.company.ticker || report.company.name).slice(0, 3)}
          </div>
          <div>
            <p className="report-kicker">{t('Company report')}</p>
            <h1>{report.company.name}</h1>
            <p className="muted">
              {[report.company.ticker, report.company.exchange, report.company.sector]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        <div className="report-identity-body">
          <div>
            {view.profile ? (
              <details className="company-profile">
                <summary>{t('Company overview')}</summary>
                <p>
                  {report.company.description}{' '}
                  <Sources ids={report.company.sourceIds} report={report} />
                </p>
              </details>
            ) : (
              <p className="muted">{t('A sourced company description was not returned.')}</p>
            )}
          </div>
          <div className="report-quote">
            <small>{t('Dated stock price')}</small>
            <strong>
              {view.quote
                ? formatNumber(view.quote.price, ` ${view.quote.currency}`)
                : t('Not available')}
            </strong>
            {view.quote && (
              <small>
                {formatDate(view.quote.asOf)} <Sources ids={view.quote.sourceIds} report={report} />
              </small>
            )}
            <small className="muted">{t('Research snapshot · Not a live price')}</small>
          </div>
        </div>
      </Card>
      <div className="report-columns">
        <div className="stack report-main">
          <PriceHistory report={report} />
          {report.analysisStatus && (
            <AnalysisStatus report={report} onUpdateReport={onUpdateReport} />
          )}
          {report.quoteAlternatives?.length > 0 && (
            <details className="small">
              <summary>{t('Conflicting sourced prices')}</summary>
              <p>{t('Different sourced values are shown separately. No average is used.')}</p>
              {report.quoteAlternatives.map((quote, index) => (
                <p key={index}>
                  {formatNumber(quote.price, ` ${quote.currency}`)} · {quote.asOf}{' '}
                  <Sources ids={quote.sourceIds} report={report} />
                </p>
              ))}
            </details>
          )}
          {view.financials.length > 0 && (
            <Card className="teal">
              <Heading
                title={t('Reported growth')}
                subtitle={t('Year-on-year change calculated from matching reported periods.')}
              />
              <p className="small muted">
                {t(
                  period === 'annual'
                    ? 'Annual'
                    : period === 'quarterly'
                      ? 'Quarterly'
                      : 'Year to date',
                )}
              </p>
              {growth.length === 0 && (
                <p className="small muted">
                  {t(
                    'No matching prior-year figures are available for this period. Growth cannot be calculated.',
                  )}
                </p>
              )}
              <div className="grid two">
                {growth.map((row) => (
                  <div key={row.metric + row.period}>
                    <small>
                      {t(row.metric === 'revenue' ? 'Revenue' : 'Net income')} · {row.period}
                    </small>
                    <h3>{formatNumber(row.percent, '%')}</h3>
                    <small>
                      {t('Compared with')} {row.previousPeriod}{' '}
                      <Sources ids={row.sourceIds} report={report} />
                    </small>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {view.financials.length > 0 && (
            <Card>
              <Heading
                title={t('Financial statements')}
                subtitle={t(
                  'Only metrics with reported values are shown. Missing cells stay unavailable.',
                )}
              >
                <div className="segmented">
                  {['annual', 'quarterly', 'ytd']
                    .filter((kind) => view.financials.some((row) => row.kind === kind))
                    .map((kind) => (
                      <button
                        key={kind}
                        aria-pressed={period === kind}
                        className={period === kind ? 'active' : ''}
                        onClick={() => setPeriod(kind)}
                      >
                        {t(
                          kind === 'annual'
                            ? 'Annual'
                            : kind === 'quarterly'
                              ? 'Quarterly'
                              : 'Year to date',
                        )}
                      </button>
                    ))}
                </div>
              </Heading>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Metric / unit')}</th>
                      {rows.map((row, i) => (
                        <th key={i}>
                          {row.period}
                          {row.periodStart && (
                            <small>
                              {t('Period starts')}: {row.periodStart}
                            </small>
                          )}
                          <small>
                            {!row.unit
                              ? t('Unit not disclosed')
                              : row.unit.includes(row.currency)
                                ? row.unit
                                : `${row.unit} · ${row.currency}`}
                            {!row.currency && ` · ${t('Currency not disclosed')}`}
                            {' · '}
                            {t(
                              row.profitBasis === 'consolidated'
                                ? 'Consolidated'
                                : row.profitBasis === 'standalone'
                                  ? 'Standalone'
                                  : row.profitBasis === 'attributable'
                                    ? 'Attributable to parent shareholders'
                                    : 'Scope unknown',
                            )}
                          </small>
                          {row.preferredSource && <small>{t('Vietstock prioritized')}</small>}
                          <Sources ids={row.sourceIds} report={report} />
                          {row.operatingCashFlow !== null && (
                            <small>
                              {t('Cash flow scope')}:{' '}
                              {t(
                                row.cashFlowBasis === 'consolidated'
                                  ? 'Consolidated'
                                  : row.cashFlowBasis === 'standalone'
                                    ? 'Standalone'
                                    : 'Scope unknown',
                              )}
                            </small>
                          )}
                          <EvidenceStatus row={row} date={row.period} report={report} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map(([label, key, suffix]) => (
                      <tr key={key}>
                        <td>{t(label)}</td>
                        {rows.map((row, i) => (
                          <td key={i}>
                            {Number.isFinite(row[key]) ? (
                              formatNumber(row[key], suffix)
                            ) : (
                              <span className="muted">{t('Not available')}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {report.conflicts?.length > 0 && (
            <Card className="caution">
              <Heading
                title={t('Conflicting reported figures')}
                subtitle={t('Different sourced values are shown separately. No average is used.')}
              />
              {report.conflicts.map((conflict, index) => (
                <details key={index}>
                  <summary>
                    {conflict.period} ·{' '}
                    {t(
                      conflict.kind === 'annual'
                        ? 'Annual'
                        : conflict.kind === 'ytd'
                          ? 'Year to date'
                          : 'Quarterly',
                    )}{' '}
                    ·{' '}
                    {conflict.unit.includes(conflict.currency)
                      ? conflict.unit
                      : `${conflict.unit} ${conflict.currency}`}{' '}
                    ·{' '}
                    {t(
                      conflict.profitBasis === 'consolidated'
                        ? 'Consolidated'
                        : conflict.profitBasis === 'standalone'
                          ? 'Standalone'
                          : conflict.profitBasis === 'attributable'
                            ? 'Attributable to parent shareholders'
                            : 'Scope unknown',
                    )}
                  </summary>
                  {report.sources.some(
                    (source) =>
                      conflict.fields.some((field) =>
                        field.values.some((value) => value.sourceIds.includes(source.id)),
                      ) &&
                      /(^|\.)vietstock\.vn$/.test(
                        new URL(safeUrl(source.url) || 'https://invalid.invalid').hostname,
                      ),
                  ) && (
                    <p>
                      {t(
                        'Vietstock figures are prioritized in the financial table. Other figures remain here for comparison.',
                      )}
                    </p>
                  )}
                  <p>{t(conflict.note)}</p>
                  {conflict.fields.map((field) => (
                    <div key={field.metric}>
                      <strong>
                        {t(
                          financialFields.find(([, key]) => key === field.metric)?.[0] ||
                            field.metric,
                        )}
                      </strong>
                      {field.values.map((value, i) => (
                        <p key={i}>
                          {formatNumber(value.value)}{' '}
                          <Sources ids={value.sourceIds} report={report} />
                        </p>
                      ))}
                    </div>
                  ))}
                </details>
              ))}
            </Card>
          )}

          {report.research
            ?.filter((section) => section.evidenceStatus === 'sources-only')
            .map((section, index) => (
              <Card className="caution" key={'excerpt-' + index}>
                <Heading
                  title={t('Research excerpt')}
                  subtitle={t('Sources provided; individual claims not verified')}
                />
                <p className="small">
                  {t(
                    'This section includes source URLs without sentence-level citation mappings. Figures are not independently verified.',
                  )}
                </p>
                <details>
                  <summary>{t('Read sourced section')}</summary>
                  <div className="raw-research">{section.text}</div>
                </details>
                <Sources ids={section.sourceIds || []} report={report} />
              </Card>
            ))}

          {view.observations.length > 0 && (
            <Card>
              <Heading
                title={t('Research observations')}
                subtitle={t(
                  'AI interpretations of the cited evidence. Open a finding for its reasoning.',
                )}
              >
                <Pill tone="caution">{t('AI INTERPRETATION')}</Pill>
              </Heading>
              <div className="report-details">
                {view.observations.map((item, i) => (
                  <details key={i}>
                    <summary>{item.title}</summary>
                    <p>
                      {item.detail} <Sources ids={item.sourceIds} report={report} />
                    </p>
                    <EvidenceStatus row={item} report={report} />
                    {item.alternative && (
                      <p>
                        <strong>{t('Alternative explanation')}: </strong>
                        {item.alternative}
                      </p>
                    )}
                    {item.nextStep && (
                      <p>
                        <strong>{t('What to check next')}: </strong>
                        {item.nextStep}
                      </p>
                    )}
                  </details>
                ))}
              </div>
            </Card>
          )}
        </div>
        <aside className="stack report-sidebar" aria-label={t('Evidence and coverage')}>
          {report.metrics.length > 0 && (
            <Card className="subtle">
              <Heading
                title={t('Period-end ratios')}
                subtitle={t('Reported ratios; not live valuations.')}
              />
              {report.metrics.slice(0, 3).map((item, index) => (
                <p key={index}>
                  <strong>
                    {item.label}: {item.value}
                  </strong>
                  <br />
                  <small className="muted">
                    {item.period} <Sources ids={item.sourceIds} report={report} />
                  </small>
                </p>
              ))}
              {report.metrics.length > 3 && (
                <details>
                  <summary>{t('More ratios')}</summary>
                  {report.metrics.slice(3).map((item, index) => (
                    <p key={index}>
                      {item.label}: {item.value} · {item.period}{' '}
                      <Sources ids={item.sourceIds} report={report} />
                    </p>
                  ))}
                </details>
              )}
            </Card>
          )}
          <Card className="report-coverage">
            <Heading title={t('Evidence at a glance')} subtitle={t('What this research found')} />
            <div className="coverage-list" aria-label={t('Report coverage')}>
              {view.coverage
                .filter((item) => item.available)
                .map((item) => (
                  <div
                    key={item.label}
                    className={`coverage-item ${item.available ? 'available' : ''}`}
                  >
                    {item.available ? <Check size={15} /> : <Minus size={15} />}
                    <span>
                      {t(item.label)}
                      <small>
                        {t(item.available ? 'Available with sources' : 'Not available')}
                      </small>
                    </span>
                  </div>
                ))}
            </div>
            <p className="small muted">
              {t(
                'Available means the report contains usable source-linked data, not independently verified facts.',
              )}
            </p>
          </Card>
          {availableSources.length > 0 && (
            <Card className="report-sources">
              <details>
                <summary>{t('Sources')}</summary>
                <div className="stack">
                  {availableSources.map((source) => (
                    <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                      {source.title || new URL(source.url).hostname} ↗
                    </a>
                  ))}
                </div>
              </details>
            </Card>
          )}

          <Card className="report-news">
            <FileText size={20} />
            <h3>{t('Follow company news')}</h3>
            <p className="small muted">
              {t('News is searched separately and is not part of this snapshot.')}
            </p>
            <Link
              className="button"
              to={`/news?q=${encodeURIComponent(report.company.ticker || report.company.name)}`}
            >
              {t('Open News')}
              <ArrowRight size={15} />
            </Link>
          </Card>
        </aside>
      </div>
      {report.targets.length > 0 && <Valuation report={report} />}
    </div>
  );
}

function AnalysisStatus({ report, onUpdateReport }) {
  const { t } = useLanguage();
  const status = report.analysisStatus;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [expired, setExpired] = useState(status.state === 'expired');
  useEffect(() => {
    if (!(status.retryAfterSeconds > 0)) {
      setRemaining(0);
      return;
    }
    const deadline = status.retryAvailableAt
      ? new Date(status.retryAvailableAt).getTime()
      : Date.now() + status.retryAfterSeconds * 1000;
    const update = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [status]);
  async function retry() {
    if (busy || remaining > 0) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/research/${encodeURIComponent(report.id)}/analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: report.language }),
        signal: AbortSignal.timeout(165000),
      });
      const data = await response.json();
      if (response.status === 410) setExpired(true);
      if (!response.ok)
        throw new Error(data.error || 'Analysis could not be completed. Please try again.');
      onUpdateReport(data);
    } catch (cause) {
      setError(cause.message || 'Analysis could not be completed. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  if (status.state === 'ready')
    return report.analysis.observations.length ? null : (
      <p className="small muted">
        {t('No supported AI observations were returned. Sourced facts remain available.')}
      </p>
    );
  return (
    <Card className="caution" role="status">
      <h3>
        {t(
          report.workflow === 'grounded-research-v2'
            ? 'Grounded company research'
            : 'Optional Gemini analysis',
        )}
      </h3>
      <p>{t(status.message)}</p>
      {status.status === 429 && report.workflow !== 'grounded-research-v2' && (
        <p className="small">
          {t('Gemini has reached a request or quota limit. Please wait and try again.')}
        </p>
      )}
      {remaining > 0 && (
        <p className="small">
          {t('Try again in')}{' '}
          {remaining >= 3600
            ? `${Math.floor(remaining / 3600)} ${t('hours')} ${Math.ceil((remaining % 3600) / 60)} ${t('minutes')}`
            : remaining >= 60
              ? `${Math.ceil(remaining / 60)} ${t('minutes')}`
              : `${remaining} ${t('seconds')}`}
          .
        </p>
      )}
      {error && <p role="alert">{t(error)}</p>}
      {!expired && status.retryAllowed !== false && (
        <button className="button" disabled={busy || remaining > 0} onClick={retry}>
          {t(
            busy
              ? 'Analyzing…'
              : status.state === 'not-requested'
                ? 'Analyze in selected language'
                : report.workflow === 'grounded-research-v2'
                  ? 'Retry formatting'
                  : 'Retry analysis',
          )}
        </button>
      )}
      {(expired || status.retryAllowed === false) && (
        <Link className="button" to="/">
          {t('New company research')}
        </Link>
      )}
      <p className="small muted">
        {t(
          report.workflow === 'grounded-research-v2' && status.retryAllowed === false
            ? 'This search has used all three Gemini requests. Wait for quota availability, then start a new Home search.'
            : report.workflow === 'grounded-research-v2'
              ? 'Manual formatting retry uses cached evidence and counts toward the original three-request limit. No automatic retry is made.'
              : 'Analysis retry reuses cached evidence for 30 minutes and does not retrieve sources again.',
        )}
      </p>
    </Card>
  );
}

const priceCache = new Map();
function PriceHistory({ report }) {
  const { t, formatNumber, formatDate } = useLanguage();
  const key = `${report.company.exchange}:${report.company.ticker}`;
  const cached = priceCache.get(key);
  const [prices, setPrices] = useState(
    report.priceData || (cached && Date.now() - cached.savedAt < 900000 ? cached.data : null),
  );
  const [range, setRange] = useState('1Y');
  const [attempt, setAttempt] = useState(0);
  const supported =
    /^(HOSE|HSX|HNX|UPCOM)$/i.test(report.company.exchange) &&
    /^[a-z0-9]{2,10}$/i.test(report.company.ticker);
  const [busy, setBusy] = useState(supported && !prices);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!supported) return;
    if (attempt === 0 && report.priceData) {
      setPrices(report.priceData);
      setBusy(false);
      return;
    }
    const existing = priceCache.get(key);
    if (attempt === 0 && existing && Date.now() - existing.savedAt < 900000) {
      setPrices(existing.data);
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), 60000);
    setBusy(true);
    setError('');
    fetch(
      '/api/prices?' +
        new URLSearchParams({ ticker: report.company.ticker, exchange: report.company.exchange }),
      { signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!Array.isArray(data.points) || !Array.isArray(data.sources))
          throw new Error('Price history is currently unavailable.');
        return data;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setPrices(data);
          priceCache.set(key, { data, savedAt: Date.now() });
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted || controller.signal.reason === 'timeout')
          setError(
            controller.signal.reason === 'timeout'
              ? 'Price history is currently unavailable.'
              : cause.message,
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!controller.signal.aborted || controller.signal.reason === 'timeout') setBusy(false);
      });
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt, key, supported, report.company.ticker, report.company.exchange, report.priceData]);
  const points = priceWindow(prices?.points || [], range);
  const latest = points.at(-1);
  const change = prices?.windowStats?.[range]?.changePercent ?? null;
  return (
    <Card className="report-price-card">
      <Heading title={t('Price history')} subtitle={t('Vietstock · Daily closing prices · VND')}>
        <div className="segmented price-range" aria-label={t('Price history range')}>
          {priceRanges.map((value) => (
            <button
              key={value}
              aria-pressed={range === value}
              className={range === value ? 'active' : ''}
              onClick={() => setRange(value)}
            >
              {t(value)}
            </button>
          ))}
        </div>
      </Heading>
      {!supported ? (
        <div className="price-state">
          <p>
            {t(
              'Price history is available only for supported Vietnamese listings with a ticker and exchange.',
            )}
          </p>
        </div>
      ) : busy ? (
        <div className="price-state" role="status">
          <LoaderCircle size={24} className="spin" />
          <p>{t('Loading historical prices from Vietstock…')}</p>
        </div>
      ) : error ? (
        <div className="price-state" role="alert">
          <p>{t('Price history is currently unavailable.')}</p>
          <p className="small muted">{t(error)}</p>
          <button className="button" onClick={() => setAttempt((value) => value + 1)}>
            {t('Retry prices')}
          </button>
        </div>
      ) : (
        <>
          {latest && (
            <div className="price-summary">
              <div>
                <small className="muted">{t('Latest closing price')}</small>
                <strong>{formatNumber(latest.close, ' VND')}</strong>
                <small className="muted">{formatDate(latest.date)}</small>
              </div>
              {change !== null && (
                <div className={change < 0 ? 'negative' : 'positive'}>
                  <strong>
                    {change > 0 ? '+' : ''}
                    {formatNumber(change, '%')}
                  </strong>
                  <small>{t('Change in selected period')}</small>
                </div>
              )}
              <span className="small muted">
                {points.length} {t('trading observations')}
              </span>
            </div>
          )}
          <LineChart points={points} report={prices} suffix=" VND" />
          {points.length > 0 && (
            <p className="small muted">
              {formatDate(points[0].date)} – {formatDate(latest.date)}
            </p>
          )}
        </>
      )}
      <p className="small muted chart-footnote">
        {t(
          'Ranges use available trading days. Vietstock does not disclose adjustment basis; this chart is not used for target comparisons.',
        )}
      </p>
    </Card>
  );
}
