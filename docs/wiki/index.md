---
type: Index
description: Static HTML/CSS/JS CV builder with an embedded LangChain tool-calling AI chat assistant; no build step, CDN-loaded dependencies, GitHub Pages deploy
---

<wiki-type>repo</wiki-type>
<scan-sha>2a5dbda3f932b9c65a3800732b60e6245b8e2a5a</scan-sha>
<wiki-schema>1</wiki-schema>

# Project signals

## Framework & runtime

Static HTML/CSS/JS website, no build step, no bundler — everything loads from CDNs at runtime (Monaco Editor 0.52.2, markdown-it 14.1.0, Zod 3.23.8, Font Awesome 7.0.1, LangChain JS `@langchain/{openai,anthropic,google-genai}`/`@langchain/core`, Dexie 4.0.11, `@logosdx/observer` 2.2.0, `@logosdx/utils` 6.0.0, Puter.js v2). `assets/js/*.js` are native ES modules imported directly by the browser. The AI chat agent supports a `fireworks` provider in addition to `openai`/`anthropic`/`google-genai`, implemented by reusing the OpenAI LangChain adapter with a `baseURL` override rather than a separate CDN package. [`package.json`](../../package.json) declares two local `devDependencies` used only for repo tooling — `http-server` (local dev server) and `playwright` (headless test/screenshot driver, see [`docs/wiki/dev-tooling.md`](dev-tooling.md)) — neither ships to the deployed site. Persistence: `localStorage` for CV data/editor state, IndexedDB (via Dexie) for AI chat history/settings/documents. No backend server.

## Build / test / lint

| Purpose | Command | Source |
|---------|---------|--------|
| Local dev server | `npm start` (→ `http-server ./ -c-1 -o`) | [`package.json`](../../package.json) |
| Automated check | `node .claude/skills/run-cv-generator/driver.mjs smoke` — 16 Playwright-driven assertions against the real running app (not a unit/CI test suite; run manually or by an agent after touching [`assets/js/`](../../assets/js)) | [`.claude/skills/run-cv-generator/driver.mjs`](../../.claude/skills/run-cv-generator/driver.mjs), [`docs/wiki/dev-tooling.md`](dev-tooling.md) |
| Cache-bust version check | `npm run check-version` (`node scripts/bump-version.mjs --check`) — exits 1 if any `?v=` reference has drifted from [`assets/js/version.js`](../../assets/js/version.js) | [`scripts/bump-version.mjs`](../../scripts/bump-version.mjs) |
| Cache-bust version bump | `npm run bump` (`node scripts/bump-version.mjs`) — auto-bumps and rewrites every `?v=` reference plus the `VERSION` literal | [`scripts/bump-version.mjs`](../../scripts/bump-version.mjs) |
| Lint | none configured | (no lint config present) |

No CI pipeline is configured (no `.github/workflows/`). Deploy is static hosting via GitHub Pages ([`CNAME`](../../CNAME) file present at repo root).

## Language breakdown

| Language | LOC | Files | % |
|----------|-----|-------|---|
| JavaScript | 7335 | 29 | 64% (60% of files) |
| CSS | 2132 | 10 | 18% (20% of files) |
| Markdown | 1090 | 5 | 9% (10% of files) |
| YAML | 434 | 1 | 3% (2% of files) |
| HTML | 208 | 1 | 1% (2% of files) |
| Shell | 69 | 1 | 0% (2% of files) |
| JSON | 20 | 1 | 0% (2% of files) |

## DevOps & CI

- Deploy target: GitHub Pages, custom domain via [`CNAME`](../../CNAME).
- No automated CI/CD — deploys are a static push to the Pages branch/source (no workflow file in repo).
- Cache-busting is now automated via `node scripts/bump-version.mjs` (aliased as `npm run bump`), which rewrites the `VERSION` string in [`assets/js/version.js`](../../assets/js/version.js), the `<script type="module">` tag in [`index.html`](../../index.html), and every `?v=` import query string across `assets/js/**` in one pass; `npm run check-version` verifies there is no drift. See [`docs/wiki/dev-tooling.md`](dev-tooling.md).
- `node .claude/skills/run-cv-generator/driver.mjs screenshots` (aliased `docshots`) regenerates the README hero [`screenshot.png`](../../screenshot.png) from a clean default render; this is a manual/agent-run step, not wired into any CI.

## Domains

