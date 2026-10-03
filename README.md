# FinScope

A university company and stock research app. Enter a company on Home; Gemini researches it with Google Search, then the report powers **Market, Analysis, and Price Targets**. Vietstock supplies historical prices, and the independent **News** page searches with Tavily.

The React interface follows the supplied [FinScope Figma design](https://www.figma.com/design/IydUYAwdne91ngMhDFI1oV/FinScope-Frontend-Layout?node-id=0-1). The home search replaces the prototype's navigation-only action. Financial charts are rendered from actual returned data. Vietnamese is the default interface language, with English available in the header.

## Part 1 — Run locally

Use Node.js 22 or newer. From this folder:

```sh
npm install
npm run dev
```

Open **http://localhost:3000**. One Node.js process serves both the API and the React app. No second terminal, database, account, or separate backend port is needed.

React/CSS edits update through Vite hot reload. Restart `npm run dev` after editing backend or shared server logic. The startup command avoids Node's recursive module watcher, which can restart repeatedly on Vite's generated configuration files on Windows.

Create `.env` in the project root (the existing key is already supported):

```dotenv
GEMINI_API_KEY=your_key
TAVILY_API_KEY=your_tavily_key
GEMINI_MODEL=gemini-3-flash-preview
PORT=3000
```

Spaces around `=` are accepted. Restart the server after changing `.env`. Keep the key in the server environment, never a `VITE_` variable. `.env` is excluded from Git and container uploads.

## Part 2 — Use the app

1. Choose **Tiếng Việt** (default) or **English** in the header. The choice is saved in this browser and used for new Gemini research and the language of news sources. Switching language translates an open report with Gemini and refreshes the last news search. Report figures, dates, links, and original evidence stay unchanged; translated reports are cached for the current session.
2. Enter a company/ticker on **Home**, preferably with its exchange, such as FPT (HOSE). A full search uses **three Gemini calls**: two Google Search research calls and one structured formatting call.
3. Once research succeeds, Market, Analysis, and Price Targets become available. These pages have no company search form. Return Home to research another company. Opening a saved, completed report from Home also unlocks these pages; reloading starts at Home again.
4. **Market** automatically retrieves one year of Vietnamese daily closing prices from Vietstock. It supports HOSE/HSX, HNX, and UPCoM. Unsupported listings show an explanation; no alternative source or generated prices are used.
5. **News** is independent: enter a Vietnamese company or stock, select a time window, and search with Tavily. News uses only Tavily. Search is restricted to the 48 Vietnamese publisher domains listed in `shared/newsSources.js`, with subdomains included. The language selection guides Tavily retrieval; original titles and excerpts are shown without translation. Article images appear beside the text when available. Results are sorted newest first and must have a date in the selected window. Changing the window refreshes the last search automatically. The completed search, window and results are saved in this tab, so they survive page navigation and reload without repeating the search. It works without a Home report and requires only `TAVILY_API_KEY`.
6. Open source badges and **Sources & methods** to inspect Gemini evidence. **Export report** downloads the Gemini research snapshot as JSON; independently retrieved prices and news are not included in that export.
7. The latest five Gemini reports are saved in this browser. Clear history removes the saved list; the open report remains available until reload. There is no cloud database.

## Part 3 — How research works

```text
React form → POST /api/research → Node.js
  ├─ Gemini + Google Search: company and financials
  └─ Gemini + Google Search: brokerage reports
           ↓
Gemini JSON formatting (only the gathered evidence, no new search)
           ↓
Zod validation + source/date checks + code-owned calculations
           ↓
One report → Market / Analysis / Price Targets
Market → GET /api/prices → Vietstock public historical chart
News → POST /api/news → Tavily → domain/date checks → original articles
Language switch → POST /api/translate-report → Gemini text translation
```

The two-stage search/formatting approach also works with Gemini 2.5, where Search and JSON output are not combined in a single request. Gemini remains the core financial analysis provider. Vietstock supplies price history and Tavily supplies standalone news, as requested.

- Date and timezone context comes from server code, not the model's memory.
- Citations use source IDs mapped to actual Google grounding URLs. Unknown IDs are removed. The evidence drawer retains original search text and grounding claim mappings.
- Google search suggestions returned by the API are available below the results, inside sandboxed frames.
- Unknown financial figures remain null. Unsourced numeric financial rows and invalid quotes are suppressed. Reported net margins that conflict with their revenue/net-income rows are omitted with an explanation.
- Price charts use the public Vietstock EOD chart endpoint, opening an anonymous page session and submitting its normal verification token. Prices remain in whole VND as returned. The endpoint does not disclose adjustment basis, so these prices do not replace the dated Gemini quote used for target comparability. Successful history requests are cached in server memory for 15 minutes (up to 100 tickers). No login bypass is used; provider unavailability appears as a retryable error.
- News uses Tavily’s news topic with Today, 3/7/14/30-day and 3/6/12/24-month windows. Date boundaries use Asia/Ho_Chi_Minh, with calendar-month subtraction for month/year choices. Explicit start/end dates and the provider date filter are sent to Tavily; the backend also removes undated, invalid, future and out-of-window results. Searches are restricted to an editable list of 48 Vietnamese business and general-news publishers using Tavily `include_domains_mode: restrict`; the backend checks every returned hostname too. The `language` parameter guides Vietnamese/English retrieval; article text is not automatically translated and may differ from the interface language. The strict provider language filter is omitted because it suppressed all results in live Vietnamese checks. Titles and excerpts remain in the original source language. No Gemini call is used for search, filtering, summarization, translation or images. Domain restriction focuses coverage on Vietnam but cannot certify every company nationality or semantic match. Basic checks exclude recognizable home/tag/profile pages and require distinctive query words in the title or excerpt. Undated articles are excluded from date-filtered News. Tavily dates are estimates and may represent an update rather than the original publication. Search is ranked and limited to 20 candidates per request, so results are not an exhaustive news archive. A 15-minute server cache combines confirmed articles across searched windows for the same topic/language, keeping already-found recent articles when widening the window. Images come only from Tavily’s per-result images; query-wide images are ignored because they may be unrelated. Missing/blocked images have a placeholder. No publisher page is fetched for images. API keys stay in Node.js.
- Financial periods are standalone quarterly or annual periods, ordered by period-end date. Cash conversion is computed only when cash flow and net income have a matching known accounting scope.
- Target summaries use the latest report per firm within the selected window, explicit positive targets, source references, and confirmed comparable currency/share basis. A generic “per share” label is insufficient. Missing targets are never zero. Median and market differences are calculated in JavaScript.
- Failed research sections are disclosed. If all searches fail, lack grounding, or JSON formatting fails, the app shows an error instead of a fake result.

Search grounding improves traceability, but does not independently audit financial accuracy. Review original filings, units, restatements, consolidation changes, and publication dates. This is an educational research tool, not a live quote terminal or investment recommendation engine.

## Part 4 — Production / AI Studio / Cloud Run

Test the same production entry point locally:

```sh
npm run build
npm start
```

`npm run build` creates the React assets in `dist/`. **The Node.js server is still required** for Gemini, Tavily, and Vietstock requests; publishing only `dist/` will not work.

This project uses the React + Node.js stack documented for [Google AI Studio full-stack apps](https://ai.google.dev/gemini-api/docs/aistudio-build-mode). Google documents [deployment from AI Studio to Cloud Run](https://ai.google.dev/gemini-api/docs/aistudio-deploying).

For AI Studio:

1. Import this project through the supported project/GitHub import workflow available in your AI Studio interface. Include source files and `package-lock.json`; exclude `.env`, `node_modules`, and `artifacts`.
2. Add `GEMINI_API_KEY` and `TAVILY_API_KEY` to the server-side secrets/environment. Set `GEMINI_MODEL` if your key uses another Search-capable Gemini model.
3. Use `npm run dev` for preview, `npm run build` for the frontend build, and `npm start` for production.
4. Deploy using AI Studio's Cloud Run flow. The app listens on `0.0.0.0` and honors the supplied `PORT`. Allow at least **300 seconds** for a research request at the hosting/proxy layer.

A multi-stage `Dockerfile` is included for Cloud Run or another Node container host:

```sh
docker build -t finscope .
docker run --rm -p 8080:8080 --env-file .env finscope
```

If `.env` defines `PORT=3000`, override it for this container command with `-e PORT=8080`. In cloud deployment, configure the API key as a runtime secret; do not bake it into the image. Cloud storage is unnecessary because reports are returned to the browser, not written to the container.

Cloud deployment is prepared but is **not automatically published** by local setup. AI Studio import behavior, Cloud Run deployment, and Docker execution must be verified in the destination environment.

## Part 5 — Checks and project map

```sh
npm test              # Offline API, Gemini, Tavily, and Vietstock tests
npm run build        # Production frontend build
npm run test:live     # Real Gemini FPT research; consumes API/Search quota
```

The live script saves a private local test artifact at `artifacts/live-report.json` and prints counts, never the key. Pass another company after `--` if desired.

| Location                      | Responsibility                                                   |
| ----------------------------- | ---------------------------------------------------------------- |
| `server/index.js`             | One-port development and production entry point                  |
| `server/app.js`               | Health endpoint, streamed research API, cancellation, errors     |
| `server/research.js`          | Gemini prompts, Search grounding, structured report generation   |
| `shared/report.js`            | Report contract, source/date validation, financial calculations  |
| `src/App.jsx`                 | Routing, research progress, browser history, shared report state |
| `src/pages.jsx`               | Home, Market, Analysis, and Price Targets                        |
| `server/localization.js`      | Gemini report text translation                                   |
| `src/useReportLanguage.js`    | Translation loading, retry, cancellation and session cache       |
| `src/News.jsx`                | Independent Tavily news page                                     |
| `src/i18n.jsx`, `src/vi.json` | English/Vietnamese UI and localized dates/numbers                |
| `server/providers.js`         | Tavily news and Vietstock history adapters                       |
| `src/components.jsx`          | Reusable cards, source links, charts, dialogs, export            |
| `src/styles.css`              | Figma colors, typography, layouts, responsive breakpoints        |
| `tests/`                      | API, provider orchestration, and financial edge cases            |

No login or production access-control system is included, as requested for the university demonstration.
