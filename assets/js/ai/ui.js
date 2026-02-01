// AI UI Coordinator — manages settings/chat screens and event delegation

import { db } from '../db/db.js';
import { emit } from '../observable.js';
import { attempt, clone, merge, reach, setDeep, throttle, debounce } from '../utils.js';
import { configureSearch } from './search.js';
import { renderCV } from '../cv-renderer.js';
import { applyStyles, getCurrentStyles } from '../styles.js';
import { STORAGE_CODE_KEY, STORAGE_RESULT_KEY, STORAGE_STYLES_KEY } from '../config.js';
import { renderMarkdown } from '../markdown.js';
import {
    settingsScreen,
    chatScreen,
    messageTemplate,
    cvPreviewCard,
    cssPreviewCard,
    applyAllButton,
    errorBubble,
    fileAttachmentPill,
    typingIndicator,
    chatListDropdown,
    generationStepSkeleton,
    PROVIDERS
} from './templates.js';

// ─── Internal State ──────────────────────────────────────────────────────────

let agent = null;
let currentChatId = null;
let currentScreen = 'settings';
let pendingAttachments = [];

// ─── Throttled markdown-rendering token appender ─────────────────────────────

let fullResponseRef = '';
let tokenTarget = null;

export const getCurrentAiScreen = () => currentScreen;

const renderStreamMarkdown = throttle(() => {
    if (tokenTarget && fullResponseRef) {
        const preserved = [...tokenTarget.querySelectorAll('.ai-gen-step, .ai-cv-preview')];
        tokenTarget.innerHTML = renderMarkdown(fullResponseRef);
        for (const el of preserved) tokenTarget.appendChild(el);
        scrollMessagesToBottom();
    }
}, { delay: 500, throws: false });

function appendToken(el, fullResponse) {
    tokenTarget = el;
    fullResponseRef = fullResponse;
    renderStreamMarkdown();
}

function flushRemainingTokens() {
    if (tokenTarget && fullResponseRef) {
        const preserved = [...tokenTarget.querySelectorAll('.ai-gen-step, .ai-cv-preview')];
        tokenTarget.innerHTML = renderMarkdown(fullResponseRef);
        for (const el of preserved) tokenTarget.appendChild(el);
        fullResponseRef = '';
        tokenTarget = null;
        scrollMessagesToBottom();
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scrollMessagesToBottom() {
    const el = document.getElementById('aiMessages');
    if (el) el.scrollTop = el.scrollHeight;
}

function showErrorInChat(message) {
    const messagesEl = document.getElementById('aiMessages');
    if (messagesEl) {
        messagesEl.insertAdjacentHTML('beforeend', errorBubble(message));
        scrollMessagesToBottom();
    }
}

function getContainer() {
    return document.querySelector('.ai-settings, .ai-chat')?.parentElement;
}

const autoResizeTextarea = debounce((textarea) => {
    textarea.style.height = 'auto';
    const maxHeight = 150;
    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
}, { delay: 16 });

function setInputLoading(loading) {

    const textarea = document.getElementById('aiInput');
    const sendBtn = document.querySelector('.ai-send-btn');

    if (!textarea || !sendBtn) return;

    if (loading) {
        textarea.disabled = true;

        sendBtn.dataset.action = 'stop-message';
        sendBtn.title = 'Stop';
        sendBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';

        sendBtn.classList.remove('ai-btn-primary');
        sendBtn.classList.add('ai-btn-danger');

        return;
    }

    textarea.disabled = false;

    sendBtn.dataset.action = 'send-message';
    sendBtn.title = 'Send';
    sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';

    sendBtn.classList.remove('ai-btn-danger');
    sendBtn.classList.add('ai-btn-primary');

    textarea.focus();
}

function isAbortError(err) {
    if (!err) return false;
    return err.name === 'AbortError'
        || (err.message && err.message.includes('aborted'));
}

// ─── API Key Validation ──────────────────────────────────────────────────────

const validators = {
    'openai': async (apiKey) => {
        const res = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!res.ok) throw new Error(`OpenAI: ${res.status}`);
    },
    'anthropic': async (apiKey, model) => {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model || 'claude-haiku-4-5-20241022',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'hi' }]
            })
        });
        if (!res.ok) throw new Error(`Anthropic: ${res.status}`);
    },
    'google-genai': async (apiKey) => {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        if (!res.ok) throw new Error(`Gemini: ${res.status}`);
    }
};
async function validateApiKey(provider, apiKey, model) {
    if (!apiKey) return { provider, valid: false, error: 'No API key provided' };


    const validate = validators[provider];
    if (!validate) return { provider, valid: false, error: 'Unknown provider' };

    const [, err] = await attempt(() => validate(apiKey, model));

    return err
        ? { provider, valid: false, error: err.message }
        : { provider, valid: true, error: null };
}

