// AI Templates — HTML template functions for settings and chat screens

import { renderMarkdown } from '../markdown.js?v=2026.07.24.5';
import { formatByteSize } from '../utils.js?v=2026.07.24.5';

const PROVIDERS = [
    {
        id: 'openai',
        name: 'OpenAI',
        smallDefault: 'gpt-5-mini',
        responseDefault: 'gpt-5.2'
    },
    {
        id: 'anthropic',
        name: 'Anthropic',
        smallDefault: 'claude-haiku-4-5',
        responseDefault: 'claude-opus-4-5'
    },
    {
        id: 'google-genai',
        name: 'Gemini',
        smallDefault: 'gemini-3-flash-preview',
        responseDefault: 'gemini-3-pro-preview'
    },
    {
        id: 'fireworks',
        name: 'Fireworks',
        // Both models must support tool calling (the router uses withStructuredOutput,
        // the generator drives the tool-calling agent). Kimi K2 is Fireworks' documented
        // function-calling model; verify `supportsTools` if you swap these out.
        smallDefault: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
        responseDefault: 'accounts/fireworks/models/kimi-k2-instruct-0905'
    }
];

export { PROVIDERS };

export function settingsScreen(settings, chats, documents) {
    const activeProvider = settings.activeProvider || '';

    const providerSections = PROVIDERS.map(p => {
        const ps = settings[`provider:${p.id}`] || {};
        return `
        <div class="ai-provider-card">
            <h3>
                ${p.name}
                <label class="ai-provider-active">
                    <input type="radio" name="activeProvider" value="${p.id}"
                           ${activeProvider === p.id ? 'checked' : ''} />
                    <span>Active</span>
                </label>
            </h3>
            <label>
                <span>API Key</span>
                <input type="password" data-provider="${p.id}" data-field="apiKey"
                       value="${ps.apiKey || ''}" placeholder="Enter API key..." autocomplete="off" />
            </label>
            <label>
                <span>Small Model</span>
                <input type="text" data-provider="${p.id}" data-field="smallModel"
                       value="${ps.smallModel || p.smallDefault}" />
            </label>
            <label>
                <span>Response Model</span>
                <input type="text" data-provider="${p.id}" data-field="responseModel"
                       value="${ps.responseModel || p.responseDefault}" />
            </label>
        </div>`;
    }).join('');

    const chatRows = (chats || []).map(c => `
        <tr>
            <td>${c.id}</td>
            <td>${c.title}</td>
            <td>
                <button class="ai-btn-danger" data-action="delete-chat" data-chat-id="${c.id}">
                    <i class="fa-solid fa-trash"></i> Delete
                </button>
            </td>
        </tr>
    `).join('');

    return `
    <div class="ai-settings">
        <div class="ai-settings-header">
            <span class="ai-settings-title">
                <i class="fa-solid fa-gear"></i> Settings
            </span>
            <div class="ai-settings-header-actions">
                <button class="ai-btn-primary" data-action="save-settings">Save</button>
                <button data-action="back-to-chat" class="ai-btn-ghost">
                    <i class="fa-solid fa-arrow-left"></i> Back
                </button>
            </div>
        </div>
        <div class="ai-settings-body">
            <div class="ai-providers">
                ${providerSections}
            </div>
            <div class="ai-provider-card">
                <h3>Web Search</h3>
                <label>
                    <span>Brave Search API Key</span>
                    <input type="password" id="searchApiKey"
                           value="${(settings['search:config']?.apiKey) || ''}" placeholder="Enter API key..." autocomplete="off" />
                </label>
                <small class="ai-help-text">
                    Get a free key at <a href="https://brave.com/search/api/" target="_blank" rel="noopener">brave.com/search/api</a>
                </small>
                <label>
                    <span>Tavily API Key</span>
                    <input type="password" id="tavilyApiKey"
                           value="${(settings['tavily:config']?.apiKey) || ''}" placeholder="Enter API key..." autocomplete="off" />
                </label>
                <small class="ai-help-text">
                    Get a key at <a href="https://app.tavily.com" target="_blank" rel="noopener">app.tavily.com</a> — enables search, extract, crawl &amp; map tools
                </small>
            </div>
            <div class="ai-provider-card ai-profile-card">
                <h3>
                    User Profile
                    <button class="ai-btn-ghost" data-action="edit-profile">
                        <i class="fa-solid fa-pen"></i> Edit
                    </button>
                </h3>
                <div class="ai-profile-preview">
                    ${settings['user:profile']
                        ? renderMarkdown(settings['user:profile'].length > 300
                            ? settings['user:profile'].slice(0, 300) + '...'
                            : settings['user:profile'])
                        : ''}
                </div>
            </div>
            <div class="ai-provider-card">
                <h3>
                    Context Documents
                    <button class="ai-btn-ghost" data-action="upload-document">
                        <i class="fa-solid fa-upload"></i> Upload
                    </button>
                </h3>
                <input type="file" id="aiDocInput" multiple
                       accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.csv,.docx" hidden />
                <div class="ai-documents-list">
                    ${(documents || []).length > 0
                        ? (documents || []).map(doc => `
                        <div class="ai-document-row" data-doc-id="${doc.id}">
                            <div class="ai-document-info">
                                <span class="ai-document-name">${escapeHtml(doc.name)}</span>
                                <span class="ai-file-size">(${formatByteSize(doc.size)})</span>
                                ${doc.summary
                                    ? '<span class="ai-document-status ai-document-summarized"><i class="fa-solid fa-check"></i></span>'
                                    : '<span class="ai-document-status ai-document-pending"><i class="fa-solid fa-clock"></i></span>'
                                }
                            </div>
                            <button class="ai-btn-danger" data-action="delete-document" data-doc-id="${doc.id}">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>`).join('')
                        : '<small class="ai-help-text">No documents uploaded. Upload files to give the AI context about you.</small>'
                    }
                </div>
            </div>
            ${chatRows.length ? `
            <div class="ai-conversations">
                <h3>Previous Conversations</h3>
                <table>
                    <thead>
                        <tr><th>ID</th><th>Title</th><th>Action</th></tr>
                    </thead>
                    <tbody>${chatRows}</tbody>
                </table>
            </div>` : ''}
        </div>
    </div>`;
}

