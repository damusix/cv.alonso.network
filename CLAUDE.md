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

An AI chat assistant (third editor tab) can generate and modify CV data and CSS through a tool-based LLM agent. See the AI Architecture section below.


## Project Structure

```
index.html              # Single-page app entry point
assets/
  css/                  # Static stylesheets (no preprocessor)
    base.css            # Reset, design tokens, typography
    cv.css              # CV layout and component styles
    editor.css          # Editor panel styling (VSCode-like)
    ai-chat.css         # AI chat panel, settings, messages, clarification cards
    split-pane.css      # Resizable split-pane layout
    action-menu.css     # Floating action button menu
    modal.css           # Dialog/modal styles
    toast.css           # Toast notification styles
    print.css           # Print-specific overrides
  js/                   # ES module JavaScript (no bundler)
    main.js             # Entry point — initializes all modules in order
    config.js           # Default CV data, storage key constants
    validation.js       # Zod schemas for CV data validation
    storage.js          # localStorage read/write helpers
    cv-renderer.js      # Builds CV DOM from validated data
    editor.js           # Monaco editor setup, mode switching, auto-save
    split-pane.js       # Draggable pane divider with persistence
    observable.js       # Global event bus (LogosDX Observer pattern)
    styles.js           # Loads base CSS, manages custom style overrides
    exports.js          # Import/export CVML files and PDF generation
    action-menu.js      # Floating action button behavior
    modal.js            # Help/prompt/privacy dialog management
    toast.js            # Dismissable notification system
    keyboard.js         # Keyboard shortcut bindings
    markdown.js         # markdown-it wrapper for inline rendering
    ui-utils.js         # Fullscreen toggle with context-aware focus detection
  js/
    db/
      db.js               # Dexie v3 IndexedDB wrapper (chats, messages, settings, documents)
    ai/
      langchain.js        # CvAgent class — LangChain tool-calling, streaming, structured output
      ui.js               # AI chat UI coordinator — settings/chat screens, event delegation
      schemas.js          # Zod schemas for intent classification and AI response validation
      prompts.js          # System prompts, CV writing guide, date context
      search.js           # Brave Search and Tavily API integration
      templates.js        # HTML template functions for chat UI components
      memory.js           # Token estimation, message trimming, summary management
```


## JavaScript Module Details


### main.js

App entry point. Orchestrates initialization order: styles → editor → CV render → action menu → keyboard → modal → split pane → toasts. Everything bootstraps from here.

### config.js

Exports `STORAGE_KEYS` (localStorage key constants) and `DEFAULT_CV_DATA` (sample CV structure with personal info, education, experience, projects, and skills sections). Also contains a welcome message shown on first visit.

### validation.js

Defines Zod schemas (`PersonalSchema`, `LinkSchema`, `SectionItemSchema`, `SectionSchema`, `CVDataSchema`) that enforce required fields, valid email/URL formats, and structural rules (at least one section with one item).

### storage.js

Thin abstraction over `localStorage`. Handles loading/saving: raw JS code, compiled CV result, editor mode (js/css), custom CSS, cursor position per mode, and draft content per mode.

### cv-renderer.js

Takes validated CV data and renders it to the DOM. Updates the personal header (name, title, contact, links with Font Awesome icons) and dynamically builds section elements with markdown-parsed content.

### editor.js

Manages the Monaco Editor instance. Handles mode switching between JavaScript and CSS, auto-save drafts (debounced), cursor position restoration, undo/redo, fullscreen integration, and emits events on data changes via the observable system.

### split-pane.js

Implements the desktop resizable split-pane layout between CV preview and editor. Handles mouse and touch drag events on the divider and persists pane widths to localStorage.

### observable.js

Global event emitter using LogosDX Observer pattern. Provides pub/sub for decoupled communication between modules (events like `cv:save`, `cv:reset`, `editor:fullscreen`). Includes Google Analytics event tracking integration.

### styles.js

Loads default stylesheets (base.css, cv.css, print.css) at init, combines them with inline documentation for the styles editor, and provides functions to apply, save, and reset custom CSS overrides.

### exports.js

Handles `.cvml` file import/export. CVML is a custom tagged format with `[cv-data js]` and `[cv-styles]` sections. Also supports PDF export via the browser print dialog.

### action-menu.js

Controls the floating action button (FAB) menu. Manages open/close state, wires up menu items (open editor, print, show help), and closes on outside clicks.

