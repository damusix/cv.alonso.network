// AI LangChain Agent — CvAgent class with tool-calling for web fetch, search, and editor context

import { z } from 'https://cdn.jsdelivr.net/npm/zod@3.23.8/+esm';
import { attempt, attemptSync, retry, withTimeout } from '../utils.js';
import {
    AiIntentSchema,
    AiPartialUpdateSchema,
    AiStyleUpdateSchema,
    CVDataSchema,
    LinkSchema,
    PersonalSchema,
    SectionSchema,
} from './schemas.js';
import {
    ROUTER_SYSTEM_PROMPT,
    CHITCHAT_SYSTEM_PROMPT,
    CLARIFICATION_SYSTEM_PROMPT,
    PARTIAL_UPDATE_SYSTEM_PROMPT,
    STYLE_UPDATE_SYSTEM_PROMPT,
    GENERATION_AGENT_PROMPT,
    buildContextPrompt
} from './prompts.js';
import { webSearch, isSearchConfigured } from './search.js';
import { once } from '../observable.js';

// ─── CDN URLs ────────────────────────────────────────────────────────────────

const CDN = {
    openai: 'https://cdn.jsdelivr.net/npm/@langchain/openai@0.5.12/+esm',
    anthropic: 'https://cdn.jsdelivr.net/npm/@langchain/anthropic@0.3.21/+esm',
    'google-genai': 'https://cdn.jsdelivr.net/npm/@langchain/google-genai@0.2.12/+esm',
    core: 'https://cdn.jsdelivr.net/npm/@langchain/core/messages/+esm',
};

// ─── Provider Factories ──────────────────────────────────────────────────────

const PROVIDER_FACTORY = {
    openai: null,
    anthropic: null,
    'google-genai': null,
};

/**
 * Lazy-loads a LangChain provider module from CDN and caches it.
 * @param {'openai'|'anthropic'|'google-genai'} provider
 * @returns {Promise<Function>} The chat model constructor
 */
async function loadProvider(provider) {
    if (PROVIDER_FACTORY[provider]) return PROVIDER_FACTORY[provider];

    const url = CDN[provider];
    if (!url) throw new Error(`Unknown provider: ${provider}`);

    const mod = await import(url);

    const constructors = {
        openai: mod.ChatOpenAI,
        anthropic: mod.ChatAnthropic,
        'google-genai': mod.ChatGoogleGenerativeAI,
    };

    PROVIDER_FACTORY[provider] = constructors[provider];
    return PROVIDER_FACTORY[provider];
}

// ─── LangChain Core Message Classes ──────────────────────────────────────────

let _msgClasses = null;