export function profileEditDialog(currentProfile) {
    return `
    <div class="ai-profile-editor-overlay">
        <div class="ai-profile-editor">
            <div class="ai-profile-editor-header">
                <span>Edit User Profile</span>
                <div class="ai-profile-editor-actions">
                    <button class="ai-btn-primary" data-action="save-profile">Save</button>
                    <button class="ai-btn-ghost" data-action="cancel-profile">Cancel</button>
                </div>
            </div>
            <textarea id="aiProfileInput" class="ai-profile-textarea"
                      placeholder="Write information about yourself in markdown or plain text...">${escapeHtml(currentProfile || '')}</textarea>
            <small class="ai-help-text">
                This information is included in all AI conversations for personalized responses.
                Supports markdown formatting.
            </small>
        </div>
    </div>`;
}

export function chatScreen(chat, messages, { configuredProviders = [], activeProvider = '' } = {}) {
    const messageHtml = (messages || []).map(m => messageTemplate(m)).join('');

    const modelSelector = configuredProviders.length > 0
        ? `<select data-action="switch-provider" class="ai-chat-select ai-model-select">
            ${configuredProviders.map(p =>
                `<option value="${p.id}" ${p.id === activeProvider ? 'selected' : ''}>${p.name}</option>`
            ).join('')}
        </select>`
        : '<span class="ai-model-label">Not configured</span>';

    return `
    <div class="ai-chat">
        <div class="ai-chat-header">
            <div class="ai-chat-header-left">
                <select data-action="switch-chat" class="ai-chat-select">
                    <option value="${chat ? chat.id : ''}">${chat ? chat.title : 'New Chat'}</option>
                </select>
                <button data-action="new-chat" class="ai-btn-ghost" title="New Chat">
                    <i class="fa-solid fa-plus"></i>
                </button>
            </div>
            <div class="ai-chat-header-right">
                ${modelSelector}
                <button data-action="open-settings" class="ai-btn-ghost" title="Settings">
                    <i class="fa-solid fa-gear"></i>
                </button>
            </div>
        </div>
        <div class="ai-messages" id="aiMessages">
            ${messageHtml}
        </div>
        <div class="ai-attachments" id="aiAttachments"></div>
        <div class="ai-input-area">
            <textarea id="aiInput" placeholder="Write a message..." rows="1"></textarea>
            <button data-action="file-upload" class="ai-btn-ghost" title="Attach files">
                <i class="fa-solid fa-paperclip"></i>
            </button>
            <button data-action="send-message" class="ai-btn-primary ai-send-btn" title="Send">
                <i class="fa-solid fa-paper-plane"></i>
            </button>
            <input type="file" id="aiFileInput" multiple
                   accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.json,.md,.csv" hidden />
        </div>
    </div>`;
}

