# CV Generator


Create and edit your CVs using JavaScript. Style it if you want. Use the AI chat assistant to generate, modify, or tailor your resume to a specific job posting. Upload documents for context, let the AI learn about you over time, and search the web for job postings. Print it, save it as PDF, and send it to your recruiter.

![Preview](screenshot.png)

---

## How to Use


The application features a split-pane layout with your CV preview on the left and the editor on the right. You can resize the divider between the panes by dragging it. Choose between **JavaScript** or **Styles** mode using the tabs at the top of the editor. Make your changes and press `⌘S` / `Ctrl+S` to apply. Press `⌘P` / `Ctrl+P` to print or save as PDF.

**Fullscreen Mode**: Press `⌘\` / `Ctrl+\` to toggle fullscreen view. The shortcut is context-aware: when the editor is focused, it fullscreens the editor pane; otherwise, it fullscreens the CV preview pane.

On mobile devices, press `⌘E` / `Ctrl+E` to toggle the editor overlay.

### Editor Modes

#### JavaScript Mode

Use JavaScript to generate your CV data dynamically:

    // Calculate years of experience
    const startYear = 2016;
    const yearsExp = new Date().getFullYear() - startYear;

    return {
      personal: {
        name: "Your Name",
        title: "Your Title",
        email: "email@example.com",
        phone: "+1234567890",
        location: "City, Country"
      },
      summary: `Professional with ${yearsExp}+ years of experience`,
      sections: [
        // ... your sections
      ]
    };

**Important:** Your code must end with a `return` statement that returns the CV data object.

#### Styles Mode

Customize the appearance with CSS:

    /* Override design tokens */
    :root {
      --accent-color: #2563eb;
      --text-primary: #1a1a1a;
      --text-secondary: #4a4a4a;
    }

    /* Custom styles for specific sections */
    #experience .item {
      border-left: 2px solid var(--accent-color);
      padding-left: 1rem;
    }

### Data Structure

Your CV data follows this schema:

- **personal** (required)
    - `name` (string, required)
    - `title` (string, optional)
    - `email` (string, required, validated)
    - `phone` (string, required)
    - `location` (string, required)
    - `links` (array, optional) - Array of `{ name, url, icon? }`

- **summary** (string, optional) - Markdown-supported professional summary

- **sections** (array, required) - At least one section required
    - `id` (string, required) - Used for styling hooks
    - `heading` (string, required) - Section title
    - `items` (array, required) - At least one item required
        - `title` (string, required)
        - `subtitle` (string, optional)
        - `period` (object, optional) - `{ start?, end? }`
        - `location` (string, optional)
        - `content` (array, optional) - Markdown strings
        - `tags` (array, optional) - Skill/tech tags

---

## AI Chat Assistant


The AI chat tab is a full-featured LLM-powered assistant for building and refining your CV. It supports multiple providers, web research, document uploads, and learns about you over time.

### Providers

Configure one or more LLM providers with your own API keys:

- **Anthropic** (Claude) - default small: `claude-haiku-4-5`, large: `claude-opus-4-5`
- **OpenAI** (GPT) - default small: `gpt-5-mini`, large: `gpt-5.2`
- **Google** (Gemini) - default small: `gemini-3-flash-preview`, large: `gemini-3-pro-preview`

Each provider uses two models: a **small model** (cheap, for routing and data generation) and a **response model** (capable, for reasoning and conversation). You can customize the model names in Settings.

### What It Can Do

- **Generate a full CV** from a conversation, uploaded resume, or job posting URL
- **Update specific sections** — add a new job, edit skills, change your summary
- **Modify styling** — change fonts, colors, spacing, layout via natural language
- **Research the web** — fetch job postings, search for salary data, crawl company websites
- **Ask clarifying questions** — presents clickable options when your request is ambiguous
- **Give career advice** — resume tips, best practices, ATS optimization guidance

### User Profile

Write information about yourself in markdown (Settings > User Profile). This context is included in every AI conversation so the assistant knows your background without you having to repeat it.

### Document Uploads

Upload files in Settings or attach them directly in chat. Supported formats:

- **PDF** — text extracted via pdf.js
- **DOCX** — text extracted via mammoth.js
- **Images** (PNG, JPG, etc.) — described by the AI vision model
- **Text files** (TXT, MD, CSV) — read directly

Each document is automatically summarized by the small model. Summaries are included in every conversation as context. The AI can also read the full extracted text on demand using the `read_document` tool.

Files attached in chat are also saved to the documents store and linked to the message they were attached to.

### Learned Facts

As you chat, the AI can save interesting facts it learns about you — career goals, preferences, achievements, industry interests. These are deduplicated against your profile and existing facts using the small model, and persist across conversations. You can think of it as the AI building a memory of who you are over time.

### Web Search & Research

Two search providers are available (configure API keys in Settings):

- **Brave Search** — fast web search
- **Tavily** — AI-powered search with answers, plus page extraction, website crawling, and URL mapping

The AI also has a `web_fetch` tool for reading any URL directly. All external requests use [Puter.js](https://puter.com) for CORS-free fetching — no backend proxy needed.

### Privacy

All data stays in your browser. CV data lives in localStorage, AI chat history and documents in IndexedDB. API calls go directly from your browser to the LLM/search providers — nothing passes through any intermediary server.

---

## Extensibility


### Adding Custom Sections

Simply add to the `sections` array:

    {
      "id": "publications",
      "heading": "Publications",
      "items": [
        {
          "title": "Paper Title",
          "subtitle": "Journal Name",
          "period": { "start": "2023" },
          "content": ["Brief description"]
        }
      ]
    }

### Custom Section Styling

Target sections by their `id` in the Styles editor:

    #publications {
      border-left: 3px solid var(--accent-color);
      padding-left: 1rem;
    }

    #publications .item-header {
      font-style: italic;
    }

### Validation Rules

Extend validation in [validation.js](assets/js/validation.js) by modifying the Zod schemas.

---

## Features


### Split-Pane Layout & Fullscreen

Desktop view features a resizable split-pane layout. Drag the divider to adjust pane sizes (saved to localStorage). Toggle fullscreen mode with `⌘\` / `Ctrl+\` - context-aware to fullscreen either the editor or CV preview based on focus. Mobile displays as an overlay editor.

### Markdown Support

Use markdown syntax in `summary` and `content` fields: `**bold**`, `*italic*`, `` `code` ``, `[links](url)`. Both user and assistant messages in the AI chat also render full markdown.

### Font Awesome Icons

Add icons to links using Font Awesome classes. Browse icons at [fontawesome.com](https://fontawesome.com/icons)

    {
      "name": "GitHub",
      "url": "https://github.com/username",
      "icon": "fab fa-github"
    }

### Auto-save & Export

Changes auto-save to localStorage (including drafts and cursor position per mode). Export to `.cvml` files with tagged sections: `[cv-data js]` for data, `[cv-styles]` for CSS.

### Print Optimization

Print-optimized layout with proper page breaks, 0.75in margins, and clean styling.

---

## Keyboard Shortcuts


| Shortcut | Action |
|----------|--------|
| `⌘S` / `Ctrl+S` | Apply changes (editor) or save settings (AI settings) |
| `⌘E` / `Ctrl+E` | Toggle editor (mobile only) |
| `⌘P` / `Ctrl+P` | Print CV |
| `⌘\` / `Ctrl+\` | Toggle fullscreen (context-aware: editor pane when editor is focused, CV pane otherwise) |
| `⌘,` / `Ctrl+,` | Open AI settings (when in AI mode) |
| `⌘Enter` / `Ctrl+Enter` | Send AI message (when in AI mode) |
| `Enter` | Send AI message (in chat input) |
| `Shift+Enter` | New line in AI chat input |
| `?` | Show help (when not typing in editor) |
| `ESC` | Close menu / close AI settings |
| `ESC ESC` (within 1s) | Close editor (mobile) / abort AI message (in chat) |

---

## Technical Overview


### Architecture

Single-page application with modular JavaScript architecture. No build step — all files are served as static assets.

    index.html
    ├── assets/
    │   ├── css/
    │   │   ├── base.css          # CSS reset, tokens, typography
    │   │   ├── cv.css            # CV layout and styling
    │   │   ├── editor.css        # VSCode-style editor panel
    │   │   ├── ai-chat.css       # AI chat, settings, clarification cards
    │   │   ├── split-pane.css    # Split-pane layout system
    │   │   ├── action-menu.css   # Floating action menu
    │   │   ├── modal.css         # Modal dialog styling
    │   │   ├── toast.css         # Toast notification styling
    │   │   └── print.css         # Print-specific styles
    │   └── js/
    │       ├── main.js           # Entry point, initialization
    │       ├── config.js         # Default CV data, constants
    │       ├── validation.js     # Zod schema validation
    │       ├── storage.js        # localStorage persistence
    │       ├── cv-renderer.js    # CV rendering functions
    │       ├── editor.js         # Monaco editor setup
    │       ├── split-pane.js     # Split-pane layout management
    │       ├── observable.js     # Event system (LogosDX Observer)
    │       ├── styles.js         # Custom styles management
    │       ├── exports.js        # Import/export (.cvml, PDF)
    │       ├── action-menu.js    # Action menu behavior
    │       ├── modal.js          # Help modal management
    │       ├── toast.js          # Toast notification system
    │       ├── keyboard.js       # Keyboard shortcuts
    │       ├── markdown.js       # Markdown rendering
    │       ├── ui-utils.js       # Fullscreen toggle
    │       ├── utils.js          # General utilities (LogosDX Utils)
    │       ├── ai/
    │       │   ├── langchain.js  # CvAgent — LLM tool-calling, streaming
    │       │   ├── prompts.js    # System prompts, CV writing guide
    │       │   ├── schemas.js    # AI data schemas (Zod)
    │       │   ├── search.js     # Brave Search + Tavily API
    │       │   ├── templates.js  # Chat/settings HTML templates
    │       │   ├── memory.js     # Token budgeting, summarization
    │       │   └── ui.js         # AI chat panel coordinator
    │       └── db/
    │           └── db.js         # IndexedDB (Dexie v3)

### Core Technologies

- **Monaco Editor** (v0.52.2) - Code editor with syntax highlighting
- **markdown-it** (v14.1.0) - Markdown parsing
- **Zod** (v3.23.8) - Runtime schema validation
- **Font Awesome** (v7.0.1) - Icon library
- **LangChain JS** - AI orchestration (Anthropic, OpenAI, Google Gemini)
- **Dexie** (v4.0.11) - IndexedDB wrapper
- **Puter.js** (v2) - CORS-free HTTP fetching via WISP protocol
- **pdf.js** (v4.4.168) - PDF text extraction (lazy-loaded)
- **mammoth.js** (v1.8.0) - DOCX text extraction (lazy-loaded)
- **LogosDX** - Observer pattern and utility library

### Storage

**localStorage** — CV data, editor state, cursor positions, drafts, pane sizes

**IndexedDB** (via Dexie v3):

| Table | Fields | Purpose |
|-------|--------|---------|
| `chats` | id, title, summary, timestamps | Chat conversations |
| `messages` | id, chatId, role, content, timestamp, documentIds | Chat messages with document links |
| `settings` | key → value | Provider configs, API keys, user profile, learned facts |
| `documents` | id, name, type, size, data, summary, extractedText | Uploaded files with extracted content |

### Browser Compatibility

**Required:**

- ES6+ support (modules, arrow functions, template literals)
- localStorage and IndexedDB APIs
- CSS Grid & Flexbox

**Recommended:**

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

---

## License


MIT License - Feel free to use and modify for your needs.

---

CV Generator by [@damusix](https://github.com/damusix)