// ─── Screen Rendering ────────────────────────────────────────────────────────

async function showSettings(container) {
    currentScreen = 'settings';
    const [settings] = await attempt(() => db.getSettings());
    const [chats] = await attempt(() => db.getAllChats());
    container.innerHTML = settingsScreen(settings || {}, chats || []);
}

async function showChat(container, chatId) {
    currentScreen = 'chat';

    let chat = null;
    let messages = [];

    if (chatId) {
        const [loaded] = await attempt(() => db.loadChat(chatId));
        if (loaded) {
            chat = loaded;
            messages = loaded.messages || [];
            currentChatId = chat.id;
        }
    }

    if (!chat) {
        // Try loading the most recent existing chat before creating a new one
        const [allExisting] = await attempt(() => db.getAllChats());
        if (allExisting?.length > 0) {
            const [loaded] = await attempt(() => db.loadChat(allExisting[0].id));
            if (loaded) {
                chat = loaded;
                messages = loaded.messages || [];
                currentChatId = chat.id;
            }
        }
    }

    if (!chat) {
        const [created] = await attempt(() => db.createChat());
        if (created) {
            chat = created;
            currentChatId = chat.id;
        }
    }

    // Persist last viewed chat for reload
    if (currentChatId) {
        await attempt(() => db.db.settings.put({ key: 'lastChatId', value: currentChatId }));
    }

    const [settings] = await attempt(() => db.getSettings());
    const activeProvider = settings?.activeProvider || '';
    const configuredProviders = PROVIDERS.filter(p => {
        const ps = settings?.[`provider:${p.id}`];
        return ps && ps.apiKey;
    });

    container.innerHTML = chatScreen(chat, messages, { configuredProviders, activeProvider });

    // Populate chat selector dropdown
    const [allChats] = await attempt(() => db.getAllChats());
    if (allChats && allChats.length > 0) {
        const select = container.querySelector('.ai-chat-select');
        if (select) {
            select.innerHTML = allChats.map(c =>
                `<option value="${c.id}" ${c.id === currentChatId ? 'selected' : ''}>${c.title}</option>`
            ).join('');
        }
    }

    // Focus input and wire up auto-resize
    const textarea = document.getElementById('aiInput');
    if (textarea) {
        textarea.focus();
        textarea.addEventListener('input', () => autoResizeTextarea(textarea));
    }

    scrollMessagesToBottom();
}

// ─── Message Handling ────────────────────────────────────────────────────────