export function messageTemplate(msg) {
    const isUser = msg.role === 'user';
    const cls = isUser ? 'ai-msg-user' : 'ai-msg-assistant';
    const label = isUser ? 'You' : 'AI';

    const render = renderMarkdown;
    const contentHtml = render(msg.content || '');

    // Check for file attachments metadata
    const attachmentsHtml = msg.attachments
        ? msg.attachments.map(a => `<span class="ai-file-pill-static">${a.name}</span>`).join('')
        : '';

    const idAttr = msg.id ? ` data-message-id="${msg.id}"` : '';
    const actionBtns = (isUser && msg.id)
        ? `<div class="ai-msg-actions">
            <button class="ai-msg-action-btn" data-action="retry-message" title="Retry"><i class="fa-solid fa-rotate-right"></i></button>
            <button class="ai-msg-action-btn" data-action="edit-message" title="Edit"><i class="fa-solid fa-pen"></i></button>
            <button class="ai-msg-action-btn" data-action="delete-message" title="Delete">&times;</button>
        </div>`
        : '';

    return `
    <div class="ai-message ${cls}"${idAttr}>
        ${actionBtns}
        <div class="ai-message-label">${label}</div>
        ${attachmentsHtml ? `<div class="ai-message-attachments">${attachmentsHtml}</div>` : ''}
        <div class="ai-message-content">${contentHtml}</div>
    </div>`;
}

export function cvPreviewCard(cvData, path, operation) {
    const isDelete = operation === 'delete';
    const jsonStr = JSON.stringify(cvData, null, 4);
    const preview = isDelete ? '' : (jsonStr.length > 500 ? jsonStr.slice(0, 500) + '\n...' : jsonStr);
    const opLabel = isDelete ? 'Remove' : operation === 'insert' ? 'Insert at' : 'Partial update';
    const pathLabel = path ? `${opLabel}: ${path}` : 'Full CV generation';
    const btnLabel = isDelete ? 'Remove from CV' : 'Apply to CV';
    const btnClass = isDelete ? 'ai-btn-danger' : 'ai-btn-primary';

    return `
    <div class="ai-cv-preview${isDelete ? ' ai-cv-preview-delete' : ''}">
        <div class="ai-cv-preview-header">
            <span>${pathLabel}</span>
        </div>
        ${preview ? `<pre class="ai-cv-preview-code"><code>${escapeHtml(preview)}</code></pre>` : ''}
        <button class="${btnClass} ai-apply-btn"
                data-action="apply-cv"
                data-cv='${escapeAttr(JSON.stringify(cvData))}'
                data-path='${path ? escapeAttr(path) : ''}'
                data-operation='${operation || 'set'}'>
            ${btnLabel}
        </button>
    </div>`;
}

