// Markdown Parsing

const md = window.markdownit({
    html: false,
    breaks: false,
    linkify: true
});

const mdDoc = window.markdownit({
    html: true,
    breaks: true,
    linkify: true
});

export function parseMarkdown(text) {
    if (!text) return '';
    // Remove wrapping <p> tags for inline rendering
    return md.renderInline(text);
}

export function renderMarkdown(text) {
    if (!text) return '';
    return md.render(text);
}

export function renderDocMarkdown(text) {
    if (!text) return '';
    return mdDoc.render(text);
}
