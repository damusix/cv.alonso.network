// AI UI Coordinator — manages settings/chat screens and event delegation

import { db } from '../db/db.js';
import { emit, on } from '../observable.js';
import { attempt, clone, reach, setDeep, throttle, debounce, formatByteSize } from '../utils.js';
import { estimateTokens, trimChatHistory, formatTranscript, truncateSummary } from './memory.js';
import { configureSearch } from './search.js';
import { renderCV } from '../cv-renderer.js';
import { saveCVData, loadSavedData } from '../storage.js';
import { applyStyles, getCurrentStyles } from '../styles.js';
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
    profileEditDialog,
    clarificationCard,
    PROVIDERS
} from './templates.js';

// ─── Internal State ──────────────────────────────────────────────────────────

let agent = null;
let currentChatId = null;
let currentScreen = 'settings';
let pendingAttachments = [];
let pendingClarificationRespond = null;

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

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

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

function formatApiError(err) {
    if (!err) return 'An unknown error occurred.';
    const msg = err.message || String(err);

    // HTTP status codes from provider APIs
    if (msg.includes('529') || msg.includes('overloaded'))
        return 'The API is currently overloaded. Please wait a moment and try again.';
    if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('authentication'))
        return 'Invalid API key. Check your key in Settings.';
    if (msg.includes('403') || msg.includes('Forbidden'))
        return 'Access denied. Your API key may lack the required permissions.';
    if (msg.includes('404'))
        return 'Model not found. Check the model name in Settings.';
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('Rate limit'))
        return 'Rate limit exceeded. Please wait a moment and try again.';
    if (msg.includes('500') || msg.includes('Internal Server Error'))
        return 'The API returned a server error. Please try again.';
    if (msg.includes('502') || msg.includes('503'))
        return 'The API is temporarily unavailable. Please try again shortly.';
    if (msg.includes('timeout') || msg.includes('Timeout'))
        return 'The request timed out. Please try again.';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError'))
        return 'Network error — check your internet connection.';
    if (msg.includes('not configured'))
        return 'AI agent not configured. Set up your API key in Settings.';

    // Truncate overly long LangChain error messages
    return msg.length > 200 ? msg.slice(0, 200) + '…' : msg;
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
    const [documents] = await attempt(() => db.getAllDocuments());
    container.innerHTML = settingsScreen(settings || {}, chats || [], documents || []);
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

    // Clear input and attachments
    if (textarea) {
        textarea.value = '';
        textarea.style.height = 'auto';
    }
    const attachmentsForAgent = [...pendingAttachments];
    pendingAttachments = [];
    const attachmentsEl = document.getElementById('aiAttachments');
    if (attachmentsEl) attachmentsEl.innerHTML = '';

    // Save attached files to documents table and collect IDs for message association
    const attachedDocIds = [];
    if (attachmentsForAgent.length > 0) {
        for (const attachment of attachmentsForAgent) {
            // Reuse existing document if same name already uploaded
            const [existingDocs] = await attempt(() => db.getAllDocuments());
            const existing = existingDocs?.find(d => d.name === attachment.name);
            if (existing) {
                attachedDocIds.push(existing.id);
                continue;
            }

            const [doc] = await attempt(() => db.addDocument({
                name: attachment.name,
                type: attachment.type,
                size: attachment.size,
                data: attachment.base64
            }));
            if (!doc) continue;
            attachedDocIds.push(doc.id);

            // Summarize in background
            if (agent?.isConfigured) (async () => {
                let summary = null;
                let extracted = null;
                const blob = await fetch(attachment.base64).then(r => r.blob());
                const file = new File([blob], attachment.name, { type: attachment.type });
                const [extractedText] = await attempt(() => extractTextFromFile(file));

                if (extractedText) {
                    extracted = extractedText;
                    [summary] = await attempt(() => agent.summarizeDocument(extractedText, attachment.name));
                } else if (attachment.type.startsWith('image/')) {
                    [summary] = await attempt(() => agent.summarizeImage(attachment.base64, attachment.name));
                    extracted = summary;
                }

                if (summary) {
                    await attempt(() => db.updateDocumentSummary(doc.id, summary, extracted));
                    await refreshDocumentContext();
                }
            })();
        }
    }

    // Save to DB — include attachment filenames and document associations
    const attachmentSuffix = attachmentsForAgent.length > 0
        ? '\n' + attachmentsForAgent.map(a => `[Attached: ${a.name}]`).join('\n')
        : '';
    const messageInput = { role: 'user', content: text + attachmentSuffix };
    if (attachedDocIds.length > 0) messageInput.documentIds = attachedDocIds;

    const [savedUserMsg] = await attempt(() => db.saveMessage(currentChatId, messageInput));
    if (savedUserMsg?.id && userBubbleEl) {
        userBubbleEl.dataset.messageId = savedUserMsg.id;
        userBubbleEl.insertAdjacentHTML('afterbegin',
            `<div class="ai-msg-actions">
                <button class="ai-msg-action-btn" data-action="retry-message" title="Retry"><i class="fa-solid fa-rotate-right"></i></button>
                <button class="ai-msg-action-btn" data-action="edit-message" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="ai-msg-action-btn" data-action="delete-message" title="Delete">&times;</button>
            </div>`);
    }

    // Show typing indicator and lock input
    messagesEl.insertAdjacentHTML('beforeend', typingIndicator());
    scrollMessagesToBottom();
    setInputLoading(true);

    // Process with agent
    const bubbleState = { assistantBubble: null, contentEl: null };
    let fullResponse = '';
    let classifiedIntent = null;

    // Build chat history from IndexedDB (source of truth)
    // Augment messages that have linked documents with their summaries
    const [allMessages] = await attempt(() => db.getMessages(currentChatId));
    const dbMessages = [];
    for (const m of (allMessages || [])) {
        let content = m.content;
        if (m.documentIds?.length) {
            const summaryParts = [];
            for (const docId of m.documentIds) {
                const [doc] = await attempt(() => db.db.documents.get(docId));
                if (doc?.summary) {
                    summaryParts.push(`[Document: ${doc.name}]\n${doc.summary}`);
                }
            }
            if (summaryParts.length > 0) {
                content += '\n\n' + summaryParts.join('\n\n');
            }
        }
        dbMessages.push({ role: m.role, content });
    }

    // Load existing summary
    const [existingSummary] = await attempt(() => db.getSummary(currentChatId));

    // Trim to token budget
    const summaryTokens = existingSummary ? estimateTokens(existingSummary) : 0;
    const { kept: chatHistory, dropped } = trimChatHistory(dbMessages, { summaryTokens });

    // Summarize dropped messages if any
    let summary = existingSummary || null;
    if (dropped.length > 0 && agent) {
        const transcript = formatTranscript(dropped);
        const [newSummary] = await attempt(() => agent.summarize(transcript, existingSummary));
        if (newSummary) {
            summary = truncateSummary(newSummary);
            await attempt(() => db.setSummary(currentChatId, summary));
        }
    }

    const savedData = loadSavedData();
    const editorContext = {
        js: savedData.code || (savedData.result ? `return ${JSON.stringify(savedData.result, null, 4)};` : null),
        css: await getCurrentStyles() || null,
    };

    // Register clarification listener before streaming
    const cleanupClarification = on('ai:clarification-request', ({ question, options, respond }) => {
        ensureAssistantBubble(bubbleState, messagesEl);
        flushRemainingTokens();
        bubbleState.contentEl.insertAdjacentHTML('beforeend', clarificationCard(question, options));
        scrollMessagesToBottom();
        pendingClarificationRespond = respond;
    });

    const [stream, streamErr] = await attempt(() =>
        agent.processMessage(text, chatHistory, attachmentsForAgent, editorContext, summary)
    );

    if (streamErr) {
        removeTypingIndicator();
        setInputLoading(false);
        cleanupClarification();
        pendingClarificationRespond = null;

        if (!isAbortError(streamErr)) showErrorInChat(formatApiError(streamErr));

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
                    // Also update status bar inside assistant bubble
                    ensureAssistantBubble(bubbleState, messagesEl);
                    updateBubbleStatus(bubbleState.assistantBubble, chunk);
                    scrollMessagesToBottom();
                    break;
                }

                case 'token': {
                    ensureAssistantBubble(bubbleState, messagesEl);
                    // Hide status bar while text is streaming — tokens are visible feedback
                    const statusBar = bubbleState.assistantBubble?.querySelector('.ai-bubble-status');
                    if (statusBar) statusBar.hidden = true;
                    fullResponse += chunk;
                    appendToken(bubbleState.contentEl, fullResponse);
                    break;
                }

                case 'gen_step_start': {
                    ensureAssistantBubble(bubbleState, messagesEl);
                    removeGenWorking(bubbleState.contentEl);
                    bubbleState.contentEl.insertAdjacentHTML('beforeend',
                        generationStepSkeleton(chunk.stepId, chunk.label));
                    scrollMessagesToBottom();
                    break;
                }

                case 'gen_step_done': {
                    const stepEl = bubbleState.contentEl?.querySelector(`[data-step-id="${chunk.stepId}"]`);
                    if (stepEl) {
                        const indicator = stepEl.querySelector('.ai-gen-step-indicator');
                        if (indicator) {
                            const label = indicator.querySelector('.ai-gen-step-label')?.textContent || '';
                            indicator.classList.add('ai-gen-step-done');
                            indicator.innerHTML = `<i class="fa-solid fa-check"></i><span class="ai-gen-step-label">${label}</span>`;
                        }
                    }
                    appendGenWorking(bubbleState.contentEl);
                    scrollMessagesToBottom();
                    break;
                }

                case 'gen_step_error': {
                    const stepEl = bubbleState.contentEl?.querySelector(`[data-step-id="${chunk.stepId}"]`);
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
                    removeGenWorking(bubbleState.contentEl);
                    ensureAssistantBubble(bubbleState, messagesEl);
                    bubbleState.contentEl.insertAdjacentHTML('beforeend', cvPreviewCard(chunk, null));
                    scrollMessagesToBottom();
                    break;
                }

                case 'cv_section': {
                    flushRemainingTokens();
                    ensureAssistantBubble(bubbleState, messagesEl);
                    bubbleState.contentEl.insertAdjacentHTML('beforeend', cvPreviewCard(chunk.data, chunk.path, chunk.operation));
                    scrollMessagesToBottom();
                    break;
                }

                case 'css_update': {
                    flushRemainingTokens();
                    ensureAssistantBubble(bubbleState, messagesEl);
                    bubbleState.contentEl.insertAdjacentHTML('beforeend', cssPreviewCard(chunk.css, chunk.summary));
                    scrollMessagesToBottom();
                    break;
                }

                case 'error': {
                    showErrorInChat(formatApiError({ message: chunk }));
                    break;
                }

                case 'done': {
                    flushRemainingTokens();
                    removeGenWorking(bubbleState.contentEl);
                    removeBubbleStatus(bubbleState.assistantBubble);

                    // Add "Apply All" button if there are multiple CV preview cards
                    if (bubbleState.contentEl) {
                        const previewCards = bubbleState.contentEl.querySelectorAll('.ai-cv-preview [data-action="apply-cv"]');
                        if (previewCards.length > 1) {
                            bubbleState.contentEl.insertAdjacentHTML('beforeend', applyAllButton());
                        }
                    }

                    const [savedAssistantMsg] = await attempt(() => db.saveMessage(currentChatId, {
                        role: 'assistant',
                        content: fullResponse
                    }));
                    if (savedAssistantMsg?.id && bubbleState.assistantBubble) {
                        bubbleState.assistantBubble.dataset.messageId = savedAssistantMsg.id;
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
    removeBubbleStatus(bubbleState.assistantBubble);
    cleanupClarification();
    pendingClarificationRespond = null;
    // Disable any unanswered clarification cards
    const openCards = messagesEl?.querySelectorAll('.ai-clarification:not(.ai-clarification-answered)');
    if (openCards) {
        for (const card of openCards) card.classList.add('ai-clarification-answered');
    }

    if (iterErr && !isAbortError(iterErr)) {
        showErrorInChat(formatApiError(iterErr));
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

function ensureAssistantBubble(state, messagesEl) {
    if (!state.assistantBubble) {
        removeTypingIndicator();
        state.assistantBubble = createAssistantBubble();
        state.contentEl = state.assistantBubble.querySelector('.ai-message-content');
        messagesEl.appendChild(state.assistantBubble);
    }
}

async function deleteMessageAndTail(msgEl, msgId) {
    await attempt(() => db.deleteMessagesFrom(currentChatId, msgId));
    while (msgEl.nextElementSibling) {
        msgEl.nextElementSibling.remove();
    }
    msgEl.remove();
}

function updateBubbleStatus(bubble, text) {
    if (!bubble) return;
    let bar = bubble.querySelector('.ai-bubble-status');
    if (!bar) {
        bubble.insertAdjacentHTML('beforeend',
            '<div class="ai-bubble-status"><span class="ai-gen-step-spinner"></span><span class="ai-bubble-status-text"></span></div>');
        bar = bubble.querySelector('.ai-bubble-status');
    }
    bar.querySelector('.ai-bubble-status-text').textContent = text + '...';
    bar.hidden = false;
}

function removeBubbleStatus(bubble) {
    bubble?.querySelector('.ai-bubble-status')?.remove();
}

function markButtonApplied(btn) {
    btn.textContent = 'Applied';
    btn.disabled = true;
    btn.classList.remove('ai-btn-primary');
    btn.classList.add('ai-btn-ghost');
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

// ─── Document Text Extraction ─────────────────────────────────────────────────

async function extractTextFromFile(file) {
    const type = file.type;
    const name = file.name.toLowerCase();

    // Plain text formats
    if (type.startsWith('text/') || name.endsWith('.md') || name.endsWith('.csv') || name.endsWith('.txt')) {
        return file.text();
    }

    // PDF
    if (type === 'application/pdf' || name.endsWith('.pdf')) {
        return extractPdfText(file);
    }

    // DOCX
    if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) {
        return extractDocxText(file);
    }

    // Images — return null; will be sent as base64 to model for description
    if (type.startsWith('image/')) {
        return null;
    }

    throw new Error(`Unsupported file type: ${type || name}`);
}

async function extractPdfText(file) {
    const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => item.str).join(' '));
    }
    return pages.join('\n\n');
}

