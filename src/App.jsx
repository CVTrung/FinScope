import { useEffect, useRef, useState } from 'react';
import { requestError } from './requestError.js';
import { Link, NavLink, Route, Routes, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Check, LoaderCircle, ArrowUpRight } from 'lucide-react';
import { reportSchema, cleanReport } from '../shared/report.js';
import { Card, Modal, Evidence, ExportButton, SearchSuggestions } from './components.jsx';
import { Home, CompanyReport } from './pages.jsx';
import News from './News.jsx';
import { useLanguage } from './i18n.jsx';
import { useReportLanguage } from './useReportLanguage.js';
const storageKey = 'finscope-reports-v1';
function loadHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(data)
      ? data
          .filter(
            (report) =>
              reportSchema.safeParse(report).success &&
              typeof report.id === 'string' &&
              Array.isArray(report.sources) &&
              Array.isArray(report.research) &&
              report.generatedAt,
          )
          .slice(0, 5)
          .map((report) => ({
            ...report,
            ...cleanReport(report, report.sources, report.generatedAt),
          }))
      : [];
  } catch {
    return [];
  }
}
export default function App() {
  const { language, setLanguage, t, formatDate } = useLanguage();
  const [history, setHistory] = useState(loadHistory);
  const [report, setReport] = useState(null);
  const location = useLocation();
  const {
    displayed: displayReport,
    error: translationError,
    retry: retryTranslation,
  } = useReportLanguage(report, language, location.pathname === '/report');
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const [modal, setModal] = useState(null);
  const [geminiError, setGeminiError] = useState(null);
  const [groundingDiagnostics, setGroundingDiagnostics] = useState([]);
  const [errorStatus, setErrorStatus] = useState(null);
  const [retryRemaining, setRetryRemaining] = useState(0);
  const [lastRequest, setLastRequest] = useState(null);
  const [health, setHealth] = useState(null);
  const controller = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (errorStatus !== 429) {
      setRetryRemaining(0);
      return;
    }
    const seconds = Number(geminiError?.retryAfterSeconds) || 10;
    const deadline = Date.now() + seconds * 1000;
    const update = () => setRetryRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [errorStatus, geminiError]);
  useEffect(() => {
    fetch('/api/health')
      .then((response) => response.json())
      .then(setHealth)
      .catch(() =>
        setHealth({
          status: 'offline',
        }),
      );
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  async function research(query, reportLanguage = language) {
    if (busy || retryRemaining > 0) return;
    setLastRequest({ query, language: reportLanguage });
    setBusy(true);
    setError('');
    setGeminiError(null);
    setGroundingDiagnostics([]);
    setErrorStatus(null);
    setEvents([]);
    const requestController = new AbortController();
    controller.current = requestController;
    let finished = false;
    const timeout = setTimeout(() => requestController.abort('timeout'), 610000);
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/x-ndjson',
        },
        body: JSON.stringify({
          query,
          language: reportLanguage,
        }),
        signal: requestController.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        setGeminiError(data.gemini || null);
        setGroundingDiagnostics(data.diagnostics || []);
        setErrorStatus(response.status);
        throw new Error(data.error || 'Research failed. Please retry.');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      function handle(line) {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === 'error') {
          setGeminiError(event.gemini || null);
          setGroundingDiagnostics(event.diagnostics || []);
          setErrorStatus(event.status || event.gemini?.status || null);
          throw new Error(event.error);
        }
        if (event.type === 'progress') setEvents((previous) => [...previous, event]);
        if (event.type === 'result') {
          reportSchema.parse(event.report);
          const next = event.report;
          setReport(next);
          finished = true;
          const updated = [
            next,
            ...history.filter((item) => item.query.toLowerCase() !== next.query.toLowerCase()),
          ].slice(0, 5);
          setHistory(updated);
          try {
            localStorage.setItem(storageKey, JSON.stringify(updated));
            setStorageWarning('');
          } catch {
            setStorageWarning(
              'This report is available, but browser storage is full or disabled. Export it to keep a copy.',
            );
          }
          navigate('/report');
        }
      }
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, {
          stream: !done,
        });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        lines.forEach(handle);
        if (done) {
          if (buffer.trim()) handle(buffer);
          break;
        }
      }
      if (!finished)
        throw new Error('The connection ended before the report was complete. Please retry.');
    } catch (cause) {
      setError(
        requestController.signal.aborted
          ? requestController.signal.reason === 'timeout'
            ? 'Research timed out. Please retry with a specific company and exchange.'
            : 'Research cancelled. You can start a new search.'
          : requestError(cause),
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
      controller.current = null;
    }
  }
  function clearHistory() {
    setHistory([]);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* Storage may be disabled. */
    }
  }
  function updateAnalyzedReport(next) {
    setReport((current) => (current?.id === next.id ? next : current));
    setHistory((current) => {
      const updated = current.map((item) => (item.id === next.id ? next : item));
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {
        /* Optional local persistence. */
      }
      return updated;
    });
  }
  const openEvidence = () => setModal('evidence');
  return (
    <>
      <a href="#main" className="skip-link">
        {' '}
        {t('Skip to content')}{' '}
      </a>
      <header>
        <div className="nav-shell">
          <Link className="brand" to="/">
            {' '}
            {t('◉ FinScope')}{' '}
          </Link>
          <nav aria-label={t('Main navigation')}>
            {[
              ['/', 'Home'],
              ['/report', 'Company report'],
              ['/news', 'News'],
            ].map(([path, label]) =>
              !report && path === '/report' ? (
                <span
                  key={path}
                  className="nav-disabled"
                  aria-disabled="true"
                  title={t('Complete a search on Home first')}
                >
                  {t(label)}
                </span>
              ) : (
                <NavLink key={path} to={path} end={path === '/'}>
                  {t(label)}
                </NavLink>
              ),
            )}
          </nav>
          <select
            className="language-select"
            aria-label={t('Language')}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="vi">{t('Tiếng Việt')}</option>
            <option value="en">{t('English')}</option>
          </select>
          <button className="button how-button" onClick={() => setModal('methods')}>
            {' '}
            {t('How it works')}{' '}
          </button>
        </div>
      </header>
      <main id="main" className="container stack">
        {health &&
          (health.status === 'offline' ||
            (location.pathname === '/news' ? !health.newsConfigured : !health.configured)) && (
            <div className="notice caution" role="status">
              {health.status === 'offline'
                ? t('Cannot reach the Node.js server. Start the app with npm run dev.')
                : location.pathname === '/news'
                  ? t(
                      'Google News is not configured. Add GOOGLE_NEWS_API_KEY to .env and restart the server.',
                    )
                  : t(
                      'Gemini is not configured. Add GEMINI_API_KEY to .env and restart the server.',
                    )}
            </div>
          )}
        {report && location.pathname === '/report' && (
          <Card className="search-strip">
            {report && (
              <div className="report-toolbar">
                <span>
                  <span className="status-dot" /> {report.company.name} {t('· Researched')}{' '}
                  {formatDate(report.generatedAt)}
                </span>
                <div className="actions">
                  <Link className="text-button" to="/">
                    {t('New company research')}
                  </Link>
                  <button className="text-button" onClick={openEvidence} disabled={!displayReport}>
                    {' '}
                    {t('Sources & methods')} <ArrowUpRight size={14} />
                  </button>
                  {displayReport && <ExportButton report={displayReport} />}
                </div>
              </div>
            )}
            {displayReport?.translatedAt && (
              <p className="small muted">
                {t('Report text translated with Gemini. Figures and source links are unchanged.')}
              </p>
            )}
          </Card>
        )}
        {error && (
          <div role="alert" className="notice error">
            <span>
              {t(error)}
              {errorStatus === 429 && (
                <p className="small">
                  {retryRemaining > 0
                    ? `${t('Try again in')} ${retryRemaining} ${t('seconds')}. ${t(geminiError?.retryDelaySource === 'provider' ? 'Wait time supplied by Google.' : 'This is a short local wait; Google may still require more time.')}`
                    : t('You can try again now. If the quota is still reached, try later.')}
                </p>
              )}
              {geminiError && (
                <details className="small muted">
                  <summary>{t('Technical details')}</summary>
                  {t('Model')}: {geminiError.model} · {t('Retry after')}:{' '}
                  {geminiError.retryAfterSeconds}s
                  {geminiError.quotaIdentifiers?.length > 0 &&
                    ' · ' + geminiError.quotaIdentifiers.join(', ')}
                </details>
              )}
              {groundingDiagnostics.length > 0 && (
                <details className="small muted">
                  <summary>{t('Technical details')}</summary>
                  {groundingDiagnostics.map((item) => (
                    <p key={item.stage}>
                      {t(
                        item.stage === 'financials' ? 'Company & financials' : 'Brokerage research',
                      )}
                      : {t('Research text')}: {t(item.hasText ? 'Yes' : 'No')} ·{' '}
                      {t('Usable sources')}: {item.usableSources} · {t('Mapped citations')}:{' '}
                      {item.mappedClaims} · {t('Search queries')}: {item.searchQueries} ·{' '}
                      {t('Finish reason')}: {item.finishReason} · {t('Block reason')}:{' '}
                      {item.blockReason || '—'}
                    </p>
                  ))}
                </details>
              )}
            </span>
            {errorStatus === 429 && lastRequest && (
              <button
                className="button"
                disabled={busy || retryRemaining > 0}
                onClick={() => research(lastRequest.query, lastRequest.language)}
              >
                {t('Try again')}
              </button>
            )}
          </div>
        )}
        {storageWarning && (
          <div role="status" className="notice caution">
            {t(storageWarning)}
          </div>
        )}
        {busy && (
          <Card className="research-progress">
            <div className="section-heading">
              <div>
                <h2>
                  <LoaderCircle className="spin" size={22} /> {t('Research in progress')}{' '}
                </h2>
                <p className="muted">
                  {t('Searching public evidence. This can take a few minutes.')}
                </p>
              </div>
              <button className="button" onClick={() => controller.current?.abort()}>
                {' '}
                {t('Cancel research')}{' '}
              </button>
            </div>
            <div aria-live="polite" className="progress-events">
              {events.map((event, i) => (
                <p key={i}>
                  {i === events.length - 1 ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Check size={15} />
                  )}{' '}
                  {t(
                    event.stage === 'organizing'
                      ? 'Organizing the evidence into your company report.'
                      : event.message,
                  )}
                </p>
              ))}
            </div>
          </Card>
        )}
        <Routes>
          <Route
            path="/"
            element={
              <Home
                onResearch={research}
                busy={busy}
                searchBlocked={retryRemaining > 0}
                history={history}
                onSelect={(item) => {
                  setReport(item);
                  navigate('/report');
                }}
                onClear={clearHistory}
              />
            }
          />
          {[
            [
              '/report',
              <CompanyReport
                key={report?.id}
                report={displayReport}
                onEvidence={openEvidence}
                onUpdateReport={updateAnalyzedReport}
              />,
            ],
          ].map(([path, page]) => (
            <Route
              key={path}
              path={path}
              element={
                !report ? (
                  <Navigate to="/" replace />
                ) : displayReport ? (
                  page
                ) : (
                  <Card role={translationError ? 'alert' : 'status'}>
                    {translationError ? (
                      <>
                        <p>{t(translationError)}</p>
                        <button className="button" onClick={retryTranslation}>
                          {t('Retry translation')}
                        </button>
                      </>
                    ) : (
                      <p>
                        <LoaderCircle className="spin" size={18} />{' '}
                        {t('Translating report into the selected language…')}
                      </p>
                    )}
                  </Card>
                )
              }
            />
          ))}
          {['/market', '/analysis', '/targets'].map((path) => (
            <Route
              key={path}
              path={path}
              element={<Navigate to={report ? '/report' : '/'} replace />}
            />
          ))}
          <Route path="/news" element={<News />} />
          <Route
            path="*"
            element={
              <Card>
                <h1>{t('Page not found')}</h1>
                <Link className="button" to="/">
                  {' '}
                  {t('Return home')}{' '}
                </Link>
              </Card>
            }
          />
        </Routes>
        {report && location.pathname === '/report' && <SearchSuggestions report={report} />}
        <footer>
          <span>{t('FinScope / Economics study project')}</span>
          <span>{t('Gemini · Vietstock · Google News · Educational research')}</span>
          <button className="text-button" onClick={() => setModal('methods')}>
            {' '}
            {t('Sources & methodology')}{' '}
          </button>
        </footer>
      </main>
      {modal && (
        <Modal
          title={
            modal === 'evidence' && report
              ? 'Sources & research evidence'
              : 'From a question to the evidence'
          }
          onClose={() => setModal(null)}
        >
          {modal === 'evidence' && displayReport ? (
            <Evidence report={displayReport} />
          ) : (
            <div className="stack">
              <p>
                {' '}
                {t(
                  'Home uses Gemini with Google Search for company research, an optional broker-report search, and structured formatting. Each search uses at most three Gemini requests. Vietstock supplies price history and supporting evidence. News works independently with Google News.',
                )}{' '}
              </p>
              <div className="grid two">
                <Card className="teal">
                  <h3>{t('Follow the sources')}</h3>
                  <p>
                    {' '}
                    {t(
                      'Source badges open original Vietstock pages and reports. Sources & methods shows the retrieved evidence and missing coverage.',
                    )}{' '}
                  </p>
                </Card>
                <Card className="caution">
                  <h3>{t('Keep the gaps visible')}</h3>
                  <p>
                    {' '}
                    {t(
                      'Unknown figures remain unavailable. Search results can be incomplete or outdated. No stock prices, price histories, or targets are fabricated to fill a chart.',
                    )}{' '}
                  </p>
                </Card>
              </div>
              <p>
                {' '}
                {t(
                  'Reports are dated snapshots, not live market feeds. Research text can be English or Vietnamese. The latest five reports are stored locally in this browser; there is no account or database.',
                )}{' '}
              </p>
              <p className="muted">
                {' '}
                {t(
                  'Built for classroom research. AI interpretations may contain errors; verify important figures against original filings. This app does not provide investment recommendations.',
                )}{' '}
              </p>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