async function handleSendMessage() {
    const textarea = document.getElementById('aiInput');
    const text = textarea ? textarea.value.trim() : '';

    if (!text && pendingAttachments.length === 0) return;

    const messagesEl = document.getElementById('aiMessages');
    if (!messagesEl) return;

    // Build user message
    const userMsg = {
        role: 'user',
        content: text,
        attachments: pendingAttachments.length > 0
            ? pendingAttachments.map(a => ({ name: a.name, type: a.type, size: a.size }))
            : undefined
    };

    // Render user bubble
    messagesEl.insertAdjacentHTML('beforeend', messageTemplate(userMsg));
    const userBubbleEl = messagesEl.lastElementChild;
    scrollMessagesToBottom();

    // Save to DB and set message ID on DOM element
    const [savedUserMsg] = await attempt(() => db.saveMessage(currentChatId, { role: 'user', content: text }));
    if (savedUserMsg?.id && userBubbleEl) {
        userBubbleEl.dataset.messageId = savedUserMsg.id;
        userBubbleEl.insertAdjacentHTML('afterbegin',
            `<div class="ai-msg-actions">
                <button class="ai-msg-action-btn" data-action="retry-message" title="Retry"><i class="fa-solid fa-rotate-right"></i></button>
                <button class="ai-msg-action-btn" data-action="edit-message" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="ai-msg-action-btn" data-action="delete-message" title="Delete">&times;</button>
            </div>`);
    }

    // Clear input and attachments
    if (textarea) {
        textarea.value = '';
        textarea.style.height = 'auto';
    }
    const attachmentsForAgent = [...pendingAttachments];
    pendingAttachments = [];
    const attachmentsEl = document.getElementById('aiAttachments');
    if (attachmentsEl) attachmentsEl.innerHTML = '';

    // Show typing indicator and lock input
    messagesEl.insertAdjacentHTML('beforeend', typingIndicator());
    scrollMessagesToBottom();
    setInputLoading(true);

    // Process with agent
    let assistantBubble = null;
    let contentEl = null;
    let fullResponse = '';
    let classifiedIntent = null;

    // Build chat history from rendered messages, excluding empty and the just-added user message
    const chatHistory = Array.from(messagesEl.querySelectorAll('.ai-message'))
        .slice(0, -1) // exclude the just-added user message
        .map(el => ({
            role: el.classList.contains('ai-msg-user') ? 'user' : 'assistant',
            content: el.querySelector('.ai-message-content')?.textContent?.trim() || ''
        }))
        .filter(msg => msg.content);

    const editorContext = {
        js: localStorage.getItem(STORAGE_CODE_KEY) || null,
        css: await getCurrentStyles() || null,
    };

    const [stream, streamErr] = await attempt(() =>
        agent.processMessage(text, chatHistory, attachmentsForAgent, editorContext)
    );

    if (streamErr) {
        removeTypingIndicator();
        setInputLoading(false);

        // if (!isAbortError(streamErr)) showErrorInChat(streamErr.message);

        return;
    }

    const [, iterErr] = await attempt(async () => {
        for await (const { type, chunk } of stream) {
            switch (type) {
                case 'intent': {
                    classifiedIntent = chunk;
                    break;
                }

                case 'tool_status': {
                    const typing = document.getElementById('aiTyping');
                    if (typing) {
                        typing.querySelector('.ai-message-content').innerHTML =
                            `<em class="ai-tool-status">${chunk}...</em>`;
                    }
                    scrollMessagesToBottom();
                    break;
                }

                case 'token': {
                    if (!assistantBubble) {
                        removeTypingIndicator();
                        assistantBubble = createAssistantBubble();
                        contentEl = assistantBubble.querySelector('.ai-message-content');
                        messagesEl.appendChild(assistantBubble);
                    }
                    fullResponse += chunk;
                    appendToken(contentEl, fullResponse);
                    break;
                }

                case 'gen_step_start': {
                    if (!assistantBubble) {
                        removeTypingIndicator();
                        assistantBubble = createAssistantBubble();
                        contentEl = assistantBubble.querySelector('.ai-message-content');
                        messagesEl.appendChild(assistantBubble);
                    }
                    removeGenWorking(contentEl);
                    contentEl.insertAdjacentHTML('beforeend',
                        generationStepSkeleton(chunk.stepId, chunk.label));
                    scrollMessagesToBottom();
                    break;
                }

                case 'gen_step_done': {
                    const stepEl = contentEl?.querySelector(`[data-step-id="${chunk.stepId}"]`);
                    if (stepEl) {
                        const indicator = stepEl.querySelector('.ai-gen-step-indicator');
                        if (indicator) {
                            const label = indicator.querySelector('.ai-gen-step-label')?.textContent || '';
                            indicator.classList.add('ai-gen-step-done');
                            indicator.innerHTML = `<i class="fa-solid fa-check"></i><span class="ai-gen-step-label">${label}</span>`;
                        }
                    }
                    appendGenWorking(contentEl);
                    scrollMessagesToBottom();
                    break;
                }

                case 'gen_step_error': {
                    const stepEl = contentEl?.querySelector(`[data-step-id="${chunk.stepId}"]`);
                    if (stepEl) {
                        const indicator = stepEl.querySelector('.ai-gen-step-indicator');
                        if (indicator) {
                            const label = indicator.querySelector('.ai-gen-step-label')?.textContent || '';
                            indicator.classList.add('ai-gen-step-failed');
                            indicator.innerHTML = `<i class="fa-solid fa-xmark"></i><span class="ai-gen-step-label">${label} — ${chunk.error}</span>`;
                        }
                    }
                    scrollMessagesToBottom();
                    break;
                }

                case 'cv_data': {
                    flushRemainingTokens();
                    removeGenWorking(contentEl);
                    if (!assistantBubble) {
                        removeTypingIndicator();
                        assistantBubble = createAssistantBubble();
                        contentEl = assistantBubble.querySelector('.ai-message-content');
                        messagesEl.appendChild(assistantBubble);
                    }
                    contentEl.insertAdjacentHTML('beforeend', cvPreviewCard(chunk, null));
                    scrollMessagesToBottom();
                    break;
                }

                case 'cv_section': {
                    flushRemainingTokens();
                    if (!assistantBubble) {
                        removeTypingIndicator();
                        assistantBubble = createAssistantBubble();
                        contentEl = assistantBubble.querySelector('.ai-message-content');
                        messagesEl.appendChild(assistantBubble);
                    }
                    contentEl.insertAdjacentHTML('beforeend', cvPreviewCard(chunk.data, chunk.path, chunk.operation));
                    scrollMessagesToBottom();
                    break;
                }

                case 'css_update': {
                    flushRemainingTokens();
                    if (!assistantBubble) {
                        removeTypingIndicator();
                        assistantBubble = createAssistantBubble();
                        contentEl = assistantBubble.querySelector('.ai-message-content');
                        messagesEl.appendChild(assistantBubble);
                    }
                    contentEl.insertAdjacentHTML('beforeend', cssPreviewCard(chunk.css, chunk.summary));
                    scrollMessagesToBottom();
                    break;
                }

                case 'error': {
                    // if (!isAbortError({ message: chunk })) {
                        showErrorInChat(chunk);
                    // }
                    break;
                }

                case 'done': {
                    flushRemainingTokens();
                    removeGenWorking(contentEl);

                    // Add "Apply All" button if there are multiple CV preview cards
                    if (contentEl) {
                        const previewCards = contentEl.querySelectorAll('.ai-cv-preview [data-action="apply-cv"]');
                        if (previewCards.length > 1) {
                            contentEl.insertAdjacentHTML('beforeend', applyAllButton());
                        }
                    }

                    const [savedAssistantMsg] = await attempt(() => db.saveMessage(currentChatId, {
                        role: 'assistant',
                        content: fullResponse
                    }));
                    if (savedAssistantMsg?.id && assistantBubble) {
                        assistantBubble.dataset.messageId = savedAssistantMsg.id;
                    }

                    // Update title if the router decided the topic is clear
                    if (classifiedIntent?.shouldUpdateTitle && classifiedIntent?.suggestedTitle) {
                        await attempt(() => db.setTitle(currentChatId, classifiedIntent.suggestedTitle));
                        const select = getContainer()?.querySelector('.ai-chat-select');
                        if (select) {
                            const opt = select.querySelector(`option[value="${currentChatId}"]`);
                            if (opt) opt.textContent = classifiedIntent.suggestedTitle;
                        }
                    }
                    break;
                }
            }
        }
    });

    removeTypingIndicator();

    if (iterErr && !isAbortError(iterErr)) {
        showErrorInChat(iterErr.message);
    }

    setInputLoading(false);
    scrollMessagesToBottom();
}