| Domain | Repo paths | One-liner | Detail |
|--------|------------|-----------|--------|
| cv-data | [`assets/js/config.js`](../../assets/js/config.js), [`assets/js/validation.js`](../../assets/js/validation.js), [`assets/js/cv-renderer.js`](../../assets/js/cv-renderer.js), [`assets/js/storage.js`](../../assets/js/storage.js), [`assets/js/markdown.js`](../../assets/js/markdown.js), [`assets/js/exports.js`](../../assets/js/exports.js) | CV data model, Zod validation, DOM rendering, localStorage, CVML import/export | [`docs/wiki/cv-data.md`](cv-data.md) |
| editor-shell | [`assets/js/main.js`](../../assets/js/main.js), [`assets/js/editor.js`](../../assets/js/editor.js), [`assets/js/split-pane.js`](../../assets/js/split-pane.js), [`assets/js/keyboard.js`](../../assets/js/keyboard.js), [`assets/js/action-menu.js`](../../assets/js/action-menu.js), [`assets/js/modal.js`](../../assets/js/modal.js), [`assets/js/toast.js`](../../assets/js/toast.js), [`assets/js/ui-utils.js`](../../assets/js/ui-utils.js), [`assets/js/observable.js`](../../assets/js/observable.js), [`assets/js/utils.js`](../../assets/js/utils.js) | App bootstrap, Monaco editor, UI chrome, shared event bus/utilities | [`docs/wiki/editor-shell.md`](editor-shell.md) |
| styles | [`assets/js/styles.js`](../../assets/js/styles.js), [`assets/css/`](../../assets/css) | CSS design tokens and the default/custom style loading system | [`docs/wiki/styles.md`](styles.md) |
| ai-chat | [`assets/js/ai/`](../../assets/js/ai), [`assets/js/db/db.js`](../../assets/js/db/db.js) | LangChain tool-calling agent (openai/anthropic/google-genai/fireworks), human-approval-gated edits, streaming chat UI, IndexedDB persistence | [`docs/wiki/ai-chat.md`](ai-chat.md) |
| dev-tooling | [`scripts/bump-version.mjs`](../../scripts/bump-version.mjs), [`.claude/skills/run-cv-generator/`](../../.claude/skills/run-cv-generator) | Cache-busting version bump script and a Playwright headless test/screenshot driver packaged as a Claude Code skill | [`docs/wiki/dev-tooling.md`](dev-tooling.md) |

## Cross-cutting

- Domain partitioning basis: vertical slices by functional concern. `dev-tooling` is new this refresh — [`.claude/skills/run-cv-generator/`](../../.claude/skills/run-cv-generator) and [`scripts/bump-version.mjs`](../../scripts/bump-version.mjs) are repo-maintenance tooling (test driver + cache-bust automation), not app code, so they were split out from the domains they exercise rather than folded into `editor-shell`.
- The `ai-chat` domain's architecture changed substantially on this branch: the prior 5-way intent classifier + two-phase propose/accept tool pattern was replaced with a single tool-calling loop where `edit_cv`/`edit_styles` arguments ARE the change, gated by a human approval dialog (`#requestApproval`); a `fireworks` provider was added; streaming performance changes (throttled markdown rendering) landed in [`assets/js/ai/ui.js`](../../assets/js/ai/ui.js). [`docs/wiki/ai-chat.md`](ai-chat.md) was fully rewritten (not incrementally patched) to reflect current source.
- No test directory exists in this repo; there is still no unit/CI test framework, but `.claude/skills/run-cv-generator/driver.mjs smoke` is now a real automated (Playwright-driven) verification path — see [`docs/wiki/dev-tooling.md`](dev-tooling.md).
- [`docs/design/`](../design) and [`docs/spec/`](../spec) exist but contain only `.gitkeep` placeholders — no design docs or specs have been written yet.
- Deterministic scan substrate: [`docs/wiki/scan.md`](scan.md) (not `@-ref`'d; regenerate via `atomic signals scan`).
- Steering: [`docs/wiki/CLAUDE.md`](CLAUDE.md) exists but its `## Framework`/`## Domains`/`## Build`/`## Ignore for domains` sections are empty (scaffold only) — no steering overrides were applied to this inference run.
- This refresh ran in full-reinfer mode: the committed [`docs/wiki/scan.md`](scan.md) differed from the working-tree scan by 100% of its line count (77/77 lines changed), well past the ~20% incremental threshold, so every domain was re-verified against current source rather than patched incrementally.
