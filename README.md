# FinScope

A React + Node.js university demonstration app for Vietnamese companies and stocks. Home uses **Gemini with Google Search grounding as the core research engine**, with **at most three GenerateContent requests per company search**, including any manual formatting repair. Vietstock provides historical prices and supporting public evidence. News uses SerpApi Google News independently.

## Part 1 — Run locally

Use Node.js 22 or newer:

```sh
npm install
npm run dev
```

Open http://localhost:3000. One Node process serves the API and Vite frontend. Backend changes require a server restart; frontend changes use hot reload.

Create the project-root .env file:

```dotenv
GEMINI_API_KEY=your_key
GOOGLE_NEWS_API_KEY=your_serpapi_key
GEMINI_MODEL=your_available_gemini_model
PORT=3000
```

Spaces around = are accepted. GEMINI_MODEL is trimmed and used consistently; gemini-3.5-flash-lite is the fallback only when this setting is absent or blank. Existing process/cloud environment variables take precedence over .env. Restart after changes. Keys stay on the Node server, outside VITE variables. .env is excluded from Git and deployment uploads.

## Part 2 — Research flow

1. Choose Vietnamese (default) or English and enter a company/ticker and exchange.
2. One mandatory Gemini Google Search call researches identity, financials and business analysis. Usable source links and response text are required. If sentence-level mappings are absent, the section remains visible as **sources provided; individual claims not verified**. Gemini 2.5 calls use Search separately from structured JSON.
3. Retrieve supporting Vietstock financials, ratios, original PDFs and historical closing prices. Supporting retrieval can fail without discarding valid grounded company evidence. Reputable secondary publishers, including Vietstock and CafeF, are accepted when original filings are unavailable. Conflicting grounded/direct financial figures remain separate with their sources; banking formats remain unavailable when the parser cannot identify them.
4. Make a second grounded broker-report search only when valuation is relevant to a listing and the core evidence does not already cover targets. It can be skipped. A final structured formatting call combines mapped claims and supporting evidence.
5. Validate source IDs, company identity, dates, reported periods, units/currency, numeric evidence and individual broker targets in Node. No separate Gemini audit call. Annual, standalone quarterly and YTD records remain distinct, with units and accounting scopes explicitly labeled. Missing fields remain unavailable without removing the useful record. Older evidence includes its date and freshness label. Conflicts retain each sourced figure and an explanation; they are never silently averaged. Unsupported numbers, wrong-company data, invalid sources and impossible dates are rejected. Growth uses only matching, sufficiently attributable periods. These checks do not independently verify the publisher.
6. Every attempted GenerateContent call counts, including failed, truncated and malformed output. The server stops at **three calls**. There are no automatic retries, model switches or repair calls. On a later-stage failure, available supporting facts/chart remain visible with a warning. A manual formatting continuation can reuse the snapshot only when an unused slot remains; it shares the original budget and never repeats Search or provider retrieval. After the budget is exhausted, the UI asks for a new explicit Home search. Core Search failure returns a clear error.
7. Successful results and partial snapshots cache for **30 minutes** (maximum 50). Provider retrieval caches for 15 minutes. Language changes do not secretly call Gemini: interface labels change, existing research text retains its original language with a notice; use an explicit Home search for research in a different language. Browser-saved reports remain readable without new research. Cache loss/expiry means a new search is needed for server continuation.

Stage budgets are 16,000 tokens for company research, 12,000 for broker research and 20,000 for formatting, clamped to both the configured model's reported output limit and the **36,000-token ceiling**. A cached SDK model-metadata lookup is not a GenerateContent/inference request. Thinking tokens consume the output allowance: Gemini 2.5 uses a 2,048 thinking budget for Search and zero for Flash/Lite formatting (Pro retains its required minimum 128); Gemini 3 uses LOW thinking. Thinking budgets guide allocation rather than promising an exact token count. Token usage is recorded by stage. No API tier is guessed from the key: run a live grounding probe with the current credentials to confirm actual access. A successful probe confirms current access, not future capacity or a named billing tier.

