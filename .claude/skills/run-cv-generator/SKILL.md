---
name: run-cv-generator
description: Build, run, and drive the CV Generator static site. Use when asked to start or serve the app, take a screenshot of the CV or the editor, verify a change works in the real running app, drive the Monaco editor / Styles tab / AI Chat tab, or exercise CVML and PDF export.
---


CV Generator is a static site — no build step, no bundler. It is driven headlessly through `.claude/skills/run-cv-generator/driver.mjs` (Playwright + Chromium), which spawns its own `http-server`, waits for the app to actually finish booting, and exposes commands for editing the CV, applying styles, screenshotting, and exporting. Start with `driver.mjs smoke`; use `repl.sh` when you need to poke at a live page across several steps.

All paths below are relative to the repo root.


## Prerequisites


Node and pnpm (macOS, Darwin 25.5.0, arm64, node v24.13.0).

    pnpm install
    npx playwright install chromium

Poppler supplies `pdftoppm`, which turns the print PDF into per-page PNGs. Without it the `print` command still works but falls back to a single continuous paper-width screenshot with no page breaks.

    brew install poppler

`playwright@1.61.1` is a devDependency added for this driver. `npx playwright install chromium` is a no-op if the browser is already in `~/Library/Caches/ms-playwright/`.


## Run (agent path)


### One-shot verification


Sixteen assertions against the real app: default render, JS edit + apply, markdown parsing, localStorage persistence, Zod rejection path, print-media chrome hiding, print capture on base styles and again on custom CSS, CSS apply, AI tab, help modal, CVML export, fullscreen, reload persistence. Screenshots and print sheets land in `tmp/run-shots/` (gitignored).

    node .claude/skills/run-cv-generator/driver.mjs smoke

First run takes ~9s while the CDN cache fills; after that it's ~3s. Actual output:

    [driver] serving ... at http://127.0.0.1:53739
    PASS  default CV renders  — #name="Jane Anderson"
    PASS  default sections render  — experience,education,skills,certifications
          .../tmp/run-shots/01-initial.png
    PASS  JS edit + apply re-renders CV  — #name="Ada Lovelace" toasts=["CV saved!\n\n×"]
    PASS  markdown parsed in summary
    PASS  result persisted to localStorage
          .../tmp/run-shots/02-custom-cv.png
    PASS  invalid CV rejected with toast  — ["Validation failed: personal.email: Required ..."]
    PASS  print media hides editor chrome  — screen={"editor":"flex",...} print={"editor":"none",...}
    PASS  print capture paginates on base styles  — 1 page(s)
          .../tmp/run-shots/03-print-base.pdf
          .../tmp/run-shots/03-print-base-page-1.png
    PASS  CSS edit + apply restyles CV  — color=rgb(255, 0, 85)
    PASS  AI tab loads settings screen
    PASS  help modal renders README content  — 11145 chars
    PASS  CVML export downloads  — .../tmp/run-shots/ada-lovelace-cv-2026-07-23.cvml
    PASS  print capture with custom CSS  — 1 page(s)
    PASS  fullscreen toggle sets class  — split-view-container fullscreen-cv
    PASS  toggleFullscreen no longer throws (editor:fullscreen listener fixed)
    PASS  CV + styles survive reload  — Ada Lovelace / rgb(255, 0, 85)

    16/16 checks passed

Exit code is non-zero if any check fails.


### One screenshot


    node .claude/skills/run-cv-generator/driver.mjs shot my-name


### Public-doc screenshots


Regenerate the images the README and public docs use. The hero — repo-root `screenshot.png`, referenced by `README.md` — is captured from a clean default render (no personal data, no API keys), so it stays accurate and reproducible. Candidate shots for the styles, AI-settings, and approval surfaces land in `tmp/run-shots/docs/`; adopt any into the docs by copying the file in.

    node .claude/skills/run-cv-generator/driver.mjs screenshots

    hero -> .../screenshot.png
    candidates -> .../tmp/run-shots/docs/
      .../screenshot.png
      .../tmp/run-shots/docs/02-styles.png
      .../tmp/run-shots/docs/03-ai-settings.png
      .../tmp/run-shots/docs/04-ai-approval.png

`screenshot.png` is the only committed output — the `docs/` candidates are staging (`tmp/` is gitignored). The approval shot renders the real `approvalDialog` template (no live LLM needed), so its diff styling is exactly what production loads. `docshots` is an alias for the same command.


### What printing looks like


`⌘P` can't be driven headlessly, so this is the stand-in: Chromium paginates under `print.css`, then `pdftoppm` rasterizes each sheet to a PNG you can actually open. Custom CSS is cleared first, so the capture is base styles only — `base.css` + `cv.css` + `print.css`.

    node .claude/skills/run-cv-generator/driver.mjs print base-default

    paper: Letter  styles: base (base.css + cv.css + print.css)
    pdf:   .../tmp/run-shots/base-default.pdf
    pages: 2
           .../tmp/run-shots/base-default-page-1.png
           .../tmp/run-shots/base-default-page-2.png

