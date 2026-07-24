---
type: Index
description: Static, no-build CV/resume generator with a Monaco JS/CSS editor and a LangChain-powered AI chat assistant
---

<wiki-type>repo</wiki-type>
<scan-sha>b5239b190860ecbec875b1150b4b520011cb89eb</scan-sha>
<wiki-schema>1</wiki-schema>

# Project signals

## Framework & runtime

Static HTML/CSS/JS website, no build step, no bundler, no npm dependencies installed locally — everything loads from CDNs at runtime (Monaco Editor 0.52.2, markdown-it 14.1.0, Zod 3.23.8, Font Awesome 7.0.1, LangChain JS `@langchain/{openai,anthropic,google-genai}`/`@langchain/core`, Dexie 4.0.11, `@logosdx/observer` 2.2.0, `@logosdx/utils` 6.0.0, Puter.js v2). `assets/js/*.js` are native ES modules imported directly by the browser. [`package.json`](../../package.json) only declares a dev-only `http-server` dependency for local serving. Persistence: `localStorage` for CV data/editor state, IndexedDB (via Dexie) for AI chat history/settings/documents. No backend server.

## Build / test / lint

| Purpose | Command | Source |
|---------|---------|--------|
| Local dev server | `npm start` (→ `http-server ./ -c-1 -o`) | [`package.json`](../../package.json) |
| Tests | none — manual browser testing only | (no test framework or config present) |
| Lint | none configured | (no lint config present) |

No CI pipeline is configured (no `.github/workflows/`). Deploy is static hosting via GitHub Pages ([`CNAME`](../../CNAME) file present at repo root).

## Language breakdown

| Language | LOC | Files | % |
|----------|-----|-------|---|
| JavaScript | 6480 | 26 | 64% (61% of files) |
| CSS | 1841 | 9 | 18% (21% of files) |
| Markdown | 1053 | 4 | 10% (9% of files) |
| YAML | 405 | 1 | 4% (2% of files) |
| HTML | 208 | 1 | 2% (2% of files) |
| JSON | 16 | 1 | 0% (2% of files) |

## DevOps & CI

- Deploy target: GitHub Pages, custom domain via [`CNAME`](../../CNAME).
- No automated CI/CD — deploys are a static push to the Pages branch/source (no workflow file in repo).
- Cache-busting is manual: every JS change requires bumping the `VERSION` string in [`assets/js/version.js`](../../assets/js/version.js), the `<script type="module">` tag in [`index.html`](../../index.html), and every `?v=` import query string across `assets/js/**` (documented in the project's own [`CLAUDE.md`](../../CLAUDE.md)).

## Domains

| Domain | Repo paths | One-liner | Detail |
|--------|------------|-----------|--------|
| cv-data | [`assets/js/config.js`](../../assets/js/config.js), [`assets/js/validation.js`](../../assets/js/validation.js), [`assets/js/cv-renderer.js`](../../assets/js/cv-renderer.js), [`assets/js/storage.js`](../../assets/js/storage.js), [`assets/js/markdown.js`](../../assets/js/markdown.js), [`assets/js/exports.js`](../../assets/js/exports.js) | CV data model, Zod validation, DOM rendering, localStorage, CVML import/export | [`docs/wiki/cv-data.md`](cv-data.md) |
| editor-shell | [`assets/js/main.js`](../../assets/js/main.js), [`assets/js/editor.js`](../../assets/js/editor.js), [`assets/js/split-pane.js`](../../assets/js/split-pane.js), [`assets/js/keyboard.js`](../../assets/js/keyboard.js), [`assets/js/action-menu.js`](../../assets/js/action-menu.js), [`assets/js/modal.js`](../../assets/js/modal.js), [`assets/js/toast.js`](../../assets/js/toast.js), [`assets/js/ui-utils.js`](../../assets/js/ui-utils.js), [`assets/js/observable.js`](../../assets/js/observable.js), [`assets/js/utils.js`](../../assets/js/utils.js) | App bootstrap, Monaco editor, UI chrome, shared event bus/utilities | [`docs/wiki/editor-shell.md`](editor-shell.md) |
| styles | [`assets/js/styles.js`](../../assets/js/styles.js), [`assets/css/`](../../assets/css) | CSS design tokens and the default/custom style loading system | [`docs/wiki/styles.md`](styles.md) |
| ai-chat | [`assets/js/ai/`](../../assets/js/ai), [`assets/js/db/db.js`](../../assets/js/db/db.js) | LangChain tool-calling agent, chat UI, IndexedDB persistence | [`docs/wiki/ai-chat.md`](ai-chat.md) |

## Cross-cutting

- Domain partitioning basis: vertical slices by functional concern, corroborated with `atomic code explore`/`atomic code callers`/`atomic code callees` against the code-intel index at `.claude/.atomic-index/atomic.db` — import edges (e.g. `editor.js` → `cv-renderer.js`/`config.js`, `exports.js` → `cv-renderer.js`/`editor.js`, `ai/ui.js` → `cv-renderer.js`/`db.js`) confirmed the grouping below directory names.
- No test directory exists in this repo; all testing is manual via browser (confirmed — no `test/`, `tests/`, or `*.test.js` files found).
- [`docs/design/`](../design) and [`docs/spec/`](../spec) exist but contain only `.gitkeep` placeholders — no design docs or specs have been written yet.
- Deterministic scan substrate: [`docs/wiki/scan.md`](scan.md) (not `@-ref`'d; regenerate via `atomic signals scan`).
- Steering: [`docs/wiki/CLAUDE.md`](CLAUDE.md) exists but its `## Framework`/`## Domains`/`## Build`/`## Ignore for domains` sections are empty (scaffold only) — no steering overrides were applied to this inference run.