async function loadMessageClasses() {
    if (_msgClasses) return _msgClasses;
    const mod = await import(CDN.core);
    _msgClasses = { AIMessage: mod.AIMessage, ToolMessage: mod.ToolMessage };
    return _msgClasses;
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

const AGENT_TOOLS = [
    {
        name: 'read_resume',
        description: 'Read the user\'s current CV/resume data from the editor. Call this when the user asks you to review their resume, or when you need to see their existing data before generating or updating.',
        schema: z.object({}),
    },
    {
        name: 'read_styles',
        description: 'Read the user\'s current custom CSS styles from the editor.',
        schema: z.object({}),
    },
    {
        name: 'web_fetch',
        description: 'Fetch and read the text content of a web page. Use when the user provides a URL to read, such as job postings, company pages, or articles.',
        schema: z.object({
            url: z.string().describe('The URL of the web page to fetch'),
        }),
    },
    {
        name: 'web_search',
        description: 'Search the web for current information. Use for questions requiring real-time data like salary info, industry trends, company details, or best practices.',
        schema: z.object({
            query: z.string().describe('The search query'),
        }),
    },
];

const GENERATION_TOOLS = [
    {
        name: 'set_personal_info',
        description: 'Set the personal/contact information block for the CV. Call this exactly once.',
        schema: PersonalSchema.describe('Personal information for the CV'),
    },
    {
        name: 'set_summary',
        description: 'Set the professional summary paragraph. Call this once with a 2-4 sentence summary.',
        schema: z.object({
            summary: z.string().min(1).describe('Professional summary with markdown support'),
        }),
    },
    {
        name: 'add_section',
        description: 'Add a CV section (e.g. experience, education, skills, projects). Call once per section.',
        schema: SectionSchema.describe('A CV section with heading and items'),
    },
];

const GEN_TOOL_NAMES = { set_personal_info: true, set_summary: true, add_section: true };

const TOOL_STATUS_LABELS = {
    read_resume: 'Reading resume',
    read_styles: 'Reading styles',
    web_fetch: 'Fetching page',
    web_search: 'Searching web',
    set_personal_info: 'Generating personal info',
    set_summary: 'Writing summary',
    add_section: 'Generating section',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LLM_TIMEOUT = 60_000;
const MAX_TOOL_ROUNDS = 5;

/**
 * Extracts a single balanced JSON object starting from a position in text.
 * @param {string} text
 * @param {number} startFrom - Index to start searching from
 * @returns {{parsed: object|null, endIndex: number}}
 */
function extractBalancedJson(text, startFrom = 0) {
    const start = text.indexOf('{', startFrom);
    if (start === -1) return { parsed: null, endIndex: text.length };

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                const [parsed] = attemptSync(() => JSON.parse(text.slice(start, i + 1)));
                return { parsed, endIndex: i + 1 };
            }
        }
    }

    return { parsed: null, endIndex: text.length };
}

/**
 * Extracts JSON from a string that may contain ```json fences,
 * raw JSON, or JSON embedded in surrounding prose text.
 * @param {string} text
 * @returns {object|null}
 */
function extractJson(text) {
    // 1. Try ```json fences
    const fenceMatch = text.match(/```json\s*\n?([\s\S]*?)```/);
    if (fenceMatch) {
        const [parsed] = attemptSync(() => JSON.parse(fenceMatch[1].trim()));
        if (parsed) return parsed;
    }

    // 2. Try raw text as-is
    const [direct] = attemptSync(() => JSON.parse(text.trim()));
    if (direct) return direct;

    // 3. Find first balanced JSON object from surrounding text
    const { parsed } = extractBalancedJson(text);
    return parsed;
}

/**
 * Extracts ALL JSON objects from a string. Finds objects in ```json fences
 * first, then falls back to scanning for balanced braces.
 * @param {string} text
 * @returns {object[]}
 */
function extractAllJson(text) {
    const results = [];

    // 1. Try all ```json fences
    const fenceRegex = /```json\s*\n?([\s\S]*?)```/g;
    let fenceMatch;
    while ((fenceMatch = fenceRegex.exec(text)) !== null) {
        const [parsed] = attemptSync(() => JSON.parse(fenceMatch[1].trim()));
        if (parsed) results.push(parsed);
    }
    if (results.length > 0) return results;

    // 2. Scan for all balanced JSON objects
    let pos = 0;
    while (pos < text.length) {
        const { parsed, endIndex } = extractBalancedJson(text, pos);
        if (!parsed) break;
        results.push(parsed);
        pos = endIndex;
    }

    return results;
}

/**
 * Fetches a web page and extracts readable text content.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchPageContent(url, { signal } = {}) {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const html = await res.text();

    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const el of doc.querySelectorAll('script, style, nav, footer, header, iframe, noscript')) {
        el.remove();
    }

    const main = doc.querySelector('main, article, [role="main"]') || doc.body;
    const title = doc.querySelector('title')?.textContent?.trim() || '';
    const text = main?.textContent?.replace(/\s+/g, ' ')?.trim() || '';

    const maxChars = 15_000;
    const truncated = text.length > maxChars ? text.slice(0, maxChars) + '\n[Truncated]' : text;

    return `Page: ${title}\nURL: ${url}\n\n${truncated}`;
}

/**
 * Formats attachments into LangChain multipart content blocks.
 * @param {string} textContent - The text message
 * @param {Array<{type: string, name: string, data: string}>} attachments
 * @returns {string|Array<object>} Plain string or multipart content array
 */
