// Chat Memory — token estimation, message trimming, and summary management

const DEFAULT_MAX_TOKENS = 32_768;
const SUMMARY_MAX_TOKENS = 512;
const RESERVE_TOKENS = 4_096; // headroom for system prompt + current message + response

/**
 * Estimates token count using ~4 chars per token approximation.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

/**
 * Estimates total tokens for an array of messages.
 * @param {Array<{role: string, content: string}>} messages
 * @returns {number}
 */
export function estimateMessagesTokens(messages) {
    let total = 0;
    for (const msg of messages) {
        // ~4 tokens overhead per message for role/formatting
        total += estimateTokens(msg.content) + 4;
    }
    return total;
}

/**
 * Trims messages to fit within a token budget, keeping the most recent.
 * Always trims at a user-message boundary to preserve turn coherence.
 *
 * @param {Array<{role: string, content: string}>} messages - All messages, oldest first
 * @param {object} opts
 * @param {number} [opts.maxTokens=32768]
 * @param {number} [opts.reserveTokens=4096]
 * @param {number} [opts.summaryTokens=0] - Tokens already used by existing summary
 * @returns {{ kept: Array, dropped: Array }}
 */
export function trimChatHistory(messages, {
    maxTokens = DEFAULT_MAX_TOKENS,
    reserveTokens = RESERVE_TOKENS,
    summaryTokens = 0
} = {}) {
    const budget = maxTokens - reserveTokens - summaryTokens;

    if (budget <= 0) {
        return { kept: [], dropped: [...messages] };
    }

    // Walk backwards from the end, accumulating tokens
    let accumulated = 0;
    let cutIndex = messages.length;

    for (let i = messages.length - 1; i >= 0; i--) {
        const msgTokens = estimateTokens(messages[i].content) + 4;
        if (accumulated + msgTokens > budget) {
            cutIndex = i + 1;
            break;
        }
        accumulated += msgTokens;
        if (i === 0) cutIndex = 0;
    }

    // Adjust cutIndex forward to land on a user message boundary
    // so we don't start context mid-conversation with an assistant message
    while (cutIndex < messages.length && messages[cutIndex].role !== 'user') {
        cutIndex++;
    }

    const dropped = messages.slice(0, cutIndex);
    const kept = messages.slice(cutIndex);

    return { kept, dropped };
}

/**
 * Formats messages into a readable transcript for summarization.
 * @param {Array<{role: string, content: string}>} messages
 * @returns {string}
 */
export function formatTranscript(messages) {
    return messages
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');
}

/**
 * Truncates a summary to stay within the token budget.
 * Keeps the end (most recent context) if truncation is needed.
 * @param {string} summary
 * @param {number} [maxTokens=512]
 * @returns {string}
 */
export function truncateSummary(summary, maxTokens = SUMMARY_MAX_TOKENS) {
    if (!summary) return '';
    const tokens = estimateTokens(summary);
    if (tokens <= maxTokens) return summary;

    // Keep the tail — most recent context is most valuable
    const maxChars = maxTokens * 4;
    return '...' + summary.slice(-maxChars);
}

export { DEFAULT_MAX_TOKENS, SUMMARY_MAX_TOKENS, RESERVE_TOKENS };