async function extractDocxText(file) {
    const mammoth = await import('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/+esm');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

async function refreshDocumentContext() {
    if (!agent) return;
    const [summaries] = await attempt(() => db.getDocumentSummaries());
    agent.setDocumentContext(summaries || []);
    agent.setDocumentReader(async (name) => {
        const [docs] = await attempt(() => db.getAllDocuments());
        const doc = docs?.find(d => d.name === name);
        return doc?.extractedText || doc?.summary || null;
    });
    const [facts] = await attempt(() => db.getLearnedFacts());
    agent.setLearnedFacts(facts || [], (fact) => db.addLearnedFact(fact));
}

// ─── Apply CV ────────────────────────────────────────────────────────────────

export function applyCvFromAI(cvData, path, operation = 'set') {
    let finalData;

    if (!path) {
        // Full generation
        finalData = cvData;
    } else {
        // Partial update via dot-path
        const saved = loadSavedData();
        if (!saved.result) return;

        finalData = clone(saved.result);

        if (operation === 'delete') {
            const segments = path.split('.');
            const index = Number(segments.pop());
            const parentPath = segments.join('.');
            const parent = parentPath ? reach(finalData, parentPath) : finalData;

            if (Array.isArray(parent) && !isNaN(index)) {
                parent.splice(index, 1);
            }
        } else if (operation === 'insert') {
            const segments = path.split('.');
            const index = Number(segments.pop());
            const parentPath = segments.join('.');
            const parent = parentPath ? reach(finalData, parentPath) : finalData;

            if (Array.isArray(parent) && !isNaN(index)) {
                parent.splice(index, 0, cvData);
            } else {
                setDeep(finalData, path, cvData);
            }
        } else {
            setDeep(finalData, path, cvData);
        }
    }

    const code = `return ${JSON.stringify(finalData, null, 4)};`;
    saveCVData(code, finalData);
    renderCV(finalData);
    emit('ai:cv-applied', { data: { cvData: finalData } });
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
                await deleteMessageAndTail(msgEl, msgId);
                break;
            }

            case 'edit-message': {
                const msgEl = actionEl.closest('.ai-message');
                if (!msgEl) break;
                const msgId = Number(msgEl.dataset.messageId);
                if (!msgId || !currentChatId) break;
                const content = msgEl.querySelector('.ai-message-content')?.textContent?.trim() || '';
                await deleteMessageAndTail(msgEl, msgId);
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
                await deleteMessageAndTail(msgEl, msgId);
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

            case 'upload-document': {
                const docInput = document.getElementById('aiDocInput');
                if (!docInput) break;
                docInput.click();
                docInput.onchange = async () => {
                    const files = Array.from(docInput.files || []);
                    if (files.length === 0) return;

                    for (const file of files) {
                        const [base64] = await attempt(() => readFileAsBase64(file));
                        if (!base64) continue;

                        const [doc] = await attempt(() => db.addDocument({
                            name: file.name, type: file.type, size: file.size, data: base64
                        }));
                        if (!doc) continue;

                        // Add row to the list immediately
                        const listEl = container.querySelector('.ai-documents-list');
                        if (listEl) {
                            // Remove placeholder text if present
                            const placeholder = listEl.querySelector('.ai-help-text');
                            if (placeholder) placeholder.remove();

                            listEl.insertAdjacentHTML('afterbegin', `
                                <div class="ai-document-row" data-doc-id="${doc.id}">
                                    <div class="ai-document-info">
                                        <span class="ai-document-name">${escapeHtml(file.name)}</span>
                                        <span class="ai-file-size">(${formatByteSize(file.size)})</span>
                                        <span class="ai-document-status ai-document-summarizing">
                                            <span class="ai-gen-step-spinner"></span> Summarizing…
                                        </span>
                                    </div>
                                    <button class="ai-btn-danger" data-action="delete-document" data-doc-id="${doc.id}">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </div>`);
                        }

                        // Summarize in background (only if agent is configured)
                        if (agent?.isConfigured) (async () => {
                            let summary = null;
                            let extracted = null;
                            const [text] = await attempt(() => extractTextFromFile(file));

                            if (text) {
                                extracted = text;
                                [summary] = await attempt(() => agent.summarizeDocument(text, file.name));
                            } else if (file.type.startsWith('image/')) {
                                [summary] = await attempt(() => agent.summarizeImage(base64, file.name));
                                extracted = summary; // For images, the description IS the text
                            }

                            if (summary) {
                                await attempt(() => db.updateDocumentSummary(doc.id, summary, extracted));
                                await refreshDocumentContext();
                            }

                            // Update status icon
                            const row = container.querySelector(`[data-doc-id="${doc.id}"] .ai-document-status`);
                            if (row) {
                                row.className = summary
                                    ? 'ai-document-status ai-document-summarized'
                                    : 'ai-document-status ai-document-pending';
                                row.innerHTML = summary
                                    ? '<i class="fa-solid fa-check"></i>'
                                    : '<i class="fa-solid fa-clock"></i>';
                            }
                        })();
                    }

                    docInput.value = '';
                };
                break;
            }

            case 'delete-document': {
                const docId = Number(actionEl.dataset.docId);
                if (docId) {
                    await attempt(() => db.deleteDocument(docId));
                    actionEl.closest('.ai-document-row')?.remove();
                    await refreshDocumentContext();
                }
                break;
            }

            case 'edit-profile': {
                const [settings] = await attempt(() => db.getSettings());
                const profile = settings?.['user:profile'] || '';
                const settingsEl = container.querySelector('.ai-settings');
                if (settingsEl) {
                    settingsEl.insertAdjacentHTML('beforeend', profileEditDialog(profile));
                }
                break;
            }

            case 'save-profile': {
                const textarea = document.getElementById('aiProfileInput');
                const profileValue = textarea ? textarea.value : '';
                await attempt(() => db.db.settings.put({ key: 'user:profile', value: profileValue }));
                // Remove overlay
                container.querySelector('.ai-profile-editor-overlay')?.remove();
                // Update preview
                const preview = container.querySelector('.ai-profile-preview');
                if (preview) {
                    const { renderMarkdown } = await import('../markdown.js');
                    const display = profileValue.length > 300
                        ? profileValue.slice(0, 300) + '...'
                        : profileValue;
                    preview.innerHTML = profileValue ? renderMarkdown(display) : '';
                }
                // Reconfigure agent with updated settings
                if (agent) {
                    const [freshSettings] = await attempt(() => db.getSettings());
                    if (freshSettings) await attempt(() => agent.configure(freshSettings));
                }
                break;
            }

            case 'cancel-profile': {
                container.querySelector('.ai-profile-editor-overlay')?.remove();
                break;
            }

            case 'clarification-respond': {
                const option = actionEl.dataset.option;
                if (option && pendingClarificationRespond) {
                    const respondFn = pendingClarificationRespond;
                    pendingClarificationRespond = null;
                    const card = actionEl.closest('.ai-clarification');
                    if (card) card.classList.add('ai-clarification-answered');
                    respondFn(`User selected: ${option}`);
                }
                break;
            }

            case 'clarification-respond-custom': {
                const input = actionEl.closest('.ai-clarification-custom')?.querySelector('.ai-clarification-input');
                const text = input?.value?.trim();
                if (text && pendingClarificationRespond) {
                    const respondFn = pendingClarificationRespond;
                    pendingClarificationRespond = null;
                    const card = actionEl.closest('.ai-clarification');
                    if (card) card.classList.add('ai-clarification-answered');
                    respondFn(`User responded: ${text}`);
                }
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
                markButtonApplied(actionEl);
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
                    markButtonApplied(btn);
                }
                markButtonApplied(actionEl);
                actionEl.textContent = 'All Applied';
                break;
            }

            case 'apply-css': {
                const css = actionEl.dataset.css;
                if (!css) return;
                applyStyles(css);
                emit('ai:css-applied');
                markButtonApplied(actionEl);
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

    // Handle keydown for textarea submit and clarification input
    container.addEventListener('keydown', async (e) => {
        if (e.target.id === 'aiInput' && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            await handleSendMessage();
        }
        if (e.target.classList.contains('ai-clarification-input') && e.key === 'Enter') {
            e.preventDefault();
            const customBtn = e.target.closest('.ai-clarification-custom')?.querySelector('[data-action="clarification-respond-custom"]');
            if (customBtn) customBtn.click();
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

    // Save Tavily config
    const tavilyApiKey = container.querySelector('#tavilyApiKey')?.value?.trim() || '';
    await attempt(() => db.db.settings.put({
        key: 'tavily:config',
        value: { apiKey: tavilyApiKey }
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
            await refreshDocumentContext();
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
            await refreshDocumentContext();
        }
        // Load the last viewed chat, falling back to most recent
        const lastChatId = settings.lastChatId || null;
        await showChat(container, lastChatId);
    }

    // Single event delegation listener
    setupEventDelegation(container);
}
