---
type: Domain
description: CSS design tokens and the default/custom style loading, override, and reset system
---

# styles

## What it does

Ships the default stylesheet set (reset, design tokens, CV layout, print, editor/AI chat chrome), and provides the runtime mechanism for loading, combining, applying, and resetting user-authored CSS overrides that get injected into a single `<style id="cv-custom-styles">` tag.

## CLI code

- [`assets/js/styles.js`](../../assets/js/styles.js) — `loadDefaultStyles()` fetches [`assets/css/base.css`](../../assets/css/base.css), [`assets/css/cv.css`](../../assets/css/cv.css), and [`assets/css/print.css`](../../assets/css/print.css) in parallel and concatenates them with `/* --- <file> --- */` comment separators, caching the result in a module-level `defaultStyles` variable; `getOrCreateStyleTag()` finds-or-creates `#cv-custom-styles` in `<head>`; `applyStyles(css)` sets that tag's `textContent` and persists via `saveStyles()` ([`assets/js/storage.js`](../../assets/js/storage.js)); `loadAndApplyStyles()` applies saved styles if present, else the combined defaults; `resetStyles()` clears saved styles (`clearSavedStyles()`) and re-applies defaults; `getCurrentStyles()` returns saved styles or, if none, the combined defaults
- [`assets/css/base.css`](../../assets/css/base.css) — CSS reset (`* { margin: 0; padding: 0; box-sizing: border-box; }`) and `:root` design tokens (`--text-primary`, `--text-secondary`, `--text-muted`, `--border-color`, `--accent-color`, `--spacing-sm/md/lg/xl`)
- [`assets/css/cv.css`](../../assets/css/cv.css) — CV layout and component styles (header grid, section headings, item/meta/content/tags structure)
- [`assets/css/editor.css`](../../assets/css/editor.css) — dark-theme tokens (`--ed-*` prefix, declared on `.editor-panel`) and layout for the Monaco editor panel, shared by the AI chat panel
- [`assets/css/ai-chat.css`](../../assets/css/ai-chat.css) — AI chat panel, settings screen, message bubbles, and clarification card styles, plus a human-in-the-loop change-approval modal (`.ai-approval-overlay`/`.ai-approval-modal`) with two diff presentations — a unified git-style line diff (`.ai-diff-unified`, gutter markers, added/removed/context rows) and an inline prose word diff (`.ai-diff-prose` with `<ins>`/`<del>`) — plus a compact post-decision record left in the transcript (`.ai-approval-record`); reuses the `--ed-*` dark-theme tokens defined in `editor.css`, except `.ai-approval-overlay` which redeclares its own `--ed-*` values locally since it mounts on `document.body`, outside `.editor-panel`'s scope
- [`assets/css/split-pane.css`](../../assets/css/split-pane.css) — resizable split-pane divider and pane layout
- [`assets/css/action-menu.css`](../../assets/css/action-menu.css) — floating action button and menu styles
- [`assets/css/modal.css`](../../assets/css/modal.css) — `<dialog>`-based modal styling
- [`assets/css/toast.css`](../../assets/css/toast.css) — toast notification styling
- [`assets/css/print.css`](../../assets/css/print.css) — `@media print` overrides for PDF/print export: hides editor/toast chrome, expands the CV to fill the printable area (overriding split-pane's centered `max-width`), controls page-break behavior around section items/bullet lists/tags/headers so entries don't split awkwardly across pages, and retunes spacing/font-size design tokens for print density; a sibling `@page { margin: 0.4in }` rule (outside the `@media print` block) sets page margins

## Coupling

- [`assets/js/editor.js`](../../assets/js/editor.js) (editor-shell domain) imports `applyStyles`/`getCurrentStyles`/`resetStyles` — CSS-mode editing in the Monaco editor calls directly into this domain's API.
- [`assets/js/exports.js`](../../assets/js/exports.js) (cv-data domain) imports `applyStyles` to re-apply styles on `.cvml` import.
- [`assets/js/ai/ui.js`](../../assets/js/ai/ui.js) (ai-chat domain) imports `applyStyles`/`getCurrentStyles` to preview and apply AI-generated CSS updates.
- [`index.html`](../../index.html) links all nine `assets/css/*.css` files as `<link rel="stylesheet">` tags for the app's own chrome (editor, split-pane, action menu, modal, toast, AI chat); `base.css`/`cv.css`/`print.css` are also fetched at runtime by `loadDefaultStyles()` to seed the user-editable CSS.

## Conventions worth knowing

- User-facing custom CSS is scoped to exactly one injected `<style id="cv-custom-styles">` tag — `getOrCreateStyleTag()` is the sole mutation point, so any CSS applied via `applyStyles()` fully replaces prior custom content rather than merging with it.
- The "default styles" a user edits from are the concatenation of `base.css` + `cv.css` + `print.css` only — `editor.css`, `ai-chat.css`, `split-pane.css`, `action-menu.css`, `modal.css`, and `toast.css` (app chrome) are never part of the user-editable default and are not affected by `resetStyles()`.
- Dark-theme tokens (`--ed-*`) are normally scoped to `.editor-panel` and inherited by descendants like the AI chat panel; the change-approval modal breaks this pattern deliberately because it mounts on `document.body` rather than inside `.editor-panel`, so it carries its own `--ed-*` redeclarations to stay themed correctly.