function formatUserContent(textContent, attachments) {
    if (!attachments || attachments.length === 0) return textContent;

    const parts = [];

    for (const attachment of attachments) {
        if (attachment.type.startsWith('image/')) {
            parts.push({
                type: 'image_url',
                image_url: { url: attachment.data },
            });
        } else {
            parts.push({
                type: 'text',
                text: `[Attached file: ${attachment.name}]\n${attachment.data}`,
            });
        }
    }

    parts.push({ type: 'text', text: textContent });
    return parts;
}

/**
 * Converts chat history into LangChain message format.
 * Filters out empty messages and merges consecutive same-role messages
 * to satisfy provider requirements (e.g. Anthropic requires alternating roles).
 * @param {Array<{role: string, content: string}>} history
 * @returns {Array<[string, string]>} LangChain tuple messages
 */
function toLangChainMessages(history) {
    const filtered = history.filter(msg => msg.content && msg.content.trim());

    const merged = [];
    for (const msg of filtered) {
        const lcRole = msg.role === 'assistant' ? 'ai' : 'human';
        const last = merged[merged.length - 1];
        if (last && last[0] === lcRole) {
            last[1] += '\n' + msg.content;
        } else {
            merged.push([lcRole, msg.content]);
        }
    }

    return merged;
}

// ─── CvAgent ─────────────────────────────────────────────────────────────────

export class CvAgent {
    /** @type {object|null} LangChain chat model for routing (cheap/small) */
    #routerModel = null;

    /** @type {object|null} LangChain chat model for generation (reasoning) */
    #generatorModel = null;

    /** @type {object|null} Generator model with agent tools only */
    #agentToolModel = null;

    /** @type {object|null} Generator model with agent + generation tools */
    #genToolModel = null;

    /** @type {object} Accumulated context from clarification rounds */
    #contextBuffer = {};

    /** @type {string|null} Active provider name */
    #provider = null;

    /** @type {{js: string|null, css: string|null}} Current editor context for tool access */
    #editorContext = {};

    /** @type {object|null} Accumulates generation tool results during full generation */
    #generationAccumulator = null;