### modal.js

Dialog management for help, prompt, and privacy modals. Caches rendered markdown content, tracks first-time visits to show welcome help, and supports copying modal content to clipboard.

### toast.js

Creates dismissable toast notifications with configurable type (info/success/error/warning) and auto-dismiss timeout. Supports markdown content in messages.

### keyboard.js

Binds global keyboard shortcuts: `⌘S` (apply changes), `⌘E` (toggle editor on mobile), `⌘P` (print), `⌘\` (fullscreen toggle), `?` (help modal), `ESC` / double-`ESC` (close panels).

### markdown.js

Exports three markdown renderers: `parseMarkdown()` for inline CV content (no HTML, no breaks), `renderMarkdown()` for block content, and `renderDocMarkdown()` for full documents like modals (HTML enabled, breaks enabled).

### ui-utils.js

Provides `toggleFullscreen()` which cycles between fullscreen CV, fullscreen editor, and split view. Detects whether the editor or CV pane has focus to determine which pane to fullscreen, and emits corresponding events.


## AI Architecture


### Overview

The AI chat uses LangChain JS loaded from CDN (ESM). Three LLM models are configured per provider:

- **Router model** (cheap/small, e.g. Haiku) — intent classification, conversation summarization, inner data generation calls, fact deduplication, document summarization
- **Generator model** (capable, e.g. Opus) — main conversational reasoning, tool orchestration
- Tool-bound variants of the generator model are created at configure() time for different handler contexts


### Intent Classification

Every user message goes through `#classifyIntent` first, which uses the router model with `withStructuredOutput(AiIntentSchema)` to produce one of: `chitchat`, `clarification`, `full_generation`, `partial_update`, `style_update`. The intent determines which handler processes the message.


### Handler Patterns

**Streaming handlers** (chitchat, clarification, full generation): Use `#streamWithTools` which streams tokens + handles multi-round tool calling loops. Full generation uses an accumulator pattern — tools like `set_personal_info`, `add_section` populate `#generationAccumulator`, which is assembled into a CV after streaming.

**Tool-based propose/accept** (partial update, style update): The outer (generator) model streams and calls `generate_partial_update` or `generate_style_update` with natural language instructions. Each tool makes an **inner LLM call** to the router model via `withStructuredOutput` to produce structured data. Results are stored as proposals in `#proposalMap`. The outer model evaluates and calls `accept_*` to finalize, or calls `generate_*` again with corrective instructions. After streaming, accepted proposals from `#pendingChanges` are yielded as `cv_section` or `css_update` events.

**Why the two-phase pattern:** The outer model reasons about *what* to change; the inner model (cheap) does the mechanical data generation. If the inner model produces bad output, the outer model can retry with refined instructions — creating a self-correcting feedback loop without user intervention.


### System Prompt Construction

All system prompts are assembled by `#buildSystemPrompt(basePrompt)` which prepends context in this order:

1. **ISO date** (`DATE_CONTEXT`) — always first
2. **User profile** (`#userProfile`) — markdown the user wrote about themselves in Settings
3. **Learned facts** (`#learnedFacts`) — facts the agent saved about the user during conversations
4. **Document summaries** (`#documentSummaries`) — summaries of uploaded documents
5. **Conversation summary** (`#summary`) — compressed history from previous messages
6. **Base prompt** — the handler-specific system prompt (includes CV writing guide for content handlers)

Content-related prompts (generation, partial update, chitchat, clarification, inner partial update) also include a `CV_WRITING_GUIDE` constant with resume best practices and ATS optimization tips.


### Chat Memory

Chat history is read from IndexedDB (not the DOM). A token-aware trimming system (`memory.js`) keeps messages within a 32K token budget. When messages are trimmed, the router model generates a conversation summary that's persisted on the chat record and prepended to all system prompts via `#buildSystemPrompt`.

Messages with linked documents (`documentIds` field) are augmented with their document summaries when building chat history, so the LLM sees document context inline.


### User Context System

The agent maintains several layers of persistent user context:

- **User Profile** (`user:profile` in settings) — markdown text the user writes about themselves, editable via a modal in Settings. Injected into all system prompts.
- **Learned Facts** (`user:learned-facts` in settings) — facts the agent discovers during conversation and saves via the `save_user_fact` tool. The router model deduplicates against existing profile and facts before saving.
- **Uploaded Documents** (`documents` table) — files uploaded in Settings or attached in chat. Text is extracted client-side (pdf.js for PDFs, mammoth.js for DOCX, direct read for text files, vision model for images). The router model generates summaries which are injected into system prompts. Full extracted text is stored for retrieval via the `read_document` tool.


### Tool System

Tools are defined as arrays of `{ name, description, schema }` objects and bound to models via `model.bindTools()`. The `#executeTool` switch statement handles all tool calls. Inner LLM calls for the propose/accept tools happen inside `#executeTool`.

Available tool sets:

- `AGENT_TOOLS` — available in all streaming handlers:
    - `read_resume` — reads current CV data from the editor
    - `read_styles` — reads current custom CSS from the editor
    - `web_fetch` — fetches and extracts text from a web page (via Puter.js for CORS-free access)
    - `web_search` — searches the web via Brave Search API
    - `tavily_search` — searches the web via Tavily API (with AI-generated answers)
    - `tavily_extract` — extracts clean markdown content from URLs via Tavily
    - `tavily_crawl` — crawls a website following links to gather content from multiple pages
    - `tavily_map` — maps a website's URL structure
    - `read_document` — reads the full extracted text of an uploaded document by name
    - `save_user_fact` — saves an interesting fact about the user (deduplicated via router model)
    - `ask_clarification` — presents the user with a question and clickable options, pausing the stream until they respond
- `GENERATION_TOOLS` — set_personal_info, set_summary, add_section (full generation only)
- `PARTIAL_UPDATE_TOOLS` — generate_partial_update, accept_partial_update
- `STYLE_UPDATE_TOOLS` — generate_style_update, accept_style_update


### Clarification Tool

The `ask_clarification` tool uses a Promise-based pause mechanism. When called, `#executeTool` emits an `ai:clarification-request` event carrying a `respond` callback. The UI renders a card with option buttons and a custom text input inside the assistant bubble. The Promise resolves when the user clicks an option or submits custom text, and streaming resumes. If the stream is aborted, the Promise rejects and unanswered cards are visually disabled.


### CORS-Free Networking

All external HTTP requests (web_fetch, Brave Search, Tavily API) use Puter.js (`puter.net.fetch`) for CORS-free fetching. Puter.js is loaded globally in `index.html` and uses the WISP protocol (websocket-based proxy with client-side TLS) — no API keys or backend needed.


### Error Handling

API errors are parsed by `formatApiError()` in ui.js which translates HTTP status codes and provider-specific errors into user-friendly messages (e.g., 529 → "API overloaded, try again", 401 → "Invalid API key"). Errors are displayed in three paths: stream creation failure, yielded error events during streaming, and iteration errors.


### IndexedDB Schema (Dexie v3)

```
chats:     ++id, title, summary, createdAt, updatedAt
messages:  ++id, chatId, role, content, timestamp, documentIds
settings:  key → value (provider configs, activeProvider, search config, tavily config, user profile, learned facts)
documents: ++id, name, type, size, createdAt, data, summary, extractedText
```


### Settings Keys

```
provider:{id}      → { apiKey, smallModel, responseModel }
activeProvider     → string
search:config      → { apiKey }           (Brave Search)
tavily:config      → { apiKey }           (Tavily)
user:profile       → string               (markdown)
user:learned-facts → string[]             (array of fact strings)
lastChatId         → number
```


### LangChain CDN Versions

```
@langchain/openai@0.5.12
@langchain/anthropic@0.3.21
@langchain/google-genai@0.2.12
@langchain/core/messages (latest)
```


### Known LangChain Quirks

- `withStructuredOutput` can return `null` even when the API response contains valid data. Always use `{ includeRaw: true }` and fall back to `response.raw.tool_calls[0].args` when `response.parsed` is null.
- Anthropic adapter defaults `topP`/`topK` to `-1` which the API rejects. Must explicitly set them to `undefined` after construction.
- OpenAI reasoning models (o1, o3) only accept `temperature: 1`. OpenAI models reject `max_tokens` — must use `modelKwargs: { max_completion_tokens }` instead.
- Anthropic requires strictly alternating user/assistant messages. `toLangChainMessages` merges consecutive same-role messages with newlines.
- Empty `text` content blocks in multipart messages cause Anthropic to reject with 400. Always filter out empty text parts.


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
