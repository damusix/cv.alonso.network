// AI Search — Web search module using Brave Search API

import { attempt } from '../utils.js';

// ─── State ──────────────────────────────────────────────────────────────────

let searchConfig = null;

const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search';
const CORS_PROXY = 'https://corsproxy.io/?url=';
const BASE_URL = `${CORS_PROXY}${encodeURIComponent(BRAVE_URL)}`;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Configures search with API credentials from settings.
 * @param {object} settings - Full settings object from db.getSettings()
 */
export function configureSearch(settings) {
    const config = settings['search:config'];
    if (config?.apiKey) {
        searchConfig = config;
    } else {
        searchConfig = null;
    }
}

/**
 * Returns whether search is properly configured with an API key.
 * @returns {boolean}
 */
export function isSearchConfigured() {
    return searchConfig !== null;
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
        const res = await fetch(`${BASE_URL}?${params}`, {
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': searchConfig.apiKey,
            },
            signal,
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