**The check that matters is a real resume.** The bundled fixtures are one page each and hide every pagination problem. Point `--cvml` at any `.cvml` the app has exported — it parses with the same two regexes `exports.js` uses and applies the file's own `[cv-styles]` block. Add `--base-styles` to ignore those and see the same content under the defaults. Real exports hold personal data; keep them outside the repo (`tmp/` and `~/Downloads` are both fine, `tmp/` is gitignored).

    node .claude/skills/run-cv-generator/driver.mjs print real-resume --cvml ~/Downloads/your-cv.cvml
    node .claude/skills/run-cv-generator/driver.mjs print real-base --cvml ~/Downloads/your-cv.cvml --base-styles

Run against a 7-section, 15-year resume this produced 17 Letter pages — which is how the orphaned-continuation problem below became visible at all.

### What size the type actually resolves to


`print.css` retunes the rem root, so reading the CSS tells you very little about what lands on paper. `sizes` reads `getComputedStyle().fontSize` off the live DOM in both media. It takes the same `--cvml` / `--cv` / `--css` / `--base-styles` flags as `print`, and echoes the `#name` it measured so there's no doubt which document produced the numbers.

    node .claude/skills/run-cv-generator/driver.mjs sizes
    node .claude/skills/run-cv-generator/driver.mjs sizes --cvml ~/Downloads/your-cv.cvml

    styles: base (base.css + cv.css + print.css)
    name:   Jane Anderson

    element           screen              print
    root              16px / 12.0pt       14px / 10.5pt
    body line-height  25.6px              18.9px
    h1 (name)         32px / 24.0pt       22.4px / 16.8pt
    ...
    tag               13px / 9.8pt        10.5px / 7.9pt

Running it with and without `--base-styles` on the same export is the fastest way to see which rules a saved `[cv-styles]` block is shadowing.

Feed it a different CV, a stylesheet to compare against, or A4:

    node .claude/skills/run-cv-generator/driver.mjs print grace-a4 --cv .claude/skills/run-cv-generator/example-cv.js --paper A4
    node .claude/skills/run-cv-generator/driver.mjs print custom-css --css .claude/skills/run-cv-generator/example-styles.css

`--css <file>` skips the base-styles reset and applies that file through the Styles tab first — that is an *override* layer, not a replacement, because `index.html` also `<link>`s the three default stylesheets. Sheets are re-rasterized from scratch on every run, so a shorter CV won't leave a stale `-page-3.png` behind.


### A batch of commands


Pipe them into the REPL — it exits on `quit`.

    node .claude/skills/run-cv-generator/driver.mjs repl <<'EOF'
    cv .claude/skills/run-cv-generator/example-cv.js
    text #name
    eval document.querySelectorAll('#sections > section').length
    tab css
    ss repl-check
    quit
    EOF


### A live session across several tool calls


There is no tmux on this machine, so `repl.sh` keeps the page alive behind a FIFO instead. `send` prints only what appeared since the last `send`.

    ./.claude/skills/run-cv-generator/repl.sh start
    ./.claude/skills/run-cv-generator/repl.sh send 'text #name' 'cv .claude/skills/run-cv-generator/example-cv.js' 'text #name' 'ss after'
    ./.claude/skills/run-cv-generator/repl.sh log
    ./.claude/skills/run-cv-generator/repl.sh stop


### REPL commands


- `open [path]` / `reload` — load and wait until Monaco and the CV are both up
- `ss <name>` — screenshot to `tmp/run-shots/<name>.png`
- `tab js|css|ai` — `setEditorMode(...)`
- `set <file>` / `get` — write/read the Monaco buffer
- `apply` — `applyChanges()`, prints the resulting toasts
- `cv <file>` — `set` + `apply`
- `cvml <file>` — load a real `.cvml` export, data plus its `[cv-styles]`
- `eval <js>` / `text <sel>` / `html <sel>` / `click <sel>` / `toasts`
- `reset` — `resetData()` (the `confirm()` is auto-accepted)
- `size <w> <h>` — viewport
- `basestyles` — drop custom CSS and reload on the defaults
- `print <name> [Letter|A4]` — paginated PDF plus one PNG per sheet
- `quit`


### Flags


- `--headed` — real window instead of headless
- `--url http://127.0.0.1:8127` — drive an already-running server instead of spawning one
- `--port <n>` — pin the spawned server's port (default: an ephemeral free port)
- `--keep-storage` — don't wipe `localStorage` on first load
- `--no-cdn-cache` — bypass the disk cache; see Gotchas before using this


## Run (human path)


    node_modules/.bin/http-server ./ -c-1 -p 8127 --silent

`pnpm start` is the same thing plus `-o` (auto-opens your default browser). It does not use a fixed port: on this machine nginx holds 8080, so it announced `http://127.0.0.1:8081`. Read the port out of its output rather than assuming.


## Test


There is no test suite. `driver.mjs smoke` is the only automated check that exists — run it after touching anything in `assets/js/`.


## Gotchas


