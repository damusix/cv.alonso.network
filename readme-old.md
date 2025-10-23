# CV Generator - Technical Documentation

## Overview

Single-page HTML application for creating, editing, and printing a professional CV. Features live editing with Monaco Editor, Zod validation, markdown support, and localStorage persistence.

---

## Core Technologies

### External Dependencies

- **Monaco Editor** (v0.52.2) - Code editor with syntax highlighting
- **markdown-it** (v14.1.0) - Markdown parsing for CV content
- **Zod** (v3.23.8) - Runtime schema validation
- **Font Awesome** (v6.7.1) - Icons

---

## Data Structure

### CV Data Schema

```typescript
{
  personal: {
    name: string,
    title?: string,
    email: string (validated),
    phone: string,
    location: string,
    links?: [{ name, url, icon? }]
  },
  summary?: string (markdown),
  sections: [{
    id: string,
    heading: string,
    items: [{
      title: string,
      subtitle?: string,
      period?: { start?, end? },
      location?: string,
      content?: string[] (markdown),
      tags?: string[]
    }]
  }]
}
```

### Validation Rules (Zod)

- Email must be valid format
- URLs must be valid
- At least one section required
- Each section needs at least one item
- Name, email, phone, location are required

---

## Storage System

### localStorage Keys

1. **`cv-data-code`** - Raw editor content (JSON or JavaScript)
2. **`cv-data-result`** - Evaluated JSON result from code
3. **`cv-editor-mode`** - Current editor mode ('json' | 'javascript')

### Persistence Logic

- Saves on every successful apply (⌘S)
- Loads saved data on page refresh
- JavaScript code survives page reloads
- Mode switching preserves data

---

## UI Components

### 1. CV Display (`<div class="cv-container">`)

**Structure:**

- `<header>` - Personal info, contact details, links (CSS Grid layout)
- `<div class="summary">` - Summary paragraph
- `<main>` - All CV sections
- `<footer>` - Footer text

**Sections:**

- Dynamic rendering from `sections` array
- Each section has heading + items
- Items display: title, subtitle, period, location, content (bullets/paragraph), tags

### 2. Action Menu (`.action-menu-container`)

**Components:**

- Floating button (bottom-right, hamburger icon)
- Drop-up menu with 2 items:
    - Edit CV Data (⌘E)
    - Print CV (⌘P)

**Behavior:**

- Click button to toggle menu
- ESC or click outside to close
- Auto-closes after selection
- Hidden during print

### 3. Editor Panel (`.editor-panel`)

**Structure:**

- Header (title + close button)
- Controls bar:
    - Mode toggle (JSON/JavaScript)
    - Fullscreen button
    - Reset button
    - Apply button (⌘S)
- Monaco editor container
- Error display area

**Features:**

- Slides in from right (600px width)
- Fullscreen mode (100vw width)
- 4-space indentation
- Syntax highlighting
- Line numbers

---

## Editor Modes

### JSON Mode

- Standard JSON editing
- Validates with `JSON.parse()`
- Pretty-printed with 4 spaces

### JavaScript Mode

- Full JavaScript execution
- Must end with `return` statement
- Evaluated with `new Function(code)`
- Allows dynamic data generation

**Example:**

```javascript
// Calculate years of experience
const startYear = 2016;
const yearsExp = new Date().getFullYear() - startYear;

return {
  personal: { /* ... */ },
  summary: `${yearsExp}+ years of experience...`,
  sections: [ /* ... */ ]
};
```

---

## Rendering System

### Markdown Parsing

- Uses `markdown-it.renderInline()` for inline rendering
- Supports: `**bold**`, `*italic*`, `` `code` ``, `[links](url)`
- Applied to: summary, content items

### Section Rendering

**Item Structure:**

```
.item
  .header (Grid: title + period)
    h3 (title)
    time (period)
  .meta (subtitle + location)
  .content (ul>li or p)
  .tags (flex grid of badges)
```

### Dynamic Content

