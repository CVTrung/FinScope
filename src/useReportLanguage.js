import { useEffect, useRef, useState } from 'react';
import { requestError } from './requestError.js';

export function useReportLanguage(report, language, enabled = true) {
  const cache = useRef(new Map());
  const [translated, setTranslated] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const displayed =
    report?.language === language
      ? report
      : translated?.id === report?.id && translated?.language === language
        ? translated
        : null;
  useEffect(() => {
    setError('');
    if (!enabled || !report || report.language === language) return;
    const key = `${report.id}:${language}:${report.analysisStatus?.analyzedAt || report.analysisStatus?.state || ''}`;
    if (cache.current.has(key)) {
      setTranslated(cache.current.get(key));
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), 155000);
    fetch('/api/translate-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report, language }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        cache.current.set(key, data);
        setTranslated(data);
      })
      .catch((cause) => {
        if (!controller.signal.aborted || controller.signal.reason === 'timeout')
          setError(
            controller.signal.aborted
              ? 'Translation timed out. Please retry.'
              : requestError(cause),
          );
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [report, language, attempt, enabled]);
  return { displayed, error, retry: () => setAttempt((value) => value + 1) };
}
