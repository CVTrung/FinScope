import { useState } from 'react';
import { useLanguage } from './i18n.jsx';
import { Card, Heading, Sources } from './components.jsx';
import { valuationView } from './valuation.js';
import { targetReasoning } from '../shared/brokerListing.js';

export function Valuation({ report }) {
  const { t, formatNumber, formatDate } = useLanguage();
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('date');
  const data = valuationView(report);
  const price = (value) => formatNumber(value, ` ${report.quote.currency || ''}`);
  const rows = data.rows.filter((row) => row.firm.toLowerCase().includes(filter.toLowerCase()));
  if (sort === 'target') rows.sort((a, b) => (b.target ?? -Infinity) - (a.target ?? -Infinity));
  const hasReasoning = rows.some((row) => targetReasoning(row).length > 0);
  const stats = [
    ['Mean target', data.mean, price(data.mean)],
    ['Median target', data.median, price(data.median)],
    ['Mean upside', data.upside, formatNumber(data.upside, '%')],
  ].filter(([, value]) => value !== null);
  return (
    <Card className="valuation-card">
      <Heading title={t('Brokerage valuation overview')} />
      <div className="valuation-stats">
        <div className="valuation-count">
          <small>{t('Sourced reports')}</small>
          <strong>{data.rows.length}</strong>
        </div>
        {stats.map(([label, , value]) => (
          <div key={label}>
            <small>{t(label)}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="valuation-toolbar">
        <h3>{t('Report comparison')}</h3>
        <input
          aria-label={t('Filter research firm')}
          placeholder={t('Filter research firm')}
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
                {['Research firm', 'Published', 'Target price', 'Sources'].map((label) => (
                  <th key={label}>{t(label)}</th>
                ))}
                {hasReasoning && <th>{t('Research details')}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.firm}-${row.publishedAt}-${index}`}>
                  <td>
                    <strong>{row.firm}</strong>
                    {row.title && <small>{row.title}</small>}
                  </td>
                  <td>
                    {row.publishedAt ? formatDate(row.publishedAt) : t('Report date unavailable')}
                    {row.listedAt && (
                      <small>
                        {t('Publisher listing date')}: {formatDate(row.listedAt)}
                      </small>
                    )}
                  </td>
                  <td className="valuation-target">
                    <strong>
                      {formatNumber(row.target, row.currency ? ` ${row.currency}` : '')}
                    </strong>
                    {row.target !== null && !row.currency && (
                      <small>{t('Currency not disclosed')}</small>
                    )}
                    {row.targetOrigin === 'listing' && (
                      <small>{t('Target from publisher listing')}</small>
                    )}
                  </td>
                  <td>
                    <details>
                      <summary>{t('Sources')}</summary>
                      <div className="valuation-source">
                        {row.sourceIds.map((id) => (
                          <small key={id}>
                            {report.sources.find((source) => source.id === id)?.title}
                          </small>
                        ))}
                        <Sources ids={row.sourceIds} report={report} />
                      </div>
                    </details>
                  </td>
                  {hasReasoning && (
                    <td>
                      {targetReasoning(row).length > 0 && (
                        <details>
                          <summary>{t('View reasoning')}</summary>
                          {targetReasoning(row).map(([label, value]) => (
                            <p key={label}>
                              <strong>{t(label)}: </strong>
                              {value}
                            </p>
                          ))}
                        </details>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">{t('No reports match this filter.')}</p>
      )}
    </Card>
  );
}