- Single content item → `<p>`
- Multiple content items → `<ul><li>` list
- Tags → flex-wrapped badges
- Optional fields hidden gracefully

---

## Styling System

### CSS Architecture

- **CSS Custom Properties** - Color/spacing tokens
- **CSS Grid** - Header layout, item headers, contact info
- **Flexbox** - Tags, links, meta info
- **Print Styles** - Optimized @media print rules

### Key Design Tokens

```css
--text-primary: #1a1a1a
--text-secondary: #4a4a4a
--text-muted: #6a6a6a
--accent-color: #2563eb
--spacing-sm/md/lg/xl: 0.5rem to 2rem
```

### Responsive Breakpoints

- None (designed for desktop/print)
- Print optimized at 0.75in margins

---

## Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| ⌘E / Ctrl+E | Open editor | Global |
| ⌘P / Ctrl+P | Print CV | Global |
| ⌘S / Ctrl+S | Save/apply changes | Editor open |
| ⌘\\ / Ctrl+\\ | Toggle fullscreen | Editor open |
| ESC | Close menu | Menu open |
| ESC ESC (1s) | Close editor | Editor open |

---

## Functions Reference

### Core Functions

- **`renderCV(data)`** - Renders entire CV from data object
- **`renderHeader(personal)`** - Renders header section
- **`renderSummary(summary)`** - Renders summary
- **`renderSection(section)`** - Renders individual section

### Editor Functions

- **`toggleEditor()`** - Open/close editor panel
- **`toggleFullscreen()`** - Toggle fullscreen mode
- **`setEditorMode(mode)`** - Switch JSON/JavaScript mode
- **`applyChanges()`** - Validate, save, and render
- **`resetData()`** - Clear storage, restore defaults
- **`loadSavedData()`** - Load from localStorage

### UI Functions

- **`toggleActionMenu()`** - Show/hide action menu
- **`openEditor()`** - Close menu + open editor
- **`printCV()`** - Close menu + trigger print
- **`showError(msg)`** - Display error message
- **`hideError()`** - Clear error message

---

## Print Optimization

### Print Styles (@media print)

- Remove: action menu, editor panel, box shadows
- White background, no padding on body
- Page break controls on sections/items
- Links show as text (not blue)
- Margins: 0.75in (via @page)

### Print Trigger

- Action menu → Print CV
- ⌘P / Ctrl+P keyboard shortcut
- Uses native `window.print()`

---

## Error Handling

### Validation Errors

- Zod validation provides detailed paths
- Format: `field.path: error message`
- Multi-line display with scrolling
- Pre-formatted monospace font

### Parse Errors

- JSON syntax errors caught
- JavaScript execution errors caught
- User-friendly error messages
- No data saved if invalid

---

## Extensibility

### Adding New Sections

Just add to `sections` array:

```javascript
{
  id: 'new-section',
  heading: 'New Section',
  items: [{ title: 'Item' }]
}
```

### Custom Styling

Modify CSS custom properties or add section-specific styles using section `id`

### New Validation Rules

Extend Zod schemas in the schema definition section

---

## File Structure

```
Single HTML file containing:
├── <head>
│   ├── External script imports
│   └── <style> - All CSS
├── <body>
│   ├── CV container (rendered content)
│   ├── Action menu (floating button + menu)
│   └── Editor panel (Monaco + controls)
└── <script type="module">
    ├── Import Zod
    ├── Initialize markdown-it
    ├── Define Zod schemas
    ├── CV sample data
    ├── Render functions
    ├── Storage functions
    ├── Editor functions
    ├── Event listeners
    └── Keyboard shortcuts
```

---

## Browser Compatibility

**Required:**

- ES6+ support (modules, arrow functions, template literals)
- localStorage API
- CSS Grid & Flexbox
- Modern event APIs

**Recommended:**

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

---

## Performance Considerations

- No external HTTP requests after initial load
- localStorage limited to ~5-10MB (CV data is <100KB typically)
- Monaco Editor is ~2MB (loads from CDN)
- No runtime dependencies beyond CDN scripts
- Instant rendering (no async operations for display)
