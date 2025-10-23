// Markdown Parsing

const md = window.markdownit({
    html: false,
    breaks: false,
    linkify: true
});

export function parseMarkdown(text) {
    if (!text) return '';
    // Remove wrapping <p> tags for inline rendering
    return md.renderInline(text);
}
