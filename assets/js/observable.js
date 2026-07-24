// Observable Event System using LogosDX Observer

// Create a global observer instance (lazy initialization)
let observer = null;
const { ObserverEngine } = window.LogosDx?.Observer ?? {};

function getObserver() {
    if (!observer && window.LogosDx?.Observer) {

        observer = new ObserverEngine({
            spy: ({ fn, event }) => {

                if (fn !== 'emit') return;
                if (!window.gtag) return;

                // Track only THAT an event happened — never its payload. Event data here
                // can be the entire CV (personal info included) or a large AI generation;
                // sending it to GA both leaks user data and blows past GA4's request-size
                // limit, so the collect endpoint rejects it with 413. GA4 also requires
                // event names to be [A-Za-z0-9_] and <=40 chars, so ':'/'-' are normalized.
                const name = String(event).replace(/[^a-z0-9_]/gi, '_').slice(0, 40);
                gtag('event', name, { event_category: 'cv-generator' });
            }
        });
    }
    return observer;
}

/**
 * Event Types:
 *
 * - cv:reset - User reset CV data to defaults
 * - cv:save - User applied/saved changes
 * - cv:import - User imported CV data
 * - cv:export - User exported CV data
 * - cv:print - User triggered print
 * - editor:fullscreen - Editor fullscreen toggled
 * - editor:mode-change - Editor mode changed (javascript/css)
 * - editor:open - Editor opened (mobile)
 * - editor:close - Editor closed (mobile)
 */

/**
 * Emit an event through the observer
 * @param {string} event - Event name
 * @param {any} data - Event data payload
 */
export function emit(event, data = {}) {
    const obs = getObserver();
    if (obs) {
        obs.emit(event, {
            timestamp: new Date().toISOString(),
            ...data
        });
    }
}

/**
 * Subscribe to an event
 * @param {string} event - Event name or pattern
 * @param {Function} handler - Event handler function
 * @returns {Function} Unsubscribe function
 */
export function on(event, handler) {
    const obs = getObserver();
    if (obs) {
        return obs.on(event, handler);
    }
    return () => {}; // Return noop unsubscribe function
}

/**
 * Subscribe to an event once
 * @param {string} event - Event name or pattern
 * @param {Function} handler - Event handler function
 * @returns {Function} Unsubscribe function
 */
export function once(event, handler) {
    const obs = getObserver();
    if (obs) {
        return obs.once(event, handler);
    }
    return () => {}; // Return noop unsubscribe function
}

/**
 * Remove event listener
 * @param {string} event - Event name
 * @param {Function} handler - Event handler function
 */
export function off(event, handler) {
    const obs = getObserver();
    if (obs) {
        obs.off(event, handler);
    }
}
