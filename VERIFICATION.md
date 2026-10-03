# Verification — 3 October 2026

## Latest: Tavily-only News

- News now requires only TAVILY_API_KEY. Gemini news curation and translation were removed. The financial-report translation hook is disabled on the News route, and News configuration notices check Tavily rather than Gemini.
- The editable allowlist in shared/newsSources.js has 48 Vietnamese business and general-news publisher domains, including subdomains. Tavily receives include_domains with restrict mode; returned hostnames are checked again in code. Mocked tests reject outside and deceptive lookalike hosts.
- Only Tavily Search is called by the news adapter. Source titles/excerpts and per-result images are used directly; there is no publisher-page image fetch or query-wide image assignment. Original text is not translated. Language guides retrieval and may not match every returned article.
- Date windows, newest-first ordering, 15-minute merging across windows, and session persistence are retained. Basic checks exclude recognizable home/tag/profile pages and require distinctive query words in the title or excerpt. These checks do not certify company nationality or semantic relevance.
- npm test: 29 passing tests. npm run build: success. The removed Gemini news and publisher-image tests were replaced with Tavily-only/allowlist/image tests.
- Live strict-language Vietnamese requests returned zero results, so the provider strict-language flag is omitted. A company-only query is used because appending Vietnam diluted relevance.
- Browser verification on temporary port 3001 ran with GEMINI_API_KEY and GOOGLE_API_KEY removed from that process. FPT over 12 months returned two related dated articles with images. Home → News restored the same two URLs without a loading state. The 48-domain list was inspected. Screenshot: artifacts/finscope-news-tavily-only.png.
- The temporary test server was stopped. A separate pre-existing FinScope server on port 3000 was left running; restart it to load the backend rewrite. Source .env keys/model were not changed.
- Financial research and saved-report translation continue to use Gemini on the company pages. Cloud deployment was not performed.

## Earlier verification history

The records below predate the Tavily-only rewrite. Their Gemini News processing, translation and image-fallback descriptions are superseded by the section above.

## Current changes verified

- **Date windows and persistence:** explicit Vietnam-local date bounds are sent to Tavily and rechecked in code. Undated, invalid, future and out-of-range candidates are excluded before Gemini curation. Dated results sort newest first. Today, 3/7/14/30 days and 3/6/12/24 calendar months are supported.
- **Window consistency:** ranked searches can omit recent articles when expanding the window. A bounded 15-minute cache merges already-confirmed articles across windows for the same topic/language. Repeated searches for an already-loaded window filter this combined pool. Automated tests confirm 7-day results remain present in 30-day and 12-month results during the cache lifetime. Search coverage remains incomplete.
- **Latest live FPT check:** 30 days returned five articles with dates 21, 19, 18, 16 and 11 September, all within 4 September–3 October 2026 and ordered newest first. Reload and Home → News navigation retained the same five links and query/window without loading a new search. The dropdown automatically started a seven-day request, which was blocked by Gemini quota; successful live seven-day/wider comparison remains unverified. Switching back to 30 days restored the cached five articles.
- `artifacts/finscope-news-dates.png`: verified 30-day results after navigation restoration.

Latest update: strict news date windows, newest-first sorting, consistent cached results across windows, additional time choices, and saved News state across navigation. Older provider/navigation checks below are retained as regression evidence.

- **Latest live news UI:** FPT with the 12-month window returned five individual company articles in Vietnamese. All five browser images loaded successfully at 210 × 160 px. Tag/profile pages were excluded after refining the prompt. Screenshot: `artifacts/finscope-news-vi.png`.
- **English news and mobile:** changing the language automatically reran the FPT search and displayed eight articles with English titles/summaries. At a 390px viewport, article images stacked above text at 305 × 190 px; there was no page-level overflow. Viewport override reset.
- **Saved-report translation:** offline preservation tests pass. The live VNM translation first returned incomplete output; after reducing Gemini 3 thinking for text processing, retries returned 503 overload errors. A successful complete translated report is **not yet live-verified**. The UI hides mismatched-language report text and offers Retry translation.
- `npm test`: **30 passing tests** covering research streaming/cancellation, Vietnamese defaults, independent news/history endpoints, Tavily authentication and result normalization, Vietstock public-session requests and price/date validation, Gemini Search/JSON separation, and existing financial calculations.
- `npm run build`: production build succeeds. Two Zod annotation warnings concern dependency comments removed during bundling.
- Vietnamese is the default interface language. Header switching to English was verified across Home and News; dates and numbers use the selected locale. Open reports now request Gemini translation when their stored language differs from the selection; the original evidence and structured numeric data are preserved.
- Direct Market access without an open report returns to Home. Market, Analysis, and Price Targets navigation is disabled until a completed Home report is opened. Opening the saved Vinamilk report unlocked all three pages.
- Browser checks found **zero text search inputs** on Market, Analysis, and Price Targets. Vietnamese target rules and page headings were checked.
- **Live Vietstock:** the FPT adapter returned 250 daily observations. In the browser, the saved VNM report loaded 247 observations within the one-year filter and 21 within one month. Data links point directly to Vietstock. Chart source icons measured **11 × 11 px**.
- **Live Tavily:** direct FPT search returned 10 articles; a standalone browser search for Vinamilk Vietnam returned 6 articles with publisher links and dates, while company pages remained locked.
- The latest fresh Vietnamese Gemini request returned a quota/rate-limit error. The error appeared in Vietnamese and did not unlock result pages. The updated two-search-plus-formatting orchestration passed mocked tests, but fresh successful research with this version remains unverified until Gemini quota is available.
- Mobile layout checked at a 390px viewport without page-level horizontal overflow. The temporary viewport override was reset.
- No browser console errors were observed during the successful price-chart and result-page navigation checks.

## Deployment and remaining limits

- Local Node production entry point serves frontend and API on port 3000. Both `GEMINI_API_KEY` and `TAVILY_API_KEY` are loaded only by the backend. API keys were preserved. The invalid model ID `gemini-3-flash` was corrected to `gemini-3-flash-preview` after checking the models API.
- AI Studio / Cloud Run remains a Node + React deployment. Add both API keys as server secrets. The container honors `PORT` and binds `0.0.0.0`; see README.md.
- Vietstock history covers supported Vietnamese listings. Its public chart endpoint does not disclose adjustment basis. History does not replace the separate dated quote used in brokerage comparisons, and no substitute provider is used if Vietstock fails.
- News now restricts publishers to Vietnam-focused outlets and uses Gemini to exclude foreign-company, unrelated and non-article results. Gemini presents article titles/summaries in the selected language. Article images come from each result or its publisher page metadata, with a fallback for unavailable images. Model relevance decisions are not infallible.
- News and translation use ordinary Gemini generation, without Google Search grounding. The selected model completed generation and news curation in live checks, but also returned intermittent 503 overload errors; these are exposed as retryable errors. Google Search-grounded research still returned 429, including a minimal grounded request. Full fresh Home research remains unverified with the new model.
- JSON export contains the Gemini report snapshot; independent Vietstock history and Tavily news are not included. A completed in-app browser download was not confirmed during the earlier implementation.
- Docker execution and AI Studio/Cloud Run publishing were not performed. Financial claims were not independently audited against every original filing.

## Artifacts

- `artifacts/finscope-market-vi.png`: Vietnamese Market view and live Vietstock price history.
- `artifacts/live-report.json`: earlier Gemini test output; it predates these provider changes and is not evidence of a new successful Gemini run.
- Artifacts are excluded from source-control and deployment uploads.
