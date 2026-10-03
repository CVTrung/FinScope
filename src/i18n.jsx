import { createContext, useContext, useEffect, useState } from 'react';
import vi from './vi.json';
import { validDate } from '../shared/report.js';

const LanguageContext = createContext(null);
export function translate(language, text) {
  if (language !== 'vi' || typeof text !== 'string') return text;
  if (vi[text]) return vi[text];
  const older = /^Older than (\d+) days$/.exec(text);
  if (older) return 'Cũ hơn ' + older[1] + ' ngày';
  const found = /^(Company & financials|Brokerage research): found (\d+) search sources\.$/.exec(
    text,
  );
  if (found)
    return (
      (found[1] === 'Company & financials' ? 'Doanh nghiệp & tài chính' : 'Báo cáo phân tích') +
      ': tìm thấy ' +
      found[2] +
      ' nguồn.'
    );
  return text;
}
export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem('finscope-language') === 'en' ? 'en' : 'vi';
    } catch {
      return 'vi';
    }
  });
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem('finscope-language', language);
    } catch {
      /* Optional preference storage. */
    }
  }, [language]);
  const t = (text) => translate(language, text);
  const locale = language === 'vi' ? 'vi-VN' : 'en-GB';
  const formatNumber = (value, suffix = '') =>
    value === null || value === undefined
      ? t('Not available')
      : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}${suffix}`;
  const formatDate = (value) => {
    const date = validDate(value);
    if (!date) return value || t('Date not disclosed');
    return (
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        ...(value.includes('T')
          ? { timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }
          : { timeZone: 'UTC' }),
      }).format(date) + (value.includes('T') ? ' ICT' : '')
    );
  };
  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, formatNumber, formatDate }}>
      {children}
    </LanguageContext.Provider>
  );
}
export const useLanguage = () => useContext(LanguageContext);
