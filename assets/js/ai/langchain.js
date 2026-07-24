// AI LangChain Agent — CvAgent class with tool-calling for web fetch, search, and editor context

import { z } from 'https://cdn.jsdelivr.net/npm/zod@3.23.8/+esm';
import { attempt, attemptSync, withTimeout } from '../utils.js?v=2026.07.24.10';
import {
    AiPartialUpdateSchema,
    CVDataSchema,
    PersonalSchema,
    SectionSchema,
} from './schemas.js?v=2026.07.24.10';
import {
    AGENT_SYSTEM_PROMPT,
    DATE_CONTEXT,
} from './prompts.js?v=2026.07.24.10';
import { webSearch, isSearchConfigured, isTavilyConfigured, tavilySearch, tavilyExtract, tavilyCrawl, tavilyMap } from './search.js?v=2026.07.24.10';
import { once, emit } from '../observable.js?v=2026.07.24.10';

// ─── CDN URLs ────────────────────────────────────────────────────────────────

const CDN = {
    openai: 'https://cdn.jsdelivr.net/npm/@langchain/openai@0.5.12/+esm',
    anthropic: 'https://cdn.jsdelivr.net/npm/@langchain/anthropic@0.3.21/+esm',
    'google-genai': 'https://cdn.jsdelivr.net/npm/@langchain/google-genai@0.2.12/+esm',
    // Fireworks exposes an OpenAI-compatible API, so it reuses the OpenAI adapter
    // (ChatOpenAI) with a base-URL override — see #buildBaseConfig.
    fireworks: 'https://cdn.jsdelivr.net/npm/@langchain/openai@0.5.12/+esm',
    core: 'https://cdn.jsdelivr.net/npm/@langchain/core/messages/+esm',
};

// Fireworks OpenAI-compatible endpoint. Model ids look like
// `accounts/fireworks/models/<name>` (set in Settings).
const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1';

// The OpenAI SDK injects x-stainless-* telemetry headers on every request. Fireworks'
// CORS policy allows a FIXED header set (Authorization/Content-Type/Accept/Fireworks-
// Playground) and does not include x-stainless-*, so the browser preflight is rejected
// and the call fails with a CORS error. Strip those headers before the request so the
// preflight only asks for headers Fireworks permits. (Telemetry-only — safe to drop.)
function stripStainlessFetch(url, init = {}) {
    const headers = new Headers(init.headers || undefined);
    for (const key of [...headers.keys()]) {
        if (key.toLowerCase().startsWith('x-stainless')) headers.delete(key);
    }
    return fetch(url, { ...init, headers });
}

// ─── Provider Factories ──────────────────────────────────────────────────────

const PROVIDER_FACTORY = {
    openai: null,
    anthropic: null,
    'google-genai': null,
    fireworks: null,
};

