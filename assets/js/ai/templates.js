// AI Templates — HTML template functions for settings and chat screens

import { parseMarkdown, renderMarkdown } from '../markdown.js';
import { formatByteSize } from '../utils.js';

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
    }
];

export { PROVIDERS };

export function settingsScreen(settings, chats) {
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

    const render = isUser ? parseMarkdown : renderMarkdown;
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
    const jsonStr = JSON.stringify(cvData, null, 4);
    const preview = jsonStr.length > 500 ? jsonStr.slice(0, 500) + '\n...' : jsonStr;
    const opLabel = operation === 'insert' ? 'Insert at' : 'Partial update';
    const pathLabel = path ? `${opLabel}: ${path}` : 'Full CV generation';

    return `
    <div class="ai-cv-preview">
        <div class="ai-cv-preview-header">
            <span>${pathLabel}</span>
        </div>
        <pre class="ai-cv-preview-code"><code>${escapeHtml(preview)}</code></pre>
        <button class="ai-btn-primary ai-apply-btn"
                data-action="apply-cv"
                data-cv='${escapeAttr(JSON.stringify(cvData))}'
                data-path='${path ? escapeAttr(path) : ''}'
                data-operation='${operation || 'set'}'>
            Apply to CV
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
