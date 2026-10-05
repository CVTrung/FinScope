import { geminiModel, quotaDetails } from './gemini.js';
export { extractGrounding } from './grounding.js';

export class ResearchError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export {
  researchCompany,
  retryCompanyAnalysis,
  localizeCompanyReport,
} from './groundedResearch.js';

export function publicError(error) {
  const quota = error.gemini || quotaDetails(error, geminiModel());
  if (quota)
    return {
      status: 429,
      message:
        'Gemini is receiving too many requests or has reached its quota. Please wait and try again. Your search was not completed.',
      gemini: quota,
    };
  if (error instanceof ResearchError)
    return { status: error.status, message: error.message, diagnostics: error.diagnostics };
  const status = Number(error.status || error.code);
  if (status === 503)
    return {
      status: 503,
      message: 'Gemini is temporarily busy. Please retry in a moment.',
    };
  if (status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(error.message))
    return {
      status: 429,
      message:
        'Gemini is receiving too many requests or has reached its quota. Please wait and try again. Your search was not completed.',
      gemini: error.gemini,
    };
  if ([401, 403].includes(status) || /API.key.not.valid/i.test(error.message))
    return {
      status: 503,
      message:
        'Gemini rejected the API key or project permissions. Check your server .env configuration.',
    };
  if (status === 404)
    return {
      status: 503,
      message: /no longer available to new users|actively used.*past/i.test(error.message || '')
        ? 'Google has restricted this Gemini model to existing users. Check access to Gemini 2.5 Flash and Flash-Lite for your API project.'
        : 'Google could not access the configured Gemini model. Check access to Gemini 2.5 Flash and Flash-Lite for your API project.',
    };
  if (status === 400 && /google.?search|grounding|search.*support/i.test(error.message || ''))
    return {
      status: 503,
      message:
        'Google rejected Search grounding for this request. Check the configured model and API project access. Model availability and Search support are separate requirements.',
    };
  if (/timeout|abort/i.test(error.message))
    return {
      status: 504,
      message: 'Research took too long. Please retry with a specific company name and exchange.',
    };
  return {
    status: 502,
    message: 'Gemini research could not be completed. Check your connection and retry.',
  };
}
