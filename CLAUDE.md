# CV Generator


## What It Is

A static HTML website for creating, editing, and exporting CVs/resumes. No build step, no compilation — everything runs client-side from static files served directly by GitHub Pages. Users write JavaScript to generate CV data and CSS to style it, using an embedded Monaco editor.


## How It Works

The app loads `index.html`, which pulls in static CSS and JS module files from `assets/`. All dependencies (Monaco Editor, markdown-it, Zod, Font Awesome, LangChain, Dexie, Puter.js) load from CDNs. User data persists in `localStorage` (CV data, editor state) and IndexedDB via Dexie (AI chat history, settings, documents). There is no backend.

The core loop is:

1. User writes JavaScript that `return`s a CV data object
2. On save (`⌘S`), the code is evaluated via `Function()` constructor
3. The result is validated against Zod schemas
4. Markdown fields are parsed with markdown-it
5. The CV DOM is rebuilt and rendered in the preview pane

CSS customization follows a similar pattern: user writes CSS in the styles tab, which gets injected into the page on save.

An AI chat assistant (third editor tab) can generate and modify CV data and CSS through a tool-based LLM agent. One model drives a single tool loop — no intent classifier and no per-intent handlers; the model decides whether to chat, build from scratch (`set_*` accumulator tools), edit (`edit_cv`), or restyle (`edit_styles`). See [`docs/wiki/ai-chat.md`](docs/wiki/ai-chat.md).


## Tribal Knowledge


### Edits are gated by human approval, not a second tool call

`edit_cv`'s arguments ARE the change (`operation`/`path`/`data`) — there is no inner model that generates it and no `accept_*` tool. The human approval dialog is the code gate *between* the tool call and its result: `#requestApproval` emits `ai:approval-request`, the UI renders the before/after diff, applies on accept, and hands the applied CV back through `respond(accepted, cvData)` so the agent's editor-context snapshot stays current for the next edit in the same turn. This replaced an earlier two-phase propose/accept pattern (outer model calls `generate_*` → cheap router generates data → outer calls `accept_*`), which weak models looped on: they re-generated instead of committing. The human is the corrector now, so the model's self-accept step was redundant. `edit_styles` follows the same shape (args are the full CSS; user applies it). From-scratch generation still uses the `set_*` accumulator tools and a preview card.

### Known LangChain quirks

Each of these cost real debugging time. They are not obvious from the LangChain docs.

- `withStructuredOutput` can return `null` even when the API response contains valid data. Always use `{ includeRaw: true }` and fall back to `response.raw.tool_calls[0].args` when `response.parsed` is null.
- LangChain v1 standardized every provider on `apiKey` — the old `openAIApiKey` alias is silently ignored (the key just vanishes, no error) — and moved the Anthropic browser flag to `clientOptions: { dangerouslyAllowBrowser: true }`. (v1 also stopped defaulting Anthropic's `topP`/`topK` to `-1`, so the old post-construction workaround is gone.)
- OpenAI reasoning models (o1, o3) only accept `temperature: 1`. OpenAI models reject `max_tokens` — must use `modelKwargs: { max_completion_tokens }` instead.
- Anthropic requires strictly alternating user/assistant messages. `toLangChainMessages` merges consecutive same-role messages with newlines.
- Empty `text` content blocks in multipart messages cause Anthropic to reject with 400. Always filter out empty text parts.

### `#buildSystemPrompt` context order is inverted from reading order

The method builds its string by successively *prepending*, so the final order is the reverse of the source order: date, conversation summary, document summaries, learned facts, user profile, base prompt. Adding a new context block near the top of the method puts it near the *bottom* of the prompt.


## Key Conventions

- No build tools, no compilation — edit and reload
- All module communication goes through the observable event bus, not direct imports
- localStorage for CV data/editor state; IndexedDB (Dexie) for AI chat persistence
- CSS uses design tokens via custom properties (defined in `base.css`)
- CV header styles are scoped to `.cv-container header` to avoid bleeding into dialog headers
- Sections are targetable by their `id` attribute for custom styling
- No test infrastructure — all testing is manual via browser
- CDN dependencies only — no npm, no node_modules
- Both user and assistant chat messages render full block-level markdown
- Puter.js handles all CORS-free external HTTP requests (no backend proxy needed)

## Cache Busting

All local JS module imports use a `?v=VERSION` query string for cache busting. The version string is also set in `assets/js/version.js` and in the `<script>` tag in `index.html`.

**IMPORTANT: When making changes to any JS file, bump the version string in ALL of these locations:**

1. `assets/js/version.js` — the `VERSION` export
2. `index.html` — the `<script type="module" src="assets/js/main.js?v=...">` tag
3. All `import ... from '...(path).js?v=...'` statements across all JS files (use `sed` to batch-replace the old version with the new one)

The version format is `YYYY.MM.DD.N` (date + sequential number for same-day changes).

To bump all versions at once:

```
sed -i '' "s/?v=OLD_VERSION/?v=NEW_VERSION/g" assets/js/**/*.js assets/js/*.js index.html
```

Then update `assets/js/version.js` manually.

<atomic-signals>

## Project signals (auto-loaded)


@docs/wiki/index.md

</atomic-signals>