The latest five reports are saved in browser storage. Opening a saved report does not run research again. Embedded price snapshots remain dated snapshots; if unavailable, the chart can independently retry Vietstock. Changing 1W/1M/3M/6M/1Y filters existing prices. Available sources are expandable; financial tables show all available periods without footer instructions. Empty peer grids and target statistic cards are omitted.

Target statistics use the latest eligible target per firm within a fixed one-year snapshot window, supported report dates and confirmed share-basis comparability. Listing dates are labeled separately. Partial reports and dated targets with unknown comparability remain visible, but unknown comparability, conflicting values and unmapped claims are excluded from consensus/upside. The simplified broker table shows firm, date, target and source without a time selector or eligibility badges. Source titles and original evidence retain publisher wording.

For matching-period/unit/scope financial conflicts, the main table prioritizes Vietstock, preferring directly retrieved rows over grounded secondary copies. Alternative values remain in the conflict details and exported evidence; they are not averaged. Saved reports apply the same preference without new API calls. The growth card remains visible when switching annual/quarterly/YTD and explains when no comparable prior-year figures exist. Sidebar and broker sources are collapsed by default. Explicit prices in Vietstock listing titles are shown as listing-derived targets, with listing dates separate from original report dates and no inferred comparability. Broker reasoning expands only when thesis, assumptions or risk content is available.

## Part 3 — Independent News

Supporting Vietstock financial retrieval requests up to three quarterly pages and retains the latest 12 valid quarterly/YTD records, keeping page-specific value columns, dates, units and accounting scopes intact. A failed older page preserves fetched data; repeated pages stop pagination. Annual history remains separately bounded to four records. Latest periods appear first in the financial table. Existing saved reports keep their original snapshot; start a new Home search to retrieve expanded history. These are public-data requests and do not add Gemini inference calls.

News requires a supported Vietnamese company name or ticker and GOOGLE_NEWS_API_KEY issued by SerpApi. It makes up to four bounded Google News searches per uncached query/window: general company coverage, financial results, corporate actions and older-window or Vietstock coverage. Public Vietstock articles supplement results when accessible. Domain, company relevance and date filters apply; results are deduplicated and sorted newest first. Optional article excerpts/images remain source material, never proof of numeric financials or target prices.

Select a time window and press Search News. Changing the window alone does not search. Results persist across navigation/reload and server searches cache for 15 minutes. News does not call Gemini or require a Home report.

News excludes downloadable disclosure files and distinguishes FPT Corporation from FPT Retail/Shop-only coverage. If the backend is unreachable, the interface asks you to start the local server and retry. Use the actual port printed at startup; an old browser tab on a different port will not reach this server.

## Part 4 — Production / AI Studio / Cloud Run

```sh
npm run build
npm start
```

The build produces dist/, but the Node server is still required for providers and analysis. Static-only hosting will not work. The existing Dockerfile builds React and runs the Node service on 0.0.0.0 using the platform PORT.

Import source files and package-lock.json into the supported AI Studio project workflow; exclude .env, node_modules and artifacts. Set GEMINI_API_KEY, GOOGLE_NEWS_API_KEY and GEMINI_MODEL as server-side secrets/environment. Use npm run dev for preview, npm run build for build, and npm start for production. Allow up to 600 seconds for the bounded grounded workflow.

For a classroom Cloud Run deployment, use one instance if cached analysis retry must survive navigation reliably. Provider caches and analysis snapshots are process memory and disappear on restart; they are not a database. Multiple instances can return cache-expired responses because requests may reach another instance. Browser-saved facts remain available. Cloud execution has not been verified in this workspace.

```sh
docker build -t finscope .
docker run --rm -p 8080:8080 --env-file .env finscope
```

## Part 5 — Verify

```sh
npm test
npm run build
npm run test:live -- "FPT (HOSE)"
npm run test:news:live
```

The company live check uses up to three GenerateContent requests and saves artifacts/live-grounded-report.json, including stage token usage and report status. The separate npm run test:grounding:live command makes one small diagnostic Search request using the configured model/key; it is not part of a Home search. The News check consumes SerpApi quota without Gemini calls.

See VERIFICATION.md for current offline, live and browser evidence. This app is for education; reported figures and AI interpretations must be checked against original publications before any consequential use.
