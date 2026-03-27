// AI Search — Web search module using Brave Search API and Tavily API

import { attempt } from '../utils.js';

// ─── State ──────────────────────────────────────────────────────────────────

let searchConfig = null;
let tavilyConfig = null;

const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search';
const TAVILY_BASE = 'https://api.tavily.com';

function getFetch() {
    return typeof puter !== 'undefined' ? puter.net.fetch : fetch;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Configures search with API credentials from settings.
 * @param {object} settings - Full settings object from db.getSettings()
 */
export function configureSearch(settings) {
    const config = settings['search:config'];
    searchConfig = config?.apiKey ? config : null;

    const tavily = settings['tavily:config'];
    tavilyConfig = tavily?.apiKey ? tavily : null;
}

/**
 * Returns whether Brave search is properly configured.
 * @returns {boolean}
 */
export function isSearchConfigured() {
    return searchConfig !== null;
}

/**
 * Returns whether Tavily is properly configured.
 * @returns {boolean}
 */
export function isTavilyConfigured() {
    return tavilyConfig !== null;
}

/**
 * Performs a web search using Brave Search API.
 * @param {string} query - Search query string
 * @returns {Promise<Array<{title: string, snippet: string, link: string}>>}
 */
export async function webSearch(query, { signal } = {}) {
    const params = new URLSearchParams({
        q: query,
        count: '5',
    });

    const [response, err] = await attempt(async () => {
        const res = await getFetch()(`${BRAVE_URL}?${params}`, {
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': searchConfig.apiKey,
            },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json();
    });

    if (err) throw new Error(`Search failed: ${err.message}`);

    const results = response?.web?.results || [];

    return results.map(item => ({
        title: item.title || '',
        snippet: item.description || '',
        link: item.url || '',
    }));
}

// ─── Tavily API ─────────────────────────────────────────────────────────────

async function tavilyRequest(endpoint, body) {
    const res = await getFetch()(`${TAVILY_BASE}/${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tavilyConfig.apiKey}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Tavily ${endpoint} ${res.status}: ${detail || res.statusText}`);
    }
    return res.json();
}

/**
 * Search the web using Tavily.
 * @param {string} query
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
export async function tavilySearch(query, opts = {}) {
    const data = await tavilyRequest('search', {
        query,
        search_depth: opts.searchDepth || 'basic',
        max_results: opts.maxResults || 5,
        topic: opts.topic || 'general',
        include_answer: true,
        include_raw_content: false,
    });

    return {
        answer: data.answer || null,
        results: (data.results || []).map(r => ({
            title: r.title || '',
            url: r.url || '',
            content: r.content || '',
            score: r.score || 0,
        })),
    };
}

/**
 * Extract content from one or more URLs using Tavily.
 * @param {string|string[]} urls
 * @returns {Promise<object>}
 */
export async function tavilyExtract(urls) {
    const data = await tavilyRequest('extract', {
        urls: Array.isArray(urls) ? urls : [urls],
        format: 'markdown',
    });

    return {
        results: (data.results || []).map(r => ({
            url: r.url || '',
            content: r.raw_content || '',
        })),
        failed: data.failed_results || [],
    };
}

/**
 * Crawl a website using Tavily.
 * @param {string} url
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
export async function tavilyCrawl(url, opts = {}) {
    const data = await tavilyRequest('crawl', {
        url,
        max_depth: opts.maxDepth || 1,
        max_breadth: opts.maxBreadth || 10,
        limit: opts.limit || 20,
        format: 'markdown',
        instructions: opts.instructions || undefined,
    });

    return {
        baseUrl: data.base_url || url,
        results: (data.results || []).map(r => ({
            url: r.url || '',
            content: r.raw_content || '',
        })),
    };
}

/**
 * Map a website's URL structure using Tavily.
 * @param {string} url
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
export async function tavilyMap(url, opts = {}) {
    const data = await tavilyRequest('map', {
        url,
        max_depth: opts.maxDepth || 1,
        max_breadth: opts.maxBreadth || 20,
        limit: opts.limit || 50,
        instructions: opts.instructions || undefined,
    });

    return {
        baseUrl: data.base_url || url,
        urls: data.results || [],
    };
}