export function applyAllButton() {
    return `
    <div class="ai-apply-all">
        <button class="ai-btn-primary ai-apply-btn"
                data-action="apply-all-cv">
            Apply All Changes
        </button>
    </div>`;
}

const OP_LABEL = { delete: 'Remove', insert: 'Insert' };
const opLabelFor = (operation) => OP_LABEL[operation] || 'Update';

// Word-level diff of two strings. Returns { beforeHtml, afterHtml } with removed words
// wrapped in <del> and added words in <ins>. Whitespace is kept as its own tokens so the
// text reflows naturally. Falls back to plain escaped text if the inputs are large enough
// that the O(n*m) LCS table would be wasteful.
function wordDiff(beforeStr, afterStr) {
    const tok = (s) => s.match(/\s+|\S+/g) || [];
    const a = tok(beforeStr), b = tok(afterStr);
    if (a.length * b.length > 250_000) {
        return { beforeHtml: escapeHtml(beforeStr), afterHtml: escapeHtml(afterStr) };
    }
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const beforeParts = [], afterParts = [];
    let i = 0, j = 0;
    while (i < m && j < n) {
        if (a[i] === b[j]) { beforeParts.push(escapeHtml(a[i])); afterParts.push(escapeHtml(b[j])); i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { beforeParts.push(`<del>${escapeHtml(a[i])}</del>`); i++; }
        else { afterParts.push(`<ins>${escapeHtml(b[j])}</ins>`); j++; }
    }
    while (i < m) { beforeParts.push(`<del>${escapeHtml(a[i])}</del>`); i++; }
    while (j < n) { afterParts.push(`<ins>${escapeHtml(b[j])}</ins>`); j++; }
    return { beforeHtml: beforeParts.join(''), afterHtml: afterParts.join('') };
}

function diffSides(operation, before, data) {
    const fmt = (v) => v === undefined ? '(nothing here yet)' : (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
    if (operation === 'delete') {
        return { beforeHtml: escapeHtml(fmt(before)), afterHtml: '<span class="ai-approval-removed">(removed)</span>' };
    }
    if (typeof before === 'string' && typeof data === 'string') return wordDiff(before, data);
    return { beforeHtml: escapeHtml(fmt(before)), afterHtml: escapeHtml(fmt(data)) };
}

/**
 * Human-in-the-loop approval modal: a full-viewport dialog showing a single proposed
 * change as a before/after word diff, with Accept / Reject. Declares its own theme
 * tokens because it is mounted on document.body (outside .editor-panel's token scope).
 * @param {{summary: string, operation: string, path: string, data: *, before: *}} change
 */
export function approvalDialog({ summary, operation, path, data, before }) {
    const opLabel = opLabelFor(operation);
    const { beforeHtml, afterHtml } = diffSides(operation, before, data);

    return `
    <div class="ai-approval-overlay">
        <div class="ai-approval-modal" role="dialog" aria-modal="true">
            <div class="ai-approval-modal-header">
                <span class="ai-approval-title">
                    <i class="fa-solid fa-code-compare"></i>
                    ${escapeHtml(opLabel)} <code>${escapeHtml(path || '(whole CV)')}</code>
                </span>
                <span class="ai-approval-hint">Review before applying</span>
            </div>
            ${summary ? `<div class="ai-approval-summary">${escapeHtml(summary)}</div>` : ''}
            <div class="ai-approval-diff">
                <div class="ai-approval-col ai-approval-before">
                    <div class="ai-approval-col-label">Before</div>
                    <pre><code>${beforeHtml}</code></pre>
                </div>
                <div class="ai-approval-col ai-approval-after">
                    <div class="ai-approval-col-label">After</div>
                    <pre><code>${afterHtml}</code></pre>
                </div>
            </div>
            <div class="ai-approval-actions">
                <button class="ai-btn-ghost ai-approval-reject"><i class="fa-solid fa-xmark"></i> Reject</button>
                <button class="ai-btn-primary ai-approval-accept"><i class="fa-solid fa-check"></i> Accept &amp; apply</button>
            </div>
        </div>
    </div>`;
}

// Compact inline record left in the transcript after a change is accepted/rejected.
export function approvalRecord({ operation, path, accepted }) {
    return `
    <div class="ai-approval-record ai-approval-record-${accepted ? 'accepted' : 'rejected'}">
        <i class="fa-solid fa-${accepted ? 'check' : 'xmark'}"></i>
        <span>${accepted ? 'Accepted' : 'Rejected'} — ${escapeHtml(opLabelFor(operation))} <code>${escapeHtml(path || '(whole CV)')}</code></span>
    </div>`;
}

export function cssPreviewCard(css, summary) {
    const preview = css.length > 500 ? css.slice(0, 500) + '\n...' : css;

    return `
    <div class="ai-cv-preview">
        <div class="ai-cv-preview-header">
            <span>Style update${summary ? `: ${escapeHtml(summary)}` : ''}</span>
        </div>
        <pre class="ai-cv-preview-code"><code>${escapeHtml(preview)}</code></pre>
        <button class="ai-btn-primary ai-apply-btn"
                data-action="apply-css"
                data-css='${escapeAttr(css)}'>
            Apply Styles
        </button>
    </div>`;
}

export function clarificationCard(question, options) {
    const optionBtns = options.map(opt =>
        `<button class="ai-clarification-option" data-action="clarification-respond" data-option="${escapeAttr(opt)}">${escapeHtml(opt)}</button>`
    ).join('');

    return `
    <div class="ai-clarification">
        <div class="ai-clarification-question">${escapeHtml(question)}</div>
        <div class="ai-clarification-options">
            ${optionBtns}
        </div>
        <div class="ai-clarification-custom">
            <input type="text" class="ai-clarification-input" placeholder="Or type a custom response..." />
            <button class="ai-btn-primary ai-clarification-send" data-action="clarification-respond-custom">
                <i class="fa-solid fa-paper-plane"></i>
            </button>
        </div>
    </div>`;
}

export function fileAttachmentPill(file) {
    const size = formatByteSize(file.size);
    return `
    <span class="ai-file-pill" data-filename="${escapeAttr(file.name)}">
        ${escapeHtml(file.name)} <span class="ai-file-size">(${size})</span>
        <button data-action="remove-file" data-filename="${escapeAttr(file.name)}" class="ai-file-remove">&times;</button>
    </span>`;
}

export function errorBubble(message) {
    return `
    <div class="ai-message ai-msg-error">
        <div class="ai-message-label">Error</div>
        <div class="ai-message-content">${escapeHtml(message)}</div>
    </div>`;
}

export function typingIndicator() {
    return `
    <div class="ai-message ai-msg-assistant ai-typing" id="aiTyping">
        <div class="ai-message-label">AI</div>
        <div class="ai-message-content">
            <span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span>
        </div>
    </div>`;
}

export function chatListDropdown(chats) {
    return chats.map(c => `
        <div class="ai-chat-list-item" data-action="load-chat" data-chat-id="${c.id}">
            <span>${escapeHtml(c.title)}</span>
            <small>${new Date(c.updatedAt).toLocaleDateString()}</small>
        </div>
    `).join('');
}

export function generationStepSkeleton(stepId, label) {
    return `<div class="ai-gen-step" data-step-id="${escapeAttr(stepId)}">
        <div class="ai-gen-step-indicator">
            <span class="ai-gen-step-spinner"></span>
            <span class="ai-gen-step-label">${escapeHtml(label)}</span>
        </div>
    </div>`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}
