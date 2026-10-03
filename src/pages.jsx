import { useLanguage } from './i18n.jsx';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Clock3,
  BookOpen,
  ChartNoAxesCombined,
  FileText,
  Sparkles,
} from 'lucide-react';
import { summarizeTargets, cashConversion } from '../shared/report.js';
import {
  Card,
  Heading,
  Pill,
  Empty,
  Sources,
  ResearchForm,
  CompanyBanner,
  LineChart,
} from './components.jsx';
const features = [
  {
    path: '/market',
    label: 'MARKET',
    title: 'Know the company',
    body: 'Explore its business, price history, financial performance, and peers.',
    color: 'teal',
    icon: ChartNoAxesCombined,
  },
  {
    path: '/news',
    label: 'NEWS',
    title: 'Follow the context',
    body: 'Read relevant developments and trace each story back to its publisher.',
    color: '',
    icon: FileText,
  },
  {
    path: '/analysis',
    label: 'ANALYSIS',
    title: 'Examine the reasoning',
    body: 'Review observations, alternative explanations, and the evidence behind them.',
    color: 'caution',
    icon: Sparkles,
  },
  {
    path: '/targets',
    label: 'PRICE TARGETS',
    title: 'Compare estimates',
    body: 'Compare dated research targets, assumptions, and risks with the market price.',
    color: 'teal',
    icon: BookOpen,
  },
];
export function Home({ onResearch, busy, history, onSelect, onClear, onMethods, hasReport }) {
  const { t, language, formatDate } = useLanguage();
  return (
    <>
      <section className="hero">
        <Pill>{t('GEMINI SEARCH · COMPANY RESEARCH')}</Pill>
        <h1>
          {' '}
          {t('See the market.')} <br /> {t('Understand the story.')}{' '}
        </h1>
        <p>
          {t(
            'Explore companies, follow the news, and connect financial evidence to economic ideas.',
          )}
        </p>
        <ResearchForm onResearch={onResearch} busy={busy} />
        <div className="suggestions">
          <span>{t('Try a company')}</span>
          {['FPT (HOSE)', 'Vinamilk (VNM)', 'Apple (NASDAQ: AAPL)'].map((query) => (
            <button key={query} disabled={busy} onClick={() => onResearch(query, language)}>
              {query} ↗
            </button>
          ))}
        </div>
        <p className="hero-note">
          {t('Research a company on Home. Search News independently. Sources included.')}
        </p>
      </section>
      {history.length > 0 && (
        <section>
          <Heading
            title={t('Pick up your research')}
            subtitle={t(
              'Saved on this browser. Gemini translates reports when the language changes.',
            )}
          >
            <button className="text-button" onClick={onClear}>
              {' '}
              {t('Clear history')}{' '}
            </button>
          </Heading>
          <div className="history-list">
            {history.map((report) => (
              <button key={report.id} className="history-item" onClick={() => onSelect(report)}>
                <span className="ticker-icon">
                  {(report.company.ticker || report.company.name).slice(0, 3)}
                </span>
                <span>
                  <strong>{report.company.name}</strong>
                  <small>
                    <Clock3 size={12} /> {formatDate(report.generatedAt)}
                  </small>
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        </section>
      )}
      <Heading
        title={t('One place to build your understanding')}
        subtitle={t('Four connected research spaces, from first question to supporting evidence.')}
      />
      <div className="grid four">
        {features.map((feature, i) => (
          <Card key={feature.path} className={`feature ${feature.color}`}>
            <div className="eyebrow">
              0{i + 1} / {t(feature.label)}
              <feature.icon size={19} />
            </div>
            <h2>{t(feature.title)}</h2>
            <p className="muted">{t(feature.body)}</p>
            <Link
              className="button"
              to={feature.path === '/news' || hasReport ? feature.path : '/'}
            >
              {feature.path !== '/news' && !hasReport
                ? t('Start with Home search')
                : `${t('Explore')} ${t(feature.label)}`}{' '}
              <ArrowRight size={15} />
            </Link>
          </Card>
        ))}
      </div>
      <Heading
        title={t('A simple path from curiosity to insight')}
        subtitle={t(
          'Start with a company. Follow the evidence as your question becomes more specific.',
        )}
      />
      <Card>
        <div className="grid four journey">
          {[
            ['Discover', 'Enter a company name or stock ticker.'],
            ['Research', 'Gemini searches financials and published reports.'],
            ['Interpret', 'Explore the results and compare explanations.'],
            ['Verify', 'Inspect the source, period, and method.'],
          ].map(([title, detail], i) => (
            <div key={t(title)}>
              <Pill>{i + 1}</Pill>
              <h3>{t(title)}</h3>
              <p className="muted">{t(detail)}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card className="teal">
        <Heading title={t('Built for learning, with evidence in view.')}>
          <button className="button" onClick={onMethods}>
            {' '}
            {t('Sources & methods')}{' '}
          </button>
        </Heading>
        <p>
          {' '}
          {t(
            'Search-grounded research, dated observations, and clearly stated gaps. No account required. Designed for a university economics project.',
          )}{' '}
        </p>
      </Card>
    </>
  );
}
export function Market({ report, onEvidence }) {
  const { t, formatNumber } = useLanguage();
  const [range, setRange] = useState('1Y');
  const [period, setPeriod] = useState('quarterly');
  const [prices, setPrices] = useState(null);
  const [priceError, setPriceError] = useState('');
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoadingPrices(true);
    setPriceError('');
    setPrices(null);
    fetch(
      '/api/prices?' +
        new URLSearchParams({
          ticker: report.company.ticker,
          exchange: report.company.exchange,
        }),
      {
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
      })
      .then(setPrices)
      .catch((error) => {
        if (!controller.signal.aborted) setPriceError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPrices(false);
      });
    return () => controller.abort();
  }, [report.id, report.company.ticker, report.company.exchange, attempt]);
  const days = {
    '1M': 30,
    '3M': 90,
    '6M': 180,
    '1Y': 365,
    All: Infinity,
  }[range];
  const points = (prices?.points || []).filter(
    (point) => (new Date(prices.retrievedAt) - new Date(point.date)) / 86400000 <= days,
  );
  const financials = report.financials.filter((row) => row.kind === period);
  return (
    <>
      <Heading
        title={t('Explore the market')}
        subtitle={t(
          'Inspect the company researched on Home, its financial history, and its peers.',
        )}
      >
        <Pill>{t('SEARCH SNAPSHOT')}</Pill>
      </Heading>
      <CompanyBanner report={report} />
      <Card>
        <Heading
          title={t('Price history')}
          subtitle={t('Vietstock · VND · Daily closing prices over the past year')}
        >
          <div className="segmented">
            {['1M', '3M', '6M', '1Y', 'All'].map((value) => (
              <button
                key={t(value)}
                className={range === value ? 'active' : ''}
                aria-pressed={range === value}
                onClick={() => setRange(value)}
              >
                {t(value)}
              </button>
            ))}
          </div>
        </Heading>
        {loadingPrices ? (
          <p role="status">{t('Loading historical prices from Vietstock…')}</p>
        ) : priceError ? (
          <div className="notice caution" role="alert">
            <span>{t(priceError)}</span>
            <button className="button" onClick={() => setAttempt((value) => value + 1)}>
              {t('Retry prices')}
            </button>
          </div>
        ) : (
          <LineChart points={points} report={prices} suffix=" VND" />
        )}
        <a
          href={`https://finance.vietstock.vn/${encodeURIComponent(report.company.ticker)}.htm`}
          target="_blank"
          rel="noreferrer"
          className="text-button"
        >
          {t('View on Vietstock ↗')}
        </a>
        <p className="small muted">
          {' '}
          {t(
            'Prices are retrieved directly from Vietstock. Adjustment basis is not disclosed by this endpoint; this series is not used to recalculate brokerage target returns.',
          )}{' '}
        </p>
      </Card>
      <div className="grid four">
        {report.metrics.length ? (
          report.metrics.map((metric, i) => (
            <Card key={i} className={i === 1 ? 'caution metric' : 'metric'}>
              <small className="muted">{metric.label}</small>
              <strong>{metric.value}</strong>
              <small>
                {metric.period} <Sources ids={metric.sourceIds} report={report} />
              </small>
            </Card>
          ))
        ) : (
          <Card className="span-all">
            <Empty title={t('Key metrics not established')} />
          </Card>
        )}
      </div>
      <Card>
        <Heading
          title={t('Financial performance')}
          subtitle={t('Check the currency, scale, and accounting period before comparing.')}
        >
          <div className="segmented">
            {['quarterly', 'annual'].map((value) => (
              <button
                key={t(value)}
                className={period === value ? 'active' : ''}
                aria-pressed={period === value}
                onClick={() => setPeriod(value)}
              >
                {value === 'annual' ? t('Annual') : t('Quarterly')}
              </button>
            ))}
          </div>
        </Heading>
        {financials.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Metric / unit')}</th>
                  {financials.map((row, i) => (
                    <th key={i}>
                      {row.period}
                      <small>
                        {row.unit} · {row.currency}
                      </small>
                      <Sources ids={row.sourceIds} report={report} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Revenue', 'revenue', ''],
                  ['Net income', 'netIncome', ''],
                  ['Operating cash flow', 'operatingCashFlow', ''],
                  ['Net margin', 'netMargin', '%'],
                  ['Debt / equity', 'debtEquity', '×'],
                ].map(([label, key, suffix]) => (
                  <tr key={key}>
                    <td>{t(label)}</td>
                    {financials.map((row, i) => (
                      <td key={i}>{formatNumber(row[key], suffix)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={`No comparable ${period} financials found`} />
        )}
        <button className="text-button" onClick={onEvidence}>
          {' '}
          {t('Inspect evidence and limitations ↗')}{' '}
        </button>
      </Card>
      <div className="grid two">
        <Card>
          <Heading
            title={t('Compare in context')}
            subtitle={t('Segment and size differences matter.')}
          />
          {report.peers.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('Company')}</th>
                    <th>{t('P/E')}</th>
                    <th>{t('Margin')}</th>
                    <th>{t('Debt / equity')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.peers.map((peer, i) => (
                    <tr key={i}>
                      <td>
                        <strong>{peer.ticker || peer.name}</strong>
                        <small>{peer.period}</small>
                        <Sources ids={peer.sourceIds} report={report} />
                      </td>
                      <td>{formatNumber(peer.pe, '×')}</td>
                      <td>{formatNumber(peer.netMargin, '%')}</td>
                      <td>{formatNumber(peer.debtEquity, '×')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title={t('Peer data unavailable')} />
          )}
          {report.peers.map((peer, i) => (
            <p className="small muted" key={i}>
              {peer.name}: {peer.caveat}
            </p>
          ))}
        </Card>
        <Card>
          <Heading
            title={t('Recent information')}
            subtitle={t('News and events, with supporting context.')}
          />
          <p>
            {t('Search fresh company and industry news with Tavily on the independent News page.')}
          </p>
          <Link className="text-button" to={`/news?q=${encodeURIComponent(report.company.name)}`}>
            {' '}
            {t('Read related news →')}{' '}
          </Link>
        </Card>
      </div>
      <div className="section-heading">
        <h3>{t('Ready to connect the facts?')}</h3>
        <Link className="button primary" to="/analysis">
          {' '}
          {t('Open contextual analysis')} <ArrowRight size={16} />
        </Link>
      </div>
    </>
  );
}
export function Analysis({ report, onEvidence }) {
  const { t } = useLanguage();
  const [kind, setKind] = useState('quarterly');
  const cash = cashConversion(report.financials, kind);
  return (
    <>
      <Heading
        title={`${report.company.ticker || report.company.name} / ${t('Understanding the evidence')}`}
        subtitle={t('An academic reading of operating results, market context, and uncertainty.')}
      >
        <Pill tone="caution">{t('AI INTERPRETATION')}</Pill>
      </Heading>
      <Card className="navy">
        <small>{t('The question')}</small>
        <h2>{report.analysis.question || t('What does the available evidence tell us?')}</h2>
        <p>{report.summary}</p>
      </Card>
      <div className="grid three">
        {report.analysis.observations.map((observation, i) => (
          <Card key={i} className={['teal', 'caution', 'subtle'][i % 3]}>
            <Pill tone="neutral">
              {t('OBSERVATION')} {String(i + 1).padStart(2, '0')}
            </Pill>
            <h3>{observation.title}</h3>
            <p>
              {observation.detail} <Sources ids={observation.sourceIds} report={report} />
            </p>
            <details>
              <summary>{t('Alternative explanation & next step')}</summary>
              <p>{observation.alternative}</p>
              <h4>{t('What would change this view?')}</h4>
              <p>{observation.nextStep}</p>
            </details>
          </Card>
        ))}
      </div>
      <Heading
        title={t('Read the patterns together')}
        subtitle={t('Use comparable periods and inspect the evidence behind each relationship.')}
      />
      <div className="grid two">
        <Card>
          <Heading
            title={t('Operating cash flow / net income')}
            subtitle={t('Calculated from sourced financial statements')}
          >
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              aria-label={t('Cash conversion period')}
            >
              <option value="quarterly">{t('Quarterly')}</option>
              <option value="annual">{t('Annual')}</option>
            </select>
          </Heading>
          <LineChart
            points={cash}
            valueKey="ratio"
            label={t('Cash conversion')}
            suffix="×"
            report={report}
          />
          <p className="small muted">
            {' '}
            {t(
              'Operating cash flow ÷ net income for the same reported period and known accounting scope. Non-positive net income and unknown or incompatible scopes are excluded.',
            )}{' '}
          </p>
        </Card>
        <Card className="caution">
          <h3>{t('What is still uncertain?')}</h3>
          {report.analysis.risks.length ? (
            <ul>
              {report.analysis.risks.map((risk, i) => (
                <li key={i}>{risk}</li>
              ))}
            </ul>
          ) : (
            <p>{t('No specific risk assessment was returned.')}</p>
          )}
          <button className="button" onClick={onEvidence}>
            {' '}
            {t('Assumptions & limitations')}{' '}
          </button>
        </Card>
      </div>
      <Heading
        title={t('Follow each statement back to evidence')}
        subtitle={t('Reported facts, calculations, and interpretations are kept distinct.')}
      />
      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Evidence / type')}</th>
                <th>{t('Observation')}</th>
                <th>{t('Alternative / limit')}</th>
                <th>{t('Sources')}</th>
              </tr>
            </thead>
            <tbody>
              {report.analysis.observations.map((item, i) => (
                <tr key={i}>
                  <td>
                    {t('E')}
                    {String(i + 1).padStart(2, '0')} {t('· Interpretation')}
                  </td>
                  <td>{item.detail}</td>
                  <td>{item.alternative}</td>
                  <td>
                    <Sources ids={item.sourceIds} report={report} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="teal">
        <h3>{t('A useful conclusion remains conditional.')}</h3>
        <p>{report.analysis.conclusion || t('There is insufficient evidence for a conclusion.')}</p>
        <div className="section-heading">
          <Link className="button" to="/market">
            {' '}
            {t('Inspect financial history')}{' '}
          </Link>
          <Link className="button" to={`/news?q=${encodeURIComponent(report.company.name)}`}>
            {' '}
            {t('Read related news →')}{' '}
          </Link>
        </div>
      </Card>
    </>
  );
}
export function Targets({ report, onRules }) {
  const { t, formatNumber, formatDate } = useLanguage();
  const [days, setDays] = useState(90);
  const summary = summarizeTargets(report, days);
  const included = summary.rows.filter((row) => row.included);
  return (
    <>
      <Heading
        title={t('Price targets, with the reasoning attached')}
        subtitle={t(
          'Compare published research estimates and inspect the assumptions behind each one.',
        )}
      >
        <Pill>{t('THIRD-PARTY REPORTS')}</Pill>
      </Heading>
      <Card>
        <div className="section-heading">
          <span>{report.company.name}</span>
          <div className="actions">
            <select
              aria-label={t('Target inclusion window')}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              <option value={90}>{t('Within 90 days')}</option>
              <option value={180}>{t('Within 180 days')}</option>
              <option value={365}>{t('Within 12 months')}</option>
            </select>
            <button className="button" onClick={onRules}>
              {' '}
              {t('Inclusion rules ⓘ')}{' '}
            </button>
          </div>
        </div>
      </Card>
      <CompanyBanner report={report} dark />
      <div className="grid three">
        <Card className="metric">
          <small className="muted">{t('Comparable reports')}</small>
          <strong>
            {summary.count} {t('of')} {report.targets.length}
          </strong>
          <small>
            {t('Latest report per firm, within')} {days} {t('days.')}
          </small>
        </Card>
        <Card className="metric teal">
          <small>{t('Lowest / highest')}</small>
          <strong>
            {summary.count
              ? `${formatNumber(summary.low)}–${formatNumber(summary.high)} ${report.quote.currency}`
              : t('Not available')}
          </strong>
          <small>{t('Range across included reports.')}</small>
        </Card>
        <Card className="metric caution">
          <small>{t('Median target')}</small>
          <strong>{formatNumber(summary.median, ` ${report.quote.currency}`)}</strong>
          <small>{t("An author's estimate, not a forecast by FinScope.")}</small>
        </Card>
      </div>
      <Card>
        <Heading
          title={t('How widely do the estimates differ?')}
          subtitle={t('Only targets with a confirmed comparable share basis enter this view.')}
        />
        {included.length ? (
          <div className="target-bars">
            {included.map((target, i) => (
              <div key={i}>
                <div className="section-heading">
                  <strong>{target.firm}</strong>
                  <span>{formatNumber(target.target, ` ${target.currency}`)}</span>
                </div>
                <meter
                  min="0"
                  max={Math.max(summary.high, report.quote.price || 0) * 1.1}
                  value={target.target}
                />
                <small className="muted">
                  {target.difference === null
                    ? t('Market comparison unavailable')
                    : `${target.difference > 0 ? '+' : ''}${formatNumber(target.difference, '%')} ${t('vs. dated market reference')}`}
                </small>
              </div>
            ))}
          </div>
        ) : (
          <Empty title={t('No comparable target range')}>
            {' '}
            {t(
              'Reports may be unavailable, outdated, missing explicit targets, or use an unconfirmed share basis.',
            )}{' '}
          </Empty>
        )}
        <p className="small muted">
          {' '}
          {t(
            'The range describes disagreement between reports. It is not a confidence interval or an expected return.',
          )}{' '}
        </p>
      </Card>
      <Heading
        title={t('Research reports')}
        subtitle={t('Open a report to inspect its thesis, assumptions, risks, and source.')}
      />
      <Card>
        {summary.rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Research firm')}</th>
                  <th>{t('Target')}</th>
                  <th>{t('Published')}</th>
                  <th>{t('Horizon')}</th>
                  <th>{t("Author's rating")}</th>
                  <th>{t('vs. market')}</th>
                  <th>{t('Details / source')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((target, i) => (
                  <tr key={i}>
                    <td>
                      <strong>{target.firm}</strong>
                    </td>
                    <td>{formatNumber(target.target, ` ${target.currency}`)}</td>
                    <td>{formatDate(target.publishedAt)}</td>
                    <td>{target.horizon || t('Not stated')}</td>
                    <td>{target.rating || t('Not stated')}</td>
                    <td>{formatNumber(target.difference, '%')}</td>
                    <td>
                      <details>
                        <summary>{t('Details ↓')}</summary>
                        <h4>{t('Thesis')}</h4>
                        <p>{target.thesis}</p>
                        <h4>{t('Valuation assumptions')}</h4>
                        <p>{target.assumptions}</p>
                        <h4>{t('Risks')}</h4>
                        <p>{target.risks}</p>
                        <p>
                          {t('Share basis:')} {target.basis || t('Unknown')}
                        </p>
                        <Sources ids={target.sourceIds} report={report} />
                      </details>
                      <small className={target.included ? 'positive' : 'warning'}>
                        {target.included ? t('Included') : t(target.reason)}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={t('No published targets found')}>
            {' '}
            {t(
              'Gemini did not find publicly accessible brokerage targets. FinScope does not generate its own price estimates.',
            )}{' '}
          </Empty>
        )}
      </Card>
      <div className="section-heading">
        <Link className="button" to="/market">
          {' '}
          {t('View company financials')}{' '}
        </Link>
        <Link className="button primary" to="/analysis">
          {' '}
          {t('Read contextual analysis →')}{' '}
        </Link>
      </div>
    </>
  );
}