function removeTypingIndicator() {
    const typing = document.getElementById('aiTyping');
    if (typing) typing.remove();
}

function removeGenWorking(el) {
    el?.querySelector('.ai-gen-working')?.remove();
}

function appendGenWorking(el) {
    if (!el) return;
    removeGenWorking(el);
    el.insertAdjacentHTML('beforeend',
        '<div class="ai-gen-working"><span class="ai-gen-step-spinner"></span></div>');
}

function createAssistantBubble() {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = messageTemplate({ role: 'assistant', content: '' });
    return wrapper.firstElementChild;
}

// ─── File Upload ─────────────────────────────────────────────────────────────

function handleFileUpload() {
    const fileInput = document.getElementById('aiFileInput');
    if (!fileInput) return;

    fileInput.click();

    // Use one-time listener to avoid stacking
    fileInput.onchange = async () => {
        const files = Array.from(fileInput.files || []);
        if (files.length === 0) return;

        for (const file of files) {
            const [result] = await attempt(() => readFileAsBase64(file));
            if (result) {
                pendingAttachments.push({
                    name: file.name,
                    type: file.type,
                    base64: result,
                    size: file.size
                });
            }
        }

        renderAttachmentPills();
        fileInput.value = '';
    };
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function renderAttachmentPills() {
    const el = document.getElementById('aiAttachments');
    if (!el) return;
    el.innerHTML = pendingAttachments.map(f => fileAttachmentPill(f)).join('');
}

// ─── Apply CV ────────────────────────────────────────────────────────────────

export function applyCvFromAI(cvData, path, operation = 'set') {
    if (!path) {
        // Full generation
        const code = `return ${JSON.stringify(cvData, null, 4)};`;
        localStorage.setItem(STORAGE_CODE_KEY, code);
        localStorage.setItem(STORAGE_RESULT_KEY, JSON.stringify(cvData));
        renderCV(cvData);
    } else {
        // Partial update via dot-path
        const savedResult = localStorage.getItem(STORAGE_RESULT_KEY);
        if (!savedResult) return;

        let currentData;
        try {
            currentData = JSON.parse(savedResult);
        } catch {
            return;
        }

        const merged = clone(currentData);

        if (operation === 'insert') {
            // Splice into the parent array at the given index
            const segments = path.split('.');
            const index = Number(segments.pop());
            const parentPath = segments.join('.');
            const parent = parentPath ? reach(merged, parentPath) : merged;

            if (Array.isArray(parent) && !isNaN(index)) {
                parent.splice(index, 0, cvData);
            } else {
                // Fallback to set if parent isn't an array
                setDeep(merged, path, cvData);
            }
        } else {
            setDeep(merged, path, cvData);
        }

        const code = `return ${JSON.stringify(merged, null, 4)};`;
        localStorage.setItem(STORAGE_CODE_KEY, code);
        localStorage.setItem(STORAGE_RESULT_KEY, JSON.stringify(merged));
        renderCV(merged);
    }

    emit('ai:cv-applied');
}

// ─── Event Delegation ────────────────────────────────────────────────────────

function setupEventDelegation(container) {
    container.addEventListener('click', async (e) => {
        const actionEl = e.target.closest('[data-action]');
        if (!actionEl) return;

        const action = actionEl.dataset.action;

        switch (action) {
            case 'save-settings': {
                await handleSaveSettings(container);
                break;
            }

            case 'back-to-chat': {
                await showChat(container, currentChatId);
                break;
            }

            case 'open-settings': {
                await showSettings(container);
                break;
            }

            case 'send-message': {
                await handleSendMessage();
                break;
            }

            case 'stop-message': {
                emit('chat:abort');
                break;
            }

            case 'new-chat': {
                const [created] = await attempt(() => db.createChat());
                if (created) {
                    currentChatId = created.id;
                    await showChat(container, created.id);
                }
                break;
            }

            case 'load-chat': {
                const chatId = Number(actionEl.dataset.chatId);
                if (chatId) await showChat(container, chatId);
                break;
            }

            case 'delete-message': {
                const msgEl = actionEl.closest('.ai-message');
                if (!msgEl) break;
                const msgId = Number(msgEl.dataset.messageId);
                if (!msgId || !currentChatId) break;

                await attempt(() => db.deleteMessagesFrom(currentChatId, msgId));

                while (msgEl.nextElementSibling) {
                    msgEl.nextElementSibling.remove();
                }
                msgEl.remove();
                break;
            }

            case 'edit-message': {
                const msgEl = actionEl.closest('.ai-message');
                if (!msgEl) break;
                const msgId = Number(msgEl.dataset.messageId);
                if (!msgId || !currentChatId) break;

                const content = msgEl.querySelector('.ai-message-content')?.textContent?.trim() || '';

                await attempt(() => db.deleteMessagesFrom(currentChatId, msgId));

                while (msgEl.nextElementSibling) {
                    msgEl.nextElementSibling.remove();
                }
                msgEl.remove();

                const textarea = document.getElementById('aiInput');
                if (textarea) {
                    textarea.value = content;
                    textarea.focus();
                    autoResizeTextarea(textarea);
                }
                break;
            }

            case 'retry-message': {
                const msgEl = actionEl.closest('.ai-message');
                if (!msgEl) break;
                const msgId = Number(msgEl.dataset.messageId);
                if (!msgId || !currentChatId) break;

                const content = msgEl.querySelector('.ai-message-content')?.textContent?.trim() || '';

                // Delete this message and all after it (same as edit)
                await attempt(() => db.deleteMessagesFrom(currentChatId, msgId));

                while (msgEl.nextElementSibling) {
                    msgEl.nextElementSibling.remove();
                }
                msgEl.remove();

                // Re-send immediately
                const textarea = document.getElementById('aiInput');
                if (textarea) {
                    textarea.value = content;
                    await handleSendMessage();
                }
                break;
            }

            case 'delete-chat': {
                const chatId = Number(actionEl.dataset.chatId);
                if (chatId) {
                    await attempt(() => db.deleteChat(chatId));
                    if (currentScreen === 'settings') {
                        await showSettings(container);
                    }
                }
                break;
            }

            case 'file-upload': {
                handleFileUpload();
                break;
            }

            case 'remove-file': {
                const filename = actionEl.dataset.filename;
                pendingAttachments = pendingAttachments.filter(f => f.name !== filename);
                renderAttachmentPills();
                break;
            }

            case 'apply-cv': {
                let parsedCv;
                try {
                    parsedCv = JSON.parse(actionEl.dataset.cv);
                } catch {
                    return;
                }
                applyCvFromAI(parsedCv, actionEl.dataset.path || null, actionEl.dataset.operation || 'set');
                actionEl.textContent = 'Applied';
                actionEl.disabled = true;
                actionEl.classList.remove('ai-btn-primary');
                actionEl.classList.add('ai-btn-ghost');
                break;
            }

            case 'apply-all-cv': {
                // Find all unapplied CV preview buttons in the same message bubble
                const bubble = actionEl.closest('.ai-message');
                if (!bubble) break;
                const applyBtns = bubble.querySelectorAll('[data-action="apply-cv"]:not([disabled])');
                for (const btn of applyBtns) {
                    let parsedCv;
                    try {
                        parsedCv = JSON.parse(btn.dataset.cv);
                    } catch {
                        continue;
                    }
                    applyCvFromAI(parsedCv, btn.dataset.path || null, btn.dataset.operation || 'set');
                    btn.textContent = 'Applied';
                    btn.disabled = true;
                    btn.classList.remove('ai-btn-primary');
                    btn.classList.add('ai-btn-ghost');
                }
                actionEl.textContent = 'All Applied';
                actionEl.disabled = true;
                actionEl.classList.remove('ai-btn-primary');
                actionEl.classList.add('ai-btn-ghost');
                break;
            }

            case 'apply-css': {
                const css = actionEl.dataset.css;
                if (!css) return;
                applyStyles(css);
                emit('ai:css-applied');
                actionEl.textContent = 'Applied';
                actionEl.disabled = true;
                actionEl.classList.remove('ai-btn-primary');
                actionEl.classList.add('ai-btn-ghost');
                break;
            }
        }
    });

    // Handle change events for chat selector
    container.addEventListener('change', async (e) => {
        const actionEl = e.target.closest('[data-action]');
        if (!actionEl) return;

        if (actionEl.dataset.action === 'switch-chat') {
            const chatId = Number(actionEl.value);
            if (chatId && chatId !== currentChatId) {
                await showChat(container, chatId);
            }
        }

        if (actionEl.dataset.action === 'switch-provider') {
            const provider = actionEl.value;
            await attempt(() => db.setActiveProvider(provider));
            const [settings] = await attempt(() => db.getSettings());
            if (settings && agent) {
                await attempt(() => agent.configure(settings));
            }
        }
    });

    // Handle keydown for textarea submit
    container.addEventListener('keydown', async (e) => {
        if (e.target.id === 'aiInput' && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            await handleSendMessage();
        }
    });
}

// ─── Save Settings ───────────────────────────────────────────────────────────

async function handleSaveSettings(container) {
    const saveBtn = container.querySelector('[data-action="save-settings"]');
    const savedLabel = saveBtn?.textContent;
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="ai-gen-step-spinner ai-btn-spinner"></span> Validating';
    }

    const inputs = container.querySelectorAll('[data-provider][data-field]');
    const providerData = {};

    for (const input of inputs) {
        const provider = input.dataset.provider;
        const field = input.dataset.field;
        if (!providerData[provider]) providerData[provider] = {};
        providerData[provider][field] = input.value.trim();
    }

    const activeRadio = container.querySelector('input[name="activeProvider"]:checked');
    const activeProvider = activeRadio ? activeRadio.value : '';

    // Validate API keys in parallel
    const validationPromises = Object.entries(providerData)
        .filter(([, data]) => data.apiKey)
        .map(([provider, data]) => validateApiKey(provider, data.apiKey, data.smallModel));

    const results = await Promise.all(validationPromises);

    const anyValid = results.some(r => r.valid);
    const failures = results.filter(r => !r.valid && r.error !== 'No API key provided');

    // Show validation errors but continue if at least one key works
    if (failures.length > 0 && !anyValid) {
        const errorMsg = failures.map(f => `${f.provider}: ${f.error}`).join('\n');
        emit('ai:settings:error', { message: errorMsg });
        // Still allow saving even if validation fails — user might be offline
    }

    if (saveBtn) {
        saveBtn.innerHTML = '<span class="ai-gen-step-spinner ai-btn-spinner"></span> Saving';
    }

    // Save all provider settings
    for (const [provider, data] of Object.entries(providerData)) {
        await attempt(() => db.setProviderSettings(provider, {
            apiKey: data.apiKey || '',
            smallModel: data.smallModel || '',
            responseModel: data.responseModel || ''
        }));
    }

    if (activeProvider) {
        await attempt(() => db.setActiveProvider(activeProvider));
    }

    // Save search config
    const searchApiKey = container.querySelector('#searchApiKey')?.value?.trim() || '';
    await attempt(() => db.db.settings.put({
        key: 'search:config',
        value: { apiKey: searchApiKey }
    }));

    // Configure agent and search with new settings
    if (agent && activeProvider) {
        const [settings] = await attempt(() => db.getSettings());
        if (settings) {
            const [, configErr] = await attempt(() => agent.configure(settings));
            if (configErr) {
                emit('ai:settings:error', { message: configErr.message });
            }
            configureSearch(settings);
        }
    }

    emit('ai:settings-saved');

    // Navigate to chat
    await showChat(container, currentChatId);
}

// ─── Initialization ──────────────────────────────────────────────────────────

export async function initializeAI(container) {
    const { CvAgent } = await import('./langchain.js');
    agent = new CvAgent();

    const hasSettings = await db.hasValidSettings();

    if (!hasSettings) {
        await showSettings(container);
    } else {
        // Configure agent and search with existing settings
        const [settings] = await attempt(() => db.getSettings());
        if (settings) {
            await attempt(() => agent.configure(settings));
            configureSearch(settings);
        }
        // Load the last viewed chat, falling back to most recent
        const lastChatId = settings.lastChatId || null;
        await showChat(container, lastChatId);
    }

    // Single event delegation listener
    setupEventDelegation(container);
}