**The whole app hard-blocks on Monaco loading from jsdelivr.** `main.js` awaits `initializeEditor()` before rendering the CV or assigning any `window.*` global. If the jsdelivr request for `vs/editor/editor.main` stalls — which it does intermittently — you get a blank CV pane, `window.applyChanges === undefined`, and *no console error*. Measured on this machine: 48.8s uncached (and 1-in-4 cold loads never completed within 15s) versus 736ms with the driver's disk cache. `driver.mjs` caches every cross-origin GET under `tmp/cv-cdn-cache/` and retries the load three times. Only pass `--no-cdn-cache` if you are specifically testing CDN behavior.

**Don't wait on `DOMContentLoaded` or a CSS selector.** The readiness condition is `typeof window.applyChanges === 'function' && window.monaco.editor.getEditors().length > 0 && #name` non-empty. `driver.mjs`'s `open()` uses exactly that.

**There is no window handle on the Monaco instance.** `getEditor()` is exported from `editor.js` but never attached to `window`. Reach it via `window.monaco.editor.getEditors()[0].setValue(...)`.

**`applyChanges()` never throws.** It catches everything and emits `editor:save:error`, which surfaces only as a toast. To find out whether an apply worked, read `.toasts aside` — success is `"CV saved!"`, failure is `"Validation failed: ..."`. The driver's `apply()` returns that array.

**`window.toggleFullscreen()` used to throw — now fixed.** `editor.js`'s `on('editor:fullscreen', ...)` listener now takes the payload directly, because LogosDX `ObserverEngine` hands *exact-name* listeners the payload (not a `{ event, data }` envelope — only regex listeners like `toast.js:88`'s `on(/error/, ({ event, data }) => ...)` get that). Before the fix it destructured `({ data })`, so `data` was `undefined` and the handler died with `Cannot read properties of undefined (reading 'isFullscreen')` — though the class was mutated before the emit, so the UI still toggled and a human never noticed. Note `main.js:75`'s `on('ai:cv-applied', ({ data }) => ...)` has the *old* shape but works because that emitter nests its payload under `data`. The driver still wraps the call in try/catch defensively and asserts on `.split-view-container`'s class.

**First visit pops the help modal over everything.** The driver seeds `localStorage['cv-first-visit'] = 'true'` via an init script before the page runs.

**`resetData()` calls `confirm()`.** The driver auto-accepts every dialog.

**The AI Chat tab can't be exercised without an API key.** With no provider settings in IndexedDB, `setEditorMode('ai')` renders the `.ai-settings` screen — that's the furthest the smoke test goes. Everything downstream (intent classification, tools, proposals) needs a real key in Settings.

**Analytics requests hang.** `analytics.google.com` and `stats.g.doubleclick.net` reliably stall or reset under a fresh Chromium profile. The driver aborts anything matching `googletagmanager|google-analytics|analytics.google|doubleclick`.

**`print.css` doesn't hide `.toasts`.** It hides `.editor-panel`, `.editor-pane`, `.divider`, `.action-menu-container` and `footer`, but a live toast sits on top of the CV and prints with it — I caught a "CV saved!" bubble baked into a capture after ⌘S. `capturePrint()` empties the toast container first so captures are deterministic; a user who hits ⌘S then ⌘P inside the dismiss window will still see it on paper.

**Don't pass `margin` to `page.pdf()`.** `print.css` ends with `@page { margin: 0.4in }`, and a `margin` option silently overrides it — the capture would stop matching what ⌘P produces. The driver passes `preferCSSPageSize: true` and no margins.

**An item longer than a page loses its heading on every continuation page.** `print.css` guards `.item .header` with `break-after: avoid` and the first/last `li`, but nothing carries context forward once a single role's bullet list overruns the sheet. On the default Jane Anderson CV this is mild — one stranded bullet opens page 2. On a real 15-year resume it's the dominant defect: the first role's 20-odd bullets fill all of page 2 with no job title, employer, or dates anywhere on the sheet. Reproduce with `print base-default`, or at full scale with `print --cvml`.

**Local JS edits show up without bumping `?v=`.** `http-server -c-1` sends no-cache and every driver run gets a fresh browser profile — verified by editing `assets/js/config.js` and seeing the change on the next `open`. The `?v=` bump described in `CLAUDE.md` still matters for the deployed GitHub Pages site; it just isn't a prerequisite for driving your change locally.


## Troubleshooting


`app never became ready: page.waitForFunction: Timeout 45000ms exceeded`
— jsdelivr stalled. Re-run; the disk cache normally resolves it. Confirm the cache is populated with `ls tmp/cv-cdn-cache | wc -l` (34 files after one cold `smoke`, 36 once the Monaco workers and fonts have also been pulled). If it's empty, you passed `--no-cdn-cache` or the first run never got through.

`http-server missing — run \`pnpm install\` first`
— `node_modules/` is absent.

`Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'playwright'`
— the script was copied outside the repo. `driver.mjs` must stay under the repo root so Node resolves `playwright` from `node_modules/`.

`no session — run './.claude/skills/run-cv-generator/repl.sh start' first`
— `repl.sh send` was called without a live FIFO. A bare `echo cmd > tmp/run-repl/cmd` also won't work: closing the write end sends EOF and the REPL exits, which is why `start` parks a `sleep 86400` on the pipe.

`ERR: unknown command '<x>' (try 'help')`
— send `help` to list the REPL verbs.
