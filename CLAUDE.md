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

An AI chat assistant (third editor tab) can generate and modify CV data and CSS through a tool-based LLM agent. Every user message is classified into one of five intents before routing to a handler — see [`docs/wiki/ai-chat.md`](docs/wiki/ai-chat.md).


## Tribal Knowledge


### Why the AI uses a two-phase propose/accept pattern

For partial and style updates, the outer (generator) model reasons about *what* to change and calls `generate_*`; that tool makes an inner call to the cheap router model to do the mechanical data generation. The outer model then evaluates the proposal and either calls `accept_*` or re-calls `generate_*` with corrective instructions. This is deliberate: it gives the expensive model a self-correcting loop over the cheap model's output without involving the user.

### Known LangChain quirks

Each of these cost real debugging time. They are not obvious from the LangChain docs.

- `withStructuredOutput` can return `null` even when the API response contains valid data. Always use `{ includeRaw: true }` and fall back to `response.raw.tool_calls[0].args` when `response.parsed` is null.
- Anthropic adapter defaults `topP`/`topK` to `-1`, which the API rejects. Must explicitly set them to `undefined` after construction.
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
