# CV Generator


## What It Is

A static HTML website for creating, editing, and exporting CVs/resumes. No build step, no compilation — everything runs client-side from static files served directly by GitHub Pages. Users write JavaScript to generate CV data and CSS to style it, using an embedded Monaco editor.


## How It Works

The app loads `index.html`, which pulls in static CSS and JS module files from `assets/`. All dependencies (Monaco Editor, markdown-it, Zod, Font Awesome) load from CDNs. User data persists entirely in `localStorage` — there is no backend.

The core loop is:

1. User writes JavaScript that `return`s a CV data object
2. On save (`⌘S`), the code is evaluated via `Function()` constructor
3. The result is validated against Zod schemas
4. Markdown fields are parsed with markdown-it
5. The CV DOM is rebuilt and rendered in the preview pane

CSS customization follows a similar pattern: user writes CSS in the styles tab, which gets injected into the page on save.


## Project Structure

```
index.html              # Single-page app entry point
assets/
  css/                  # Static stylesheets (no preprocessor)
    base.css            # Reset, design tokens, typography
    cv.css              # CV layout and component styles
    editor.css          # Editor panel styling (VSCode-like)
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

Minimal wrapper around markdown-it. Exports a `parseMarkdown()` function that converts markdown strings to inline HTML with link parsing enabled.

### ui-utils.js

Provides `toggleFullscreen()` which cycles between fullscreen CV, fullscreen editor, and split view. Detects whether the editor or CV pane has focus to determine which pane to fullscreen, and emits corresponding events.


## Key Conventions

- No build tools, no compilation — edit and reload
- All module communication goes through the observable event bus, not direct imports
- localStorage is the only persistence layer
- CSS uses design tokens via custom properties (defined in `base.css`)
- Sections are targetable by their `id` attribute for custom styling
