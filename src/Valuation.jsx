import { useState } from 'react';
import { useLanguage } from './i18n.jsx';
import { Card, Heading, Pill, Sources, EvidenceStatus } from './components.jsx';
import { valuationView } from './valuation.js';

export function Valuation({ report }) {
  const { t, formatNumber, formatDate } = useLanguage();
  const [days, setDays] = useState(365);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('date');
  const data = valuationView(report, days);
  const price = (value) => formatNumber(value, ` ${report.quote.currency || ''}`);
  const rows = data.rows.filter((row) =>
    `${row.firm} ${row.rating}`.toLowerCase().includes(filter.toLowerCase()),
  );
  if (sort === 'target') rows.sort((a, b) => (b.target ?? -Infinity) - (a.target ?? -Infinity));
  const stats = [
    ['Mean target', data.mean, price(data.mean), 'Arithmetic average of comparable targets'],
    ['Median target', data.median, price(data.median), 'Middle value of comparable targets'],
    [
      'Mean upside',
      data.upside,
      formatNumber(data.upside, '%'),
      'Compared with the dated reference price',
    ],
  ].filter(([, value]) => value !== null);
  return (
    <Card className="valuation-card">
      <Heading
        title={t('Brokerage valuation overview')}
        subtitle={t(
          'Published research opinions, with calculations based only on comparable targets.',
        )}
      >
        <label className="valuation-period">
          {t('Statistics window')}
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            {[30, 90, 180, 365].map((value) => (
              <option key={value} value={value}>
                {value} {t('days')}
              </option>
            ))}
          </select>
        </label>
      </Heading>
      <p className="small muted">
        {t('Window ends at the research snapshot')}: {formatDate(report.generatedAt)} ·{' '}
        {t(
          'The window limits statistics. Older and partial reports remain visible; it does not search again.',
        )}
      </p>
      <div className="valuation-stats">
        <div className="valuation-count">
          <small>{t('Sourced reports')}</small>
          <strong>{data.rows.length}</strong>
          <span>
            {data.count} {t('comparable targets')}
          </span>
        </div>
        {stats.map(([label, , value, note]) => (
          <div key={label}>
            <small>{t(label)}</small>
            <strong>{value}</strong>
            <span>{t(note)}</span>
          </div>
        ))}
      </div>
      {data.count > 0 && (
        <div className="valuation-range">
          <div>
            <small>{t('Lowest / highest target')}</small>
            <strong>
              {data.count ? `${price(data.low)} — ${price(data.high)}` : t('Not available')}
            </strong>
          </div>
          <div>
            <small>{t('Target spread')}</small>
            <strong>{price(data.spread)}</strong>
          </div>
          <div>
            <small>{t('Dated reference price')}</small>
            <strong>{price(data.quote?.price)}</strong>
            {data.quote && (
              <span>
                {formatDate(data.quote.asOf)} <Sources ids={data.quote.sourceIds} report={report} />
              </span>
            )}
          </div>
          <div>
            <small>{t('Latest comparable target')}</small>
            <strong>{price(data.latest?.target)}</strong>
            {data.latest && (
              <span>
                {data.latest.firm} · {formatDate(data.latest.publishedAt)}
              </span>
            )}
          </div>
        </div>
      )}
      {data.count === 0 && (
        <p className="small muted">
          {t(
            'Target averages and upside are unavailable because share-basis comparability is not established.',
          )}
        </p>
      )}
      <p className="valuation-method small">
        {t(
          'One latest report per firm is used in statistics. Currency and share basis must match the reference. Missing targets and excluded rows remain visible below.',
        )}
      </p>
      <div className="valuation-toolbar">
        <h3>{t('Report comparison')}</h3>
        <input
          aria-label={t('Filter firm or rating')}
          placeholder={t('Filter firm or rating')}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <select
          aria-label={t('Sort reports')}
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="date">{t('Newest first')}</option>
          <option value="target">{t('Highest target first')}</option>
        </select>
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table className="valuation-table">
            <thead>
              <tr>
                {[
                  'Research firm',
                  'Published',
                  'Target price',
                  "Author's rating",
                  'Evidence / inclusion',
                  'Research details',
                ].map((label) => (
                  <th key={label}>{t(label)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.firm}-${row.publishedAt}-${index}`}>
                  <td>
                    <strong>{row.firm}</strong>
                    {row.title && <small>{row.title}</small>}
                    <small>{row.horizon}</small>
                  </td>
                  <td>
                    {row.publishedAt ? formatDate(row.publishedAt) : t('Report date unavailable')}
                    {row.listedAt && (
                      <small>
                        {t('Publisher listing date')}: {formatDate(row.listedAt)}
                      </small>
                    )}
                    <EvidenceStatus
                      row={row}
                      date={row.publishedAt || row.listedAt || ''}
                      report={report}
                    />
                  </td>
                  <td className="valuation-target">
                    <strong>{formatNumber(row.target, ` ${row.currency}`)}</strong>
                    {row.target !== null && !row.currency && (
                      <small>{t('Currency not disclosed')}</small>
                    )}
                    {row.difference !== null && (
                      <small>
                        {formatNumber(row.difference, '%')} {t('vs. reference')}
                      </small>
                    )}
                  </td>
                  <td>{row.rating || t('Not disclosed')}</td>
                  <td>
                    <Pill tone={row.included ? '' : 'caution'}>
                      {t(row.included ? 'Included in statistics' : row.reason)}
                    </Pill>
                    <div className="valuation-source">
                      {row.sourceIds.map((id) => (
                        <small key={id}>{report.sources.find((s) => s.id === id)?.title}</small>
                      ))}
                      <Sources ids={row.sourceIds} report={report} />
                    </div>
                  </td>
                  <td>
                    <details>
                      <summary>{t('View reasoning')}</summary>
                      {[
                        ['Thesis', row.thesis],
                        ['Valuation assumptions', row.assumptions],
                        ['Risks', row.risks],
                        ['Share basis', row.basis],
                      ].map(([label, value]) => (
                        <p key={label}>
                          <strong>{t(label)}: </strong>
                          {value || t('Not disclosed')}
                        </p>
                      ))}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">
          {t(
            filter
              ? 'No reports match this filter.'
              : 'No sourced reports in this window. Try a longer window or inspect the original research.',
          )}
        </p>
      )}
    </Card>
  );
}
