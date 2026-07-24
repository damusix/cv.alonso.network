---
type: Domain
description: CV data model, Zod validation, DOM rendering, localStorage persistence, and CVML import/export
---

# cv-data

## What it does

Defines the CV data shape and its default sample content, validates arbitrary user-authored data against a Zod schema, renders validated data into the CV preview DOM, persists code/data/styles to `localStorage`, and reads/writes the `.cvml` file format. `applyChanges()` in [`assets/js/editor.js`](../../assets/js/editor.js) is the entry point that ties these together: evaluate user JS via `Function()`, validate with `CVDataSchema`, save, then render.

## CLI code

- [`assets/js/config.js`](../../assets/js/config.js) — exports `STORAGE_CODE_KEY`/`STORAGE_RESULT_KEY`/`STORAGE_MODE_KEY`/`STORAGE_STYLES_KEY` localStorage key constants, `defaultMessage` (welcome comment block shown in a fresh editor), and `cvData` (the sample/default CV data object with `personal`, `summary`, `sections`)
- [`assets/js/validation.js`](../../assets/js/validation.js) — Zod schemas: `LinkSchema`, `PersonalSchema`, `SectionItemSchema`, `SectionSchema`, `CVDataSchema`; all built with `.strict()` so unknown keys are rejected; required fields include `personal.name`, `personal.email` (`.email()`), `personal.phone`, `personal.location`, and at least one section with at least one item (`SectionSchema.items` uses `.min(1)`, `CVDataSchema.sections` uses `.min(1)`)
- [`assets/js/cv-renderer.js`](../../assets/js/cv-renderer.js) — `getDocumentTitle(data)` builds a `Name-CV-YYYY-MM-DD` slug used for both `document.title` and export filenames; `renderHeader`, `renderSummary`, `renderSection` build DOM nodes from validated data; `renderCV(data)` is the top-level entry that clears `#sections` and re-renders header, summary, and each section; markdown fields (`summary`, item `subtitle`, item `content`) are parsed via `parseMarkdown` from [`assets/js/markdown.js`](../../assets/js/markdown.js)
- [`assets/js/markdown.js`](../../assets/js/markdown.js) — wraps `window.markdownit` (loaded from CDN in [`index.html`](../../index.html)); `parseMarkdown()` uses `md.renderInline()` (html: false, breaks: false) for inline CV content; `renderMarkdown()` uses block-level `md.render()`; `renderDocMarkdown()` uses a second `markdown-it` instance (`mdDoc`, html: true, breaks: true) for full documents like modals
- [`assets/js/storage.js`](../../assets/js/storage.js) — thin `localStorage` wrapper: `loadSavedData()`/`saveCVData()`/`clearSavedData()` for the raw code + parsed result pair, `saveEditorMode()`, `loadSavedStyles()`/`saveStyles()`/`clearSavedStyles()`, plus editor state (`saveEditorState`/`loadEditorState`), per-mode draft management (`saveDraft`/`loadDraft`/`clearDraft`/`hasDraft`/`clearAllDrafts`), and per-mode cursor position (`saveCursorPosition`/`loadCursorPosition`/`clearCursorPosition`/`clearAllCursorPositions`)
- [`assets/js/exports.js`](../../assets/js/exports.js) — `exportCV()` reads `loadSavedData()`/`loadSavedStyles()`, builds a `.cvml` file with `[cv-data js]` and `[cv-styles]` tagged sections, and triggers a browser download; `importCV()` opens a file picker, parses the two sections via regex, evaluates the JS section with `new Function(cvCode)`, validates the result against `CVDataSchema`, saves it, applies imported styles via `applyStyles()` from [`assets/js/styles.js`](../../assets/js/styles.js), and updates the open Monaco editor if present; both functions emit outcome events (`cv:export`/`cv:export:error`, `cv:import`/`cv:import:error`) via `emit()` from [`assets/js/observable.js`](../../assets/js/observable.js)

## Coupling

- [`assets/js/editor.js`](../../assets/js/editor.js) (editor-shell domain) imports `cvData`, `defaultMessage`, `STORAGE_CODE_KEY` from `config.js`, `CVDataSchema`, `renderCV`, and most of [`assets/js/storage.js`](../../assets/js/storage.js)'s exports directly — `applyChanges()` and `resetData()` in editor.js are the only callers that run the full validate-then-render pipeline for user JS input.
- [`assets/js/exports.js`](../../assets/js/exports.js) imports `applyStyles` from [`assets/js/styles.js`](../../assets/js/styles.js) (styles domain), `getEditorMode`/`getEditor` from [`assets/js/editor.js`](../../assets/js/editor.js) (editor-shell domain), and `emit` from [`assets/js/observable.js`](../../assets/js/observable.js) (editor-shell domain) — CVML import/export touches all three domains.
- [`assets/js/ai/ui.js`](../../assets/js/ai/ui.js) (ai-chat domain) imports `renderCV` from `cv-renderer.js` and `saveCVData`/`loadSavedData` from `storage.js` directly, bypassing `editor.js`, to apply AI-generated CV data to the DOM.
- [`assets/js/ai/ui.js`](../../assets/js/ai/ui.js) and [`assets/js/ai/templates.js`](../../assets/js/ai/templates.js) (ai-chat domain) import `renderMarkdown` from `markdown.js` to render assistant chat messages (including streamed content) and the user-profile preview as block-level markdown.
- [`assets/js/toast.js`](../../assets/js/toast.js) (editor-shell domain) imports `parseMarkdown` from `markdown.js` to render toast message bodies.
- [`assets/js/modal.js`](../../assets/js/modal.js) (editor-shell domain) imports `renderDocMarkdown` from `markdown.js` to render help/prompt/privacy documents.

## Conventions worth knowing

- All Zod schemas use `.strict()` — unknown/extra keys on any CV data object cause validation to fail rather than being silently dropped.
- `editor.js`'s `initializeEditor()` cross-checks `localStorage`'s saved code against its saved parsed result by re-running the code through `new Function()` and comparing `JSON.stringify()` output; on mismatch or throw it regenerates code from the saved result (source of truth) and immediately overwrites `STORAGE_CODE_KEY`.
- `.cvml` is a plain-text tagged format, not JSON: `[cv-data js]` followed by raw JavaScript source, then a blank line, then `[cv-styles]` followed by raw CSS. `importCV()` parses it with regex (`/\[cv-data js\]\n([\s\S]*?)(?=\n\[|$)/` and `/\[cv-styles\]\n([\s\S]*?)$/`), not a real parser.
- `getDocumentTitle()` lowercases and replaces spaces with `-` in `${name}-CV-${isoDate}`, and is used for both the browser tab title and the exported `.cvml` filename.
- `importCV()` only calls `editor.setValue(cvCode)` when the editor is open and not in CSS mode — in CSS mode the editor holds styles, not CV code, so the imported code is picked up on the next mode switch instead.