    /**
     * Configures the agent with provider settings. Instantiates both
     * a cheap router model and a reasoning generator model with tools.
     *
     * @param {object} settings
     * @param {string} settings.activeProvider - 'openai' | 'anthropic' | 'google-genai'
     * @param {object} settings['provider:openai']
     * @param {object} settings['provider:anthropic']
     * @param {object} settings['provider:google-genai']
     */
    async configure(settings) {
        const provider = settings.activeProvider;
        const providerSettings = settings[`provider:${provider}`];

        if (!providerSettings?.apiKey) {
            throw new Error(`No API key configured for provider: ${provider}`);
        }

        const ModelClass = await loadProvider(provider);

        const baseConfig = this.#buildBaseConfig(provider, providerSettings.apiKey);

        // OpenAI reasoning models (o1, o3, etc.) only accept temperature=1
        const skipTemp = provider === 'openai';

        this.#routerModel = new ModelClass({
            ...baseConfig,
            model: providerSettings.smallModel,
            ...(skipTemp ? {} : { temperature: 0 }),
        });

        // OpenAI models (gpt-5, etc.) reject max_tokens; must use max_completion_tokens.
        // LangChain only auto-converts for o-series reasoning models, so we use modelKwargs
        // to pass it directly to the API for all OpenAI models.
        const tokenLimit = provider === 'openai'
            ? { modelKwargs: { max_completion_tokens: 16_384 } }
            : { maxTokens: 16_384 };

        this.#generatorModel = new ModelClass({
            ...baseConfig,
            model: providerSettings.responseModel,
            ...(skipTemp ? {} : { temperature: 0.7 }),
            ...tokenLimit,
        });

        // LangChain Anthropic adapter defaults topP/topK to -1 which the API rejects
        if (provider === 'anthropic') {
            for (const m of [this.#routerModel, this.#generatorModel]) {
                m.topP = undefined;
                m.topK = undefined;
            }
        }

        // Bind tools to the generator model
        const [agentToolModel] = attemptSync(() => this.#generatorModel.bindTools(AGENT_TOOLS));
        this.#agentToolModel = agentToolModel || this.#generatorModel;

        const [genToolModel] = attemptSync(() => this.#generatorModel.bindTools([...AGENT_TOOLS, ...GENERATION_TOOLS]));
        this.#genToolModel = genToolModel || this.#generatorModel;

        this.#provider = provider;
    }

    /**
     * Builds provider-specific base configuration.
     * @param {string} provider
     * @param {string} apiKey
     * @returns {object}
     */
    #buildBaseConfig(provider, apiKey) {
        const configs = {
            openai: {
                openAIApiKey: apiKey,
            },
            anthropic: {
                anthropicApiKey: apiKey,
                anthropicDangerouslyAllowBrowser: true,
            },
            'google-genai': {
                apiKey,
            },
        };

        return configs[provider] || { apiKey };
    }

    /**
     * Ensures the agent has been configured before use.
     */
    #assertConfigured() {
        if (!this.#routerModel || !this.#generatorModel) {
            throw new Error('CvAgent not configured. Call configure(settings) first.');
        }
    }

    /**
     * Classifies user intent using the router model.
     * @param {object} opts
     * @param {string} opts.userMessage
     * @param {Array} opts.chatHistory
     * @param {AbortSignal} [opts.signal]
     * @returns {Promise<object>} Parsed intent object
     */
    async #classifyIntent({ userMessage, chatHistory, signal }) {

        return retry(async () => {
            const structuredRouter = this.#routerModel.withStructuredOutput(AiIntentSchema);
            const messages = [
                ['system', ROUTER_SYSTEM_PROMPT],
                ...toLangChainMessages(chatHistory),
                ['human', userMessage],
            ];
            const [result, err] = await attempt(
                withTimeout(() => structuredRouter.invoke(messages, { signal }), { timeout: LLM_TIMEOUT, signal })
            );
            if (err) throw err;
            if (result == null) throw new Error('Intent classification returned empty response');
            // Explicit Zod validation — withStructuredOutput may not validate on all providers
            return AiIntentSchema.parse(result);
        }, { retries: 1, throwLastError: true, signal });
    }

    /**
     * Executes a single tool call and returns the result string.
     * @param {{name: string, args: object}} toolCall
     * @param {object} [opts]
     * @param {AbortSignal} [opts.signal]
     * @returns {Promise<string>}
     */
    async #executeTool(toolCall, { signal } = {}) {
        switch (toolCall.name) {
            case 'read_resume':
                return this.#editorContext?.js || 'No resume data available in the editor.';

            case 'read_styles':
                return this.#editorContext?.css || 'No custom styles available in the editor.';

            case 'web_fetch':
                return fetchPageContent(toolCall.args.url, { signal });

            case 'web_search': {
                if (!isSearchConfigured()) {
                    return 'Web search is not configured. Ask the user to add a Brave Search API key in Settings.';
                }
                const results = await webSearch(toolCall.args.query, { signal });
                return results
                    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.link}`)
                    .join('\n\n');
            }

            case 'set_personal_info':
                if (this.#generationAccumulator) {
                    this.#generationAccumulator.personal = toolCall.args;
                }
                return 'Personal info set successfully.';

            case 'set_summary':
                if (this.#generationAccumulator) {
                    this.#generationAccumulator.summary = toolCall.args.summary;
                }
                return 'Summary set successfully.';

            case 'add_section':
                if (this.#generationAccumulator) {
                    this.#generationAccumulator.sections.push(toolCall.args);
                }
                return `Section "${toolCall.args.heading}" added with ${toolCall.args.items.length} items.`;

            default:
                return `Unknown tool: ${toolCall.name}`;
        }
    }

    /**
     * Streams a response from the tool-enabled model, handling tool-calling
     * loops automatically. Yields tokens, tool status events, and returns
     * the accumulated text response.
     *
     * @param {string} systemPrompt
     * @param {string} userMessage
     * @param {Array} chatHistory
     * @param {Array} [attachments]
     * @param {object} [model] - Tool-bound model to use (defaults to agent-only tools)
     * @yields {{type: 'token'|'tool_status', chunk: *}}
     */
    async *#streamWithTools({ systemPrompt, userMessage, chatHistory, attachments, model, signal }) {
        const toolModel = model || this.#agentToolModel;
        const { AIMessage, ToolMessage } = await loadMessageClasses();

        const userContent = formatUserContent(userMessage, attachments);
        const messages = [
            ['system', systemPrompt],
            ...toLangChainMessages(chatHistory),
            ['human', userContent],
        ];

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            let fullText = '';
            const toolCallMap = new Map();

            const stream = await toolModel.stream(messages, { signal });

            for await (const chunk of stream) {
                // Stream text tokens
                const text = typeof chunk.content === 'string'
                    ? chunk.content
                    : chunk.content?.[0]?.text || '';
                if (text) {
                    fullText += text;
                    yield { type: 'token', chunk: text };
                }

                // Accumulate tool call chunks
                if (chunk.tool_call_chunks) {
                    for (const tc of chunk.tool_call_chunks) {
                        const idx = tc.index ?? 0;
                        if (!toolCallMap.has(idx)) {
                            toolCallMap.set(idx, { id: '', name: '', args: '' });
                        }
                        const entry = toolCallMap.get(idx);
                        if (tc.id) entry.id = tc.id;
                        if (tc.name) entry.name += tc.name;
                        if (tc.args) entry.args += tc.args;
                    }
                }
            }

            // Check for tool calls
            const toolCalls = [...toolCallMap.values()].filter(tc => tc.name);
            if (toolCalls.length === 0) break;

            // Parse tool call arguments
            const parsedCalls = toolCalls.map(tc => ({
                id: tc.id,
                name: tc.name,
                args: attemptSync(() => JSON.parse(tc.args || '{}'))[0] || {},
                type: 'tool_call',
            }));

            // Add AI message with tool calls to the chain
            messages.push(new AIMessage({
                content: fullText || '',
                tool_calls: parsedCalls,
            }));

            // Execute each tool and add results
            for (const tc of parsedCalls) {
                yield { type: 'tool_status', chunk: TOOL_STATUS_LABELS[tc.name] || tc.name };
                yield { type: 'tool_start', chunk: { name: tc.name, args: tc.args } };

                const [result, err] = await attempt(() => this.#executeTool(tc, { signal }));

                yield { type: 'tool_done', chunk: { name: tc.name, args: tc.args, error: err?.message || null } };

                messages.push(new ToolMessage({
                    content: err ? `Tool error: ${err.message}` : result,
                    tool_call_id: tc.id,
                }));
            }
        }
    }

    /**
     * Processes a user message through the agent. Yields progressive
     * chunks for UI rendering.
     *
     * @param {string} userMessage
     * @param {Array<{role: string, content: string}>} chatHistory
     * @param {Array<{type: string, name: string, data: string}>} [attachments]
     * @param {{js: string|null, css: string|null}} [editorContext] - Current editor code from localStorage
     * @yields {{type: 'token'|'cv_data'|'cv_section'|'intent'|'error'|'done'|'tool_status', chunk: *}}
     */
    async *processMessage(userMessage, chatHistory = [], attachments = [], editorContext = {}) {
        this.#assertConfigured();

        // Store editor context for tool access
        this.#editorContext = editorContext;

        const controller = new AbortController();
        const signal = controller.signal;

        const cleanupAbort = once('chat:abort', () => controller.abort());

        // Step 1: Classify intent
        const [intent, classifyErr] = await attempt(
            () => this.#classifyIntent({ userMessage, chatHistory, signal })
        );

        if (classifyErr) {

            yield { type: 'error', chunk: `Failed to classify intent: ${classifyErr.message}` };
            yield { type: 'done', chunk: null };

            cleanupAbort();

            return;
        }

        // Yield intent for UI consumption (e.g. title updates)
        yield { type: 'intent', chunk: intent };

        // Step 2: Route to appropriate handler
        switch (intent.intent) {
            case 'chitchat':
                yield* this.#handleChitchat({ userMessage, chatHistory, attachments, signal });
                break;

            case 'clarification':
                yield* this.#handleClarification({ userMessage, chatHistory, attachments, signal });
                break;

            case 'full_generation':
                yield* this.#handleFullGeneration({ userMessage, chatHistory, attachments, signal });
                break;

            case 'partial_update':
                yield* this.#handlePartialUpdate({ userMessage, chatHistory, attachments, intent, signal });
                break;

            case 'style_update':
                yield* this.#handleStyleUpdate({ userMessage, chatHistory, attachments, signal });
                break;

            default:
                yield { type: 'error', chunk: `Unknown intent: ${intent.intent}` };
        }

        yield { type: 'done', chunk: null };

        cleanupAbort();
    }

    /**
     * Handles chitchat intent — streams response with tool access.
     */
    async *#handleChitchat({ userMessage, chatHistory, attachments, signal }) {
        yield* this.#streamWithTools({
            systemPrompt: CHITCHAT_SYSTEM_PROMPT,
            userMessage,
            chatHistory,
            attachments,
            signal
        });
    }

    /**
     * Handles clarification intent — streams follow-up questions, merges info into context buffer.
     */
    async *#handleClarification({ userMessage, chatHistory, attachments, signal }) {
        this.#mergeContextFromMessage(userMessage);
        yield* this.#streamWithTools({
            systemPrompt: CLARIFICATION_SYSTEM_PROMPT,
            userMessage,
            chatHistory,
            attachments,
            signal
        });
    }

    /**
     * Handles full CV generation using a single agentic conversation.
     * The model calls generation tools (set_personal_info, set_summary,
     * add_section) to build the CV piece by piece via the accumulator.
     */
    async *#handleFullGeneration({ userMessage, chatHistory, attachments, signal }) {
        this.#generationAccumulator = { personal: null, summary: null, sections: [] };

        const contextPrompt = buildContextPrompt(this.#contextBuffer);
        const systemPrompt = contextPrompt
            ? `${GENERATION_AGENT_PROMPT}\n\n${contextPrompt}`
            : GENERATION_AGENT_PROMPT;

        let augmentedMessage = userMessage;
        if (this.#editorContext?.js) {
            augmentedMessage = `[User's current CV data]\n\`\`\`javascript\n${this.#editorContext.js}\n\`\`\`\n\n${userMessage}`;
        }

        let fullResponse = '';

        for await (const event of this.#streamWithTools({
            systemPrompt,
            userMessage: augmentedMessage,
            chatHistory,
            attachments,
            signal: this.#genToolModel
        })) {
            if (event.type === 'tool_start' && GEN_TOOL_NAMES[event.chunk.name]) {
                const stepId = event.chunk.name === 'add_section'
                    ? `section-${event.chunk.args.id}` : event.chunk.name;
                const label = event.chunk.name === 'add_section'
                    ? `Generating ${event.chunk.args.heading}...`
                    : event.chunk.name === 'set_personal_info'
                        ? 'Generating personal info...' : 'Writing summary...';
                yield { type: 'gen_step_start', chunk: { stepId, label } };
                continue;
            }

            if (event.type === 'tool_done' && GEN_TOOL_NAMES[event.chunk.name]) {
                const stepId = event.chunk.name === 'add_section'
                    ? `section-${event.chunk.args.id}` : event.chunk.name;
                yield event.chunk.error
                    ? { type: 'gen_step_error', chunk: { stepId, error: event.chunk.error } }
                    : { type: 'gen_step_done', chunk: { stepId } };
                continue;
            }

            if (event.type === 'token') fullResponse += event.chunk;
            yield event;
        }

        // Assemble from accumulator
        const acc = this.#generationAccumulator;
        this.#generationAccumulator = null;

        if (!acc.personal || acc.sections.length === 0) {
            yield { type: 'error', chunk: 'Generation incomplete — personal info or sections missing.' };
            return;
        }

        const assembled = {
            personal: acc.personal,
            summary: acc.summary || undefined,
            sections: acc.sections,
        };

        const [cvData, validationErr] = attemptSync(() => CVDataSchema.parse(assembled));
        if (validationErr) {
            yield { type: 'error', chunk: `CV validation failed: ${validationErr.message}` };
            return;
        }

        yield { type: 'cv_data', chunk: cvData };
        this.#contextBuffer = {};
    }

    /**
     * Handles partial CV update — streams response with tools, then
     * extracts and validates the section/item fragment(s). Supports
     * multiple JSON blocks in a single response. Falls back to
     * a structured output retry if text extraction fails.
     */
    async *#handlePartialUpdate({ userMessage, chatHistory, attachments, intent, signal }) {
        const contextHint = intent.targetSection
            ? `\nThe user wants to update the "${intent.targetSection}" section.${intent.targetIndex >= 0 ? ` Specifically item at index ${intent.targetIndex}.` : ''}`
            : '';

        const systemPrompt = `${PARTIAL_UPDATE_SYSTEM_PROMPT}${contextHint}`;

        // Always include editor context for partial updates
        let augmentedMessage = userMessage;
        if (this.#editorContext?.js) {
            augmentedMessage = `[User's current CV data]\n\`\`\`javascript\n${this.#editorContext.js}\n\`\`\`\n\n${userMessage}`;
        }

        let fullResponse = '';

        for await (const event of this.#streamWithTools({
            systemPrompt,
            userMessage: augmentedMessage,
            chatHistory,
            attachments,
            signal
        })) {
            if (event.type === 'token') fullResponse += event.chunk;
            yield event;
        }

        // Try 1: extract all JSON blocks from streamed text and validate
        const allUpdates = [];
        let try1Error = null;
        const jsonBlocks = extractAllJson(fullResponse);

        for (const json of jsonBlocks) {
            const [data, err] = attemptSync(() => AiPartialUpdateSchema.parse(json));
            if (data) {
                allUpdates.push(data);
            } else if (!try1Error) {
                try1Error = err;
            }
        }

        // Try 2: retry with withStructuredOutput if no valid updates were extracted
        if (allUpdates.length === 0) {
            yield { type: 'tool_status', chunk: 'Retrying with structured output' };

            const correctionPrompt = try1Error
                ? `Your previous response:\n${fullResponse}\n\nThis failed schema validation: ${try1Error.message}\n\nPlease produce a corrected JSON object matching the required schema.`
                : `Please produce the partial update as a JSON object matching the required schema.`;

            const [retryResult, retryErr] = await attempt(() =>
                retry(async () => {
                    const structured = this.#generatorModel.withStructuredOutput(AiPartialUpdateSchema);
                    const messages = [
                        ['system', systemPrompt],
                        ...toLangChainMessages(chatHistory),
                        ['human', augmentedMessage],
                        ['ai', fullResponse],
                        ['human', correctionPrompt],
                    ];
                    const [result, invokeErr] = await attempt(
                        withTimeout(() => structured.invoke(messages), { timeout: LLM_TIMEOUT })
                    );
                    if (invokeErr) throw invokeErr;
                    if (result == null) throw new Error('Model returned empty structured output');
                    return AiPartialUpdateSchema.parse(result);
                }, { retries: 2, throwLastError: true })
            );

            if (retryErr) {
                yield { type: 'error', chunk: `Partial update failed: ${retryErr.message}` };
                return;
            }
            allUpdates.push(retryResult);
        }

        for (const updateData of allUpdates) {
            yield { type: 'cv_section', chunk: updateData };
        }
    }

    /**
     * Handles style/CSS update — streams response with tools, then
     * extracts and validates the CSS from the response. Falls back to
     * a structured output retry if text extraction fails.
     */
    async *#handleStyleUpdate({ userMessage, chatHistory, attachments, signal }) {
        // Always include current CSS context
        let augmentedMessage = userMessage;
        if (this.#editorContext?.css) {
            augmentedMessage = `[User's current CSS]\n\`\`\`css\n${this.#editorContext.css}\n\`\`\`\n\n${userMessage}`;
        }

        let fullResponse = '';

        for await (const event of this.#streamWithTools({
            systemPrompt: STYLE_UPDATE_SYSTEM_PROMPT,
            userMessage: augmentedMessage,
            chatHistory,
            attachments,
            signal
        })) {
            if (event.type === 'token') fullResponse += event.chunk;
            yield event;
        }

        // Try 1: extract CSS from ```css fences
        let styleData = null;
        const cssMatch = fullResponse.match(/```css\s*\n?([\s\S]*?)```/);
        if (cssMatch) {
            const css = cssMatch[1].trim();
            if (css) {
                styleData = { css, summary: 'Style update from AI' };
            }
        }

        // Try 2: retry with structured output
        if (!styleData) {
            yield { type: 'tool_status', chunk: 'Retrying with structured output' };

            const correctionPrompt = `Your previous response:\n${fullResponse}\n\nPlease produce the CSS update as a JSON object with "css" (the complete CSS string) and "summary" (brief description of changes).`;

            const [retryResult, retryErr] = await attempt(() =>
                retry(async () => {
                    const structured = this.#generatorModel.withStructuredOutput(AiStyleUpdateSchema);
                    const messages = [
                        ['system', STYLE_UPDATE_SYSTEM_PROMPT],
                        ...toLangChainMessages(chatHistory),
                        ['human', augmentedMessage],
                        ['ai', fullResponse],
                        ['human', correctionPrompt],
                    ];
                    const [result, invokeErr] = await attempt(
                        withTimeout(() => structured.invoke(messages), { timeout: LLM_TIMEOUT, signal })
                    );
                    if (invokeErr) throw invokeErr;
                    if (result == null) throw new Error('Model returned empty structured output');
                    return AiStyleUpdateSchema.parse(result);
                }, { retries: 2, throwLastError: true })
            );

            if (retryErr) {
                yield { type: 'error', chunk: `Style update failed: ${retryErr.message}` };
                return;
            }
            styleData = retryResult;
        }

        yield { type: 'css_update', chunk: styleData };
    }

    /**
     * Extracts key-value pairs from a user message and merges them into
     * the context buffer for use during generation.
     * @param {string} message
     */
    #mergeContextFromMessage(message) {
        const key = `clarification_${Date.now()}`;
        this.#contextBuffer[key] = message;
    }

    /**
     * Clears the accumulated context buffer.
     */
    clearContext() {
        this.#contextBuffer = {};
    }

    /**
     * Returns the current context buffer contents.
     * @returns {object}
     */
    get context() {
        return { ...this.#contextBuffer };
    }

    /**
     * Returns whether the agent is configured and ready.
     * @returns {boolean}
     */
    get isConfigured() {
        return this.#routerModel !== null && this.#generatorModel !== null;
    }

    /**
     * Returns the active provider name.
     * @returns {string|null}
     */
    get provider() {
        return this.#provider;
    }
}