/**
 * Lazy-loads a LangChain provider module from CDN and caches it.
 * @param {'openai'|'anthropic'|'google-genai'|'fireworks'} provider
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
        fireworks: mod.ChatOpenAI,
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
    {
        name: 'tavily_search',
        description: 'Search the web using Tavily. Returns relevant results with content snippets and optionally an AI-generated answer. Use for research, fact-checking, or finding current information. Requires Tavily API key in Settings.',
        schema: z.object({
            query: z.string().describe('The search query'),
            topic: z.enum(['general', 'news', 'finance']).default('general').describe('Search topic category'),
        }),
    },
    {
        name: 'tavily_extract',
        description: 'Extract the full content of one or more web pages as markdown using Tavily. Better than web_fetch for getting clean, structured content from pages. Requires Tavily API key.',
        schema: z.object({
            urls: z.array(z.string()).min(1).max(10).describe('URLs to extract content from'),
        }),
    },
    {
        name: 'tavily_crawl',
        description: 'Crawl a website starting from a URL, following links to discover and extract content from multiple pages. Useful for gathering comprehensive information from a site (e.g., a company website for resume context). Requires Tavily API key.',
        schema: z.object({
            url: z.string().describe('The root URL to start crawling from'),
            instructions: z.string().optional().describe('Optional natural language guidance for what content to focus on'),
            maxDepth: z.number().min(1).max(3).default(1).describe('How many link levels deep to crawl'),
            limit: z.number().min(1).max(20).default(10).describe('Maximum number of pages to crawl'),
        }),
    },
    {
        name: 'tavily_map',
        description: 'Map the URL structure of a website, returning a list of discovered page URLs. Useful for understanding a site\'s structure before deciding which pages to extract. Requires Tavily API key.',
        schema: z.object({
            url: z.string().describe('The root URL to start mapping from'),
            instructions: z.string().optional().describe('Optional natural language guidance for which pages to include'),
            maxDepth: z.number().min(1).max(3).default(1).describe('How many link levels deep to map'),
            limit: z.number().min(1).max(50).default(30).describe('Maximum number of URLs to return'),
        }),
    },
    {
        name: 'read_document',
        description: 'Read the full extracted text of an uploaded document by name. Use this when a document summary in the system context is not detailed enough and you need the complete content. Available document names are listed in the [User Documents] section of your context.',
        schema: z.object({
            name: z.string().describe('The exact filename of the document to read (e.g. "resume.pdf", "cover-letter.docx")'),
        }),
    },
    {
        name: 'save_user_fact',
        description: 'Save an interesting or useful fact you learned about the user during conversation. Use this for information that would help personalize future CV content — such as career goals, preferences, personality traits, industries of interest, or notable achievements not already in their profile or documents. Do NOT save facts that duplicate the user profile or uploaded documents.',
        schema: z.object({
            fact: z.string().describe('A concise fact about the user (e.g., "Prefers a minimalist CV style", "Transitioning from finance to tech", "Has 3 patents in machine learning")'),
        }),
    },
    {
        name: 'ask_clarification',
        description: 'Ask the user a clarifying question when their instructions are ambiguous or missing important details. Present a question with suggested options. The user can select an option or type a custom response. Use this when you need more detail before proceeding.',
        schema: z.object({
            question: z.string().describe('The clarifying question to ask the user'),
            options: z.array(z.string()).min(1).max(5).describe('Suggested answer options for the user to choose from'),
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

// edit_cv's arguments ARE the change (no inner model generates it): the standard
// operation/path/data patch plus a one-line summary shown above the approval diff.
const EditCvSchema = AiPartialUpdateSchema.extend({
    summary: z.string().describe('One short sentence describing this change, shown to the user above the before/after diff.'),
});

const CV_EDIT_TOOLS = [
    {
        name: 'edit_cv',
        description: 'Make ONE targeted change to the existing CV. The tool\'s arguments ARE the change: an operation (set/insert/delete), a dot-path, and the data. The change is shown to the user as a before/after diff and applied on their approval — there is NO separate accept step. The result tells you whether the user accepted or rejected. For several changes, call this once per change, one at a time.',
        schema: EditCvSchema,
    },
    {
        name: 'edit_styles',
        description: 'Restyle the CV. Provide the COMPLETE CSS stylesheet (the user\'s existing customizations plus your changes) — it replaces their entire custom stylesheet. The user is shown the result to apply; there is no separate accept step.',
        schema: z.object({
            css: z.string().min(1).describe('The complete CSS to apply. Replaces the entire custom stylesheet.'),
            summary: z.string().describe('A brief description of the visual change.'),
        }),
    },
];

// The single tool set bound to the agent model. The model decides which to use per the
// system prompt — no classifier, no per-intent tool subsets.
const ALL_TOOLS = [...AGENT_TOOLS, ...GENERATION_TOOLS, ...CV_EDIT_TOOLS];

// set_* tools accumulate a from-scratch CV; edit_* tools mutate an existing one. Both are
// suppressed from raw tool_start/tool_done in the UI (the user sees gen steps / approval).
const GEN_TOOL_NAMES = { set_personal_info: true, set_summary: true, add_section: true };
const EDIT_TOOL_NAMES = { edit_cv: true, edit_styles: true };

const TOOL_STATUS_LABELS = {
    read_resume: 'Reading resume',
    read_styles: 'Reading styles',
    web_fetch: 'Fetching page',
    web_search: 'Searching web',
    set_personal_info: 'Generating personal info',
    set_summary: 'Writing summary',
    add_section: 'Generating section',
    edit_cv: 'Preparing change',
    edit_styles: 'Generating styles',
    tavily_search: 'Searching with Tavily',
    tavily_extract: 'Extracting page content',
    tavily_crawl: 'Crawling website',
    tavily_map: 'Mapping website',
    read_document: 'Reading document',
    save_user_fact: 'Remembering fact',
    ask_clarification: 'Asking for clarification',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LLM_TIMEOUT = 60_000;
// A confused model can otherwise burn one LLM call per round with nothing to show;
// well-behaved tool sequences finish in a handful of rounds.
const MAX_TOOL_ROUNDS = 12;
// Rounds alone don't bound cost: a model can emit many tool calls in a SINGLE round
// (observed: a weak model spamming generate_* without ever converging). This is the hard
// ceiling on total tool executions per user turn — the real runaway backstop.
const MAX_TOOL_CALLS = 24;

/**
 * Fetches a web page and extracts readable text content.
 * Uses Puter.js for CORS-free fetching.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchPageContent(url, { signal } = {}) {
    const fetchFn = typeof puter !== 'undefined' ? puter.net.fetch : fetch;
    const res = await fetchFn(url);
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
                text: `[Attached file: ${attachment.name}]\n${attachment.data || attachment.base64 || ''}`,
            });
        }
    }

    if (textContent) {
        parts.push({ type: 'text', text: textContent });
    }

    // Anthropic rejects empty content arrays — ensure at least one text block
    if (parts.length === 0) {
        parts.push({ type: 'text', text: 'See attached file(s).' });
    }

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

    /** @type {object|null} Generator model bound with the full tool set (the agent loop) */
    #toolModel = null;

    /** @type {object} Accumulated context from clarification rounds */
    #contextBuffer = {};

    /** @type {string|null} Active provider name */
    #provider = null;

    /** @type {{js: string|null, css: string|null}} Current editor context for tool access */
    #editorContext = {};

    /** @type {object|null} Accumulates generation tool results during full generation */
    #generationAccumulator = null;

    /** @type {string|null} Conversation summary to prepend to system prompts */
    #summary = null;

    /** @type {string|null} User profile markdown to include in system prompts */
    #userProfile = null;

    /** @type {Array<{id: number, name: string, summary: string}>} Document summaries for prompt injection */
    #documentSummaries = [];

    /** @type {((name: string) => Promise<string|null>)|null} Callback to read full document text by name */
    #documentReader = null;

    /** @type {string[]} Facts learned about the user through conversation */
    #learnedFacts = [];

    /** @type {((fact: string) => Promise<void>)|null} Callback to persist a learned fact */
    #factSaver = null;

    /** @type {{css: string, summary: string}|null} Last edit_styles result, yielded as css_update after the stream */
    #pendingStyle = null;

    /** @type {Array<{role: string, content: string}>} Chat history for the current turn */
    #currentChatHistory = [];

    /**
     * Configures the agent with provider settings. Instantiates both
     * a cheap router model and a reasoning generator model with tools.
     *
     * @param {object} settings
     * @param {string} settings.activeProvider - 'openai' | 'anthropic' | 'google-genai' | 'fireworks'
     * @param {object} settings['provider:openai']
     * @param {object} settings['provider:anthropic']
     * @param {object} settings['provider:google-genai']
     * @param {object} settings['provider:fireworks']
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

        // Fireworks enforces strict json_schema/tool schemas via constrained-generation
        // grammar, whose builder fails on this app's deep union/optional schemas ("Failed
        // to build a constrained-generation grammar"). disable_grammar bypasses it; the
        // model still emits JSON/tool calls, which we validate with Zod and retry.
        const fireworksKwargs = provider === 'fireworks' ? { disable_grammar: true } : null;

        this.#routerModel = new ModelClass({
            ...baseConfig,
            model: providerSettings.smallModel,
            ...(skipTemp ? {} : { temperature: 0 }),
            ...(fireworksKwargs ? { modelKwargs: fireworksKwargs } : {}),
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
            ...(fireworksKwargs ? { modelKwargs: fireworksKwargs } : {}),
        });

        // LangChain Anthropic adapter defaults topP/topK to -1 which the API rejects
        if (provider === 'anthropic') {
            for (const m of [this.#routerModel, this.#generatorModel]) {
                m.topP = undefined;
                m.topK = undefined;
            }
        }

        // Bind the full tool set to the generator model — one agent loop drives everything
        // (chat, from-scratch generation, targeted edits, styling). No per-intent subsets.
        const [toolModel] = attemptSync(() => this.#generatorModel.bindTools(ALL_TOOLS));
        this.#toolModel = toolModel || this.#generatorModel;

        this.#provider = provider;
        this.#userProfile = settings['user:profile'] || null;
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
            // OpenAI-compatible: ChatOpenAI + Fireworks base URL. The custom fetch
            // strips x-stainless-* headers the OpenAI SDK adds, which Fireworks' CORS
            // policy rejects (see stripStainlessFetch).
            fireworks: {
                openAIApiKey: apiKey,
                configuration: {
                    baseURL: FIREWORKS_BASE_URL,
                    dangerouslyAllowBrowser: true,
                    fetch: stripStainlessFetch,
                },
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
     * Builds a system prompt with optional summary prefix.
     * @param {string} basePrompt
     * @returns {string}
     */
    #buildSystemPrompt(basePrompt) {
        let prompt = basePrompt;

        if (this.#userProfile) {
            prompt = `[User Profile]\nThe following is information the user has provided about themselves:\n${this.#userProfile}\n\n${prompt}`;
        }

        if (this.#learnedFacts.length > 0) {
            const factsStr = this.#learnedFacts.map((f, i) => `${i + 1}. ${f}`).join('\n');
            prompt = `[Learned Facts]\nFacts you have learned about this user from previous conversations:\n${factsStr}\n\n${prompt}`;
        }

        if (this.#documentSummaries.length > 0) {
            const docContext = this.#documentSummaries
                .map(d => `- ${d.name}: ${d.summary}`)
                .join('\n');
            prompt = `[User Documents]\nSummaries of documents the user has uploaded:\n${docContext}\n\n${prompt}`;
        }

        if (this.#summary) {
            prompt = `[Previous conversation context]\n${this.#summary}\n\n${prompt}`;
        }

        return `${DATE_CONTEXT}\n\n${prompt}`;
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

            case 'edit_cv': {
                // The model already produced the change (operation/path/data) — no inner
                // model. Validate it against the schema first: the provider does NOT enforce
                // the tool-arg shape when grammar/constrained generation is disabled (e.g.
                // Fireworks), so a weak model could otherwise push malformed data straight
                // into applyCvFromAI. On failure, tell the model to fix and retry.
                const [change, parseErr] = attemptSync(() => EditCvSchema.parse(toolCall.args));
                if (parseErr) {
                    return `The change didn't match the required shape: ${parseErr.message}. Fix the operation/path/data and call edit_cv again.`;
                }
                const { operation, path, data, summary } = change;
                // Send the validated change to the user for before/after approval. On accept
                // the UI applies it and hands back the new CV so a follow-up edit this turn
                // reads current data (no stale-snapshot bug). No accept tool to loop on.
                const [decision, appErr] = await attempt(() => this.#requestApproval({
                    summary, operation, path, data,
                }, signal));
                if (appErr) throw appErr; // aborted — propagate so the stream stops

                if (decision.accepted) {
                    if (decision.cvData) {
                        this.#editorContext = {
                            ...this.#editorContext,
                            js: `return ${JSON.stringify(decision.cvData, null, 4)};`,
                        };
                    }
                    return `The user APPROVED and applied this change (${operation} at ${path || 'whole CV'}). Move on to the next change, or stop if all requested changes are done.`;
                }
                return `The user REJECTED this change (${operation} at ${path || 'whole CV'}). Do not propose this identical change again — ask what they'd prefer or move on.`;
            }

            case 'edit_styles': {
                // Args ARE the CSS (no inner model). Stash it; processMessage yields it as a
                // css_update preview card after the stream. CSS is a full replacement, so a
                // later edit_styles call this turn supersedes an earlier one.
                this.#pendingStyle = { css: toolCall.args.css, summary: toolCall.args.summary || '' };
                return 'Style update ready — shown to the user to apply. No accept step needed.';
            }

            case 'tavily_search': {
                if (!isTavilyConfigured()) return 'Tavily is not configured. Ask the user to add a Tavily API key in Settings.';
                const result = await tavilySearch(toolCall.args.query, { topic: toolCall.args.topic });
                let output = '';
                if (result.answer) output += `Answer: ${result.answer}\n\n`;
                output += result.results
                    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.content.slice(0, 300)}\n   ${r.url}`)
                    .join('\n\n');
                return output || 'No results found.';
            }

            case 'tavily_extract': {
                if (!isTavilyConfigured()) return 'Tavily is not configured. Ask the user to add a Tavily API key in Settings.';
                const result = await tavilyExtract(toolCall.args.urls);
                const maxChars = 15_000;
                let output = result.results
                    .map(r => `URL: ${r.url}\n\n${r.content}`)
                    .join('\n\n---\n\n');
                if (result.failed.length > 0) {
                    output += '\n\nFailed: ' + result.failed.map(f => `${f.url} (${f.error})`).join(', ');
                }
                return output.length > maxChars ? output.slice(0, maxChars) + '\n[Truncated]' : output;
            }

            case 'tavily_crawl': {
                if (!isTavilyConfigured()) return 'Tavily is not configured. Ask the user to add a Tavily API key in Settings.';
                const result = await tavilyCrawl(toolCall.args.url, {
                    instructions: toolCall.args.instructions,
                    maxDepth: toolCall.args.maxDepth,
                    limit: toolCall.args.limit,
                });
                const maxChars = 15_000;
                let output = `Crawled ${result.results.length} pages from ${result.baseUrl}\n\n`;
                output += result.results
                    .map(r => `URL: ${r.url}\n${r.content.slice(0, 2000)}`)
                    .join('\n\n---\n\n');
                return output.length > maxChars ? output.slice(0, maxChars) + '\n[Truncated]' : output;
            }

            case 'tavily_map': {
                if (!isTavilyConfigured()) return 'Tavily is not configured. Ask the user to add a Tavily API key in Settings.';
                const result = await tavilyMap(toolCall.args.url, {
                    instructions: toolCall.args.instructions,
                    maxDepth: toolCall.args.maxDepth,
                    limit: toolCall.args.limit,
                });
                return `Found ${result.urls.length} URLs on ${result.baseUrl}:\n\n${result.urls.map((u, i) => `${i + 1}. ${u}`).join('\n')}`;
            }

            case 'save_user_fact': {
                const newFact = toolCall.args.fact;

                // Use router model to check if this fact is redundant
                const existingContext = [
                    this.#userProfile ? `User Profile:\n${this.#userProfile}` : '',
                    this.#learnedFacts.length > 0 ? `Known Facts:\n${this.#learnedFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}` : '',
                ].filter(Boolean).join('\n\n');

                const [dedup] = await attempt(
                    withTimeout(() => this.#routerModel.invoke([
                        ['system', 'You decide whether a new fact about a user is worth saving. Respond with exactly "SAVE" if the fact is novel and useful, or "SKIP" if it duplicates or closely overlaps with existing information. Only respond with one word.'],
                        ['human', `${existingContext ? `Existing context:\n${existingContext}\n\n` : ''}New fact to evaluate: "${newFact}"`],
                    ]), { timeout: 15_000 })
                );

                const decision = (typeof dedup?.content === 'string' ? dedup.content : dedup?.content?.[0]?.text || '').trim().toUpperCase();

                if (decision === 'SKIP') {
                    return 'Fact already known — skipped.';
                }

                this.#learnedFacts.push(newFact);
                if (this.#factSaver) await this.#factSaver(newFact);
                return `Saved: "${newFact}"`;
            }

            case 'read_document': {
                if (!this.#documentReader) return 'No documents available.';
                const text = await this.#documentReader(toolCall.args.name);
                if (!text) return `Document "${toolCall.args.name}" not found or has no extracted text. Available documents: ${this.#documentSummaries.map(d => d.name).join(', ') || 'none'}`;
                // Truncate very large documents to avoid blowing up context
                const maxChars = 30_000;
                return text.length > maxChars ? text.slice(0, maxChars) + '\n[Truncated]' : text;
            }

            case 'ask_clarification': {
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                return new Promise((resolve, reject) => {
                    if (signal) {
                        signal.addEventListener('abort', () => {
                            reject(new DOMException('Aborted', 'AbortError'));
                        }, { once: true });
                    }
                    emit('ai:clarification-request', {
                        question: toolCall.args.question,
                        options: toolCall.args.options,
                        respond: (answer) => resolve(answer)
                    });
                });
            }

            default:
                return `Unknown tool: ${toolCall.name}`;
        }
    }

    /**
     * Human-in-the-loop approval gate. Emits an approval request describing a single
     * CV change and resolves with the user's decision (true=accept, false=reject).
     * Rejects with AbortError if the run is stopped while waiting. Mirrors the
     * ask_clarification bridge: the UI applies the change on accept and calls respond().
     *
     * @param {{summary: string, operation: string, path: string, data: *}} change
     * @param {AbortSignal} [signal]
     * @returns {Promise<{accepted: boolean, cvData: object|null}>} cvData is the applied CV on accept
     */
    #requestApproval(change, signal) {
        return new Promise((resolve, reject) => {
            if (signal) {
                signal.addEventListener('abort', () => {
                    reject(new DOMException('Aborted', 'AbortError'));
                }, { once: true });
            }
            emit('ai:approval-request', {
                summary: change.summary,
                operation: change.operation,
                path: change.path,
                data: change.data,
                // The UI applies the change on accept and hands back the resulting CV so the
                // agent can refresh its editor-context snapshot for the next edit this turn.
                respond: (approved, cvData) => resolve({ accepted: !!approved, cvData: cvData ?? null }),
            });
        });
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
        const toolModel = model || this.#toolModel;
        const { AIMessage, ToolMessage } = await loadMessageClasses();

        const userContent = formatUserContent(userMessage, attachments);
        const messages = [
            ['system', systemPrompt],
            ...toLangChainMessages(chatHistory),
            ['human', userContent],
        ];

        let toolCallsMade = 0;

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            // Stop was requested (chat:abort). A tool's inner error is swallowed by
            // attempt() below, so without this check an abort mid-tool would just start
            // another round instead of ending the stream.
            if (signal?.aborted) return;

            let fullText = '';
            const toolCallMap = new Map();

            const stream = await toolModel.stream(messages, { signal });

            for await (const chunk of stream) {
                if (signal?.aborted) return;

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
                // Hard runaway backstop: a model can spam tool calls (esp. retrying
                // generate_* without converging). Stop and tell the user rather than
                // silently making dozens of API calls with nothing on screen.
                if (++toolCallsMade > MAX_TOOL_CALLS) {
                    yield { type: 'error', chunk: `Stopped after ${MAX_TOOL_CALLS} tool calls without finishing — the model kept trying without converging. This can happen with smaller models on complex edits; try a more capable model or a simpler request.` };
                    return;
                }

                yield { type: 'tool_status', chunk: TOOL_STATUS_LABELS[tc.name] || tc.name };
                yield { type: 'tool_start', chunk: { name: tc.name, args: tc.args } };

                const [result, err] = await attempt(() => this.#executeTool(tc, { signal }));

                yield { type: 'tool_done', chunk: { name: tc.name, args: tc.args, error: err?.message || null } };

                messages.push(new ToolMessage({
                    content: err ? `Tool error: ${err.message}` : result,
                    tool_call_id: tc.id,
                }));

                if (signal?.aborted) return;
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
    async *processMessage(userMessage, chatHistory = [], attachments = [], editorContext = {}, summary = null) {
        this.#assertConfigured();

        // Store editor context for tool access
        this.#editorContext = editorContext;
        this.#summary = summary;
        this.#currentChatHistory = chatHistory;

        const controller = new AbortController();
        const signal = controller.signal;

        const cleanupAbort = once('chat:abort', () => controller.abort());

        try {
            // Single agent loop: one model, one tool set, one system prompt. The model
            // decides what to do (chat / build / edit / style / research) and calls tools —
            // no classifier, no per-intent handlers. Edits go through the approval code-gate
            // and their tool args ARE the change, so there is no inner model to hand off to.
            this.#generationAccumulator = { personal: null, summary: null, sections: [] };
            this.#pendingStyle = null;

            const systemPrompt = this.#buildSystemPrompt(AGENT_SYSTEM_PROMPT);
            const augmentedMessage = this.#augmentWithContext(userMessage, 'js');

            let fullResponse = '';

            for await (const event of this.#streamWithTools({
                systemPrompt,
                userMessage: augmentedMessage,
                chatHistory,
                attachments,
                model: this.#toolModel,
                signal,
            })) {
                // Generation tools (set_*) render as progress steps in the UI.
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
                // Edit tools own their UI (approval modal / css card) — hide raw tool events.
                if (event.type === 'tool_start' && EDIT_TOOL_NAMES[event.chunk.name]) continue;
                if (event.type === 'tool_done' && EDIT_TOOL_NAMES[event.chunk.name]) continue;

                if (event.type === 'token') fullResponse += event.chunk;
                yield event;
            }

            // A from-scratch build accumulates via set_* tools — assemble and offer it.
            const acc = this.#generationAccumulator;
            this.#generationAccumulator = null;
            if (acc && (acc.personal || acc.sections.length > 0)) {
                const assembled = {
                    personal: acc.personal,
                    summary: acc.summary || undefined,
                    sections: acc.sections,
                };
                const [cvData, validationErr] = attemptSync(() => CVDataSchema.parse(assembled));
                if (validationErr) {
                    yield { type: 'error', chunk: `The generated CV data didn't pass validation. Please try again. (${validationErr.message})` };
                } else {
                    yield { type: 'cv_data', chunk: cvData };
                }
            }

            // A style change is a full CSS replacement — offer the latest one to apply.
            if (this.#pendingStyle) {
                yield { type: 'css_update', chunk: { css: this.#pendingStyle.css, summary: this.#pendingStyle.summary } };
                this.#pendingStyle = null;
            }

            yield { type: 'done', chunk: null };
        } finally {
            cleanupAbort();
        }
    }

    /**
     * Prepends the relevant editor context (JS or CSS) to a user message.
     * @param {string} userMessage
     * @param {'js'|'css'} type
     * @returns {string}
     */
    #augmentWithContext(userMessage, type = 'js') {
        const content = this.#editorContext?.[type];
        if (!content) return userMessage;
        const label = type === 'css' ? 'User\'s current CSS' : 'User\'s current CV data';
        const lang = type === 'css' ? 'css' : 'javascript';
        return `[${label}]\n\`\`\`${lang}\n${content}\n\`\`\`\n\n${userMessage}`;
    }

    /**
     * Clears the accumulated context buffer.
     */
    clearContext() {
        this.#contextBuffer = {};
    }

    /**
     * Generates a summary of messages using the router (cheap) model.
     * @param {string} transcript - Formatted message transcript
     * @param {string|null} existingSummary - Previous summary to merge with
     * @returns {Promise<string>} The generated summary
     */
    async summarize(transcript, existingSummary = null) {
        this.#assertConfigured();

        const { SUMMARIZATION_PROMPT } = await import('./prompts.js?v=2026.07.24.10');

        const userPrompt = existingSummary
            ? `Previous summary:\n${existingSummary}\n\nNew messages to incorporate:\n${transcript}`
            : transcript;

        const messages = [
            ['system', SUMMARIZATION_PROMPT],
            ['human', userPrompt],
        ];

        const [result, err] = await attempt(
            withTimeout(() => this.#routerModel.invoke(messages), { timeout: 30_000 })
        );

        if (err) {
            console.warn('Summarization failed, skipping:', err.message);
            return existingSummary || '';
        }

        const content = typeof result.content === 'string'
            ? result.content
            : result.content?.[0]?.text || '';

        return content.trim();
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

    /**
     * Sets document summaries for system prompt injection.
     * @param {Array<{id: number, name: string, summary: string}>} summaries
     */
    setDocumentContext(summaries) {
        this.#documentSummaries = summaries || [];
    }

    /**
     * Sets a callback for reading full document text by name.
     * @param {(name: string) => Promise<string|null>} readerFn
     */
    setDocumentReader(readerFn) {
        this.#documentReader = readerFn;
    }

    /**
     * Sets the learned facts array and a callback for persisting new facts.
     * @param {string[]} facts
     * @param {(fact: string) => Promise<void>} saverFn
     */
    setLearnedFacts(facts, saverFn) {
        this.#learnedFacts = facts || [];
        this.#factSaver = saverFn || null;
    }

    /**
     * Summarizes a text document using the router (cheap) model.
     * @param {string} content - The extracted text content
     * @param {string} fileName - The original file name
     * @returns {Promise<string>} The generated summary
     */
    async summarizeDocument(content, fileName) {
        this.#assertConfigured();

        const systemPrompt = `You are a document summarizer. Extract the key information from this document that would be useful context for a CV/resume AI assistant. Focus on: work experience, education, skills, achievements, personal details, and career goals. Be comprehensive but concise. Output a structured summary.`;
        const userPrompt = `Document: ${fileName}\n\n${content.slice(0, 30_000)}`;

        const [result, err] = await attempt(
            withTimeout(() => this.#routerModel.invoke([
                ['system', systemPrompt],
                ['human', userPrompt],
            ]), { timeout: 60_000 })
        );

        if (err) throw new Error(`Summarization failed: ${err.message}`);

        const text = typeof result.content === 'string'
            ? result.content
            : result.content?.[0]?.text || '';

        return text.trim();
    }

    /**
     * Summarizes an image using the router (cheap) model with vision.
     * @param {string} base64Data - The base64 data URL of the image
     * @param {string} fileName - The original file name
     * @returns {Promise<string>} The generated summary
     */
    async summarizeImage(base64Data, fileName) {
        this.#assertConfigured();

        const [result, err] = await attempt(
            withTimeout(() => this.#routerModel.invoke([
                ['system', 'You are a document summarizer. Describe this image in detail, focusing on any text, data, or information that would be useful context for a CV/resume AI assistant.'],
                ['human', [
                    { type: 'image_url', image_url: { url: base64Data } },
                    { type: 'text', text: `Describe this image (${fileName}) and extract any relevant information for resume context.` }
                ]],
            ]), { timeout: 60_000 })
        );

        if (err) throw new Error(`Image summarization failed: ${err.message}`);

        const text = typeof result.content === 'string'
            ? result.content
            : result.content?.[0]?.text || '';

        return text.trim();
    }
}
