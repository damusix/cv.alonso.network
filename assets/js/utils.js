// Re-exports from @logosdx/utils (loaded via CDN as window.LogosDx.Utils)
// https://logosdx.dev/packages/utils.html

const U = LogosDx.Utils;

// ─── Error Handling ──────────────────────────────────────────────────────────

/**
 * Go-style async error handling. Wraps an async function and returns a result tuple
 * instead of throwing.
 *
 * @param {() => Promise<T>} fn - Async function to execute
 * @returns {Promise<[T, null] | [null, Error]>} Result tuple: [value, null] on success, [null, error] on failure
 */
export const attempt = U.attempt;

/**
 * Synchronous version of attempt. Wraps a function that might throw and returns
 * a result tuple.
 *
 * @param {() => T} fn - Synchronous function to execute
 * @returns {[T, null] | [null, Error]} Result tuple: [value, null] on success, [null, error] on failure
 */
export const attemptSync = U.attemptSync;

// ─── Flow Control ────────────────────────────────────────────────────────────

/**
 * Retries an async function with configurable backoff, jitter, and conditional retry.
 *
 * @param {(...args: any[]) => Promise<T>} fn - Async function to retry
 * @param {Object} options
 * @param {number}   [options.retries=3]           - Maximum retry attempts
 * @param {number}   [options.delay=0]             - Base delay between retries (ms)
 * @param {number}   [options.backoff=1]           - Exponential backoff multiplier
 * @param {number}   [options.jitterFactor=0]      - Random jitter factor (0-1)
 * @param {(error: Error) => boolean} [options.shouldRetry] - Predicate to decide if retry should occur
 * @param {AbortSignal} [options.signal]           - AbortSignal to cancel retries
 * @param {boolean}  [options.throwLastError=false] - Throw last error when retries exhausted
 * @param {(error: Error, attempt: number) => void|Promise<void>} [options.onRetry] - Called on each retry
 * @param {(error: Error) => T|Promise<T>} [options.onRetryExhausted] - Fallback when retries exhausted
 * @returns {Promise<T>}
 */
export const retry = U.retry;

/**
 * Circuit breaker pattern. Prevents cascading failures by halting calls after
 * a failure threshold, then recovering after a cooldown period.
 *
 * @param {(...args: any[]) => Promise<T>} fn - Async function to protect
 * @param {Object} options
 * @param {number}   [options.maxFailures=5]    - Failures before opening circuit
 * @param {number}   [options.resetAfter=30000] - Cooldown period in ms before half-open
 * @param {() => void} [options.onOpen]         - Called when circuit opens
 * @param {() => void} [options.onClose]        - Called when circuit closes
 * @param {() => void} [options.onHalfOpen]     - Called when circuit enters half-open state
 * @returns {(...args: any[]) => Promise<T>} Wrapped function with circuit breaker
 */
export const circuitBreaker = U.circuitBreaker;

/**
 * Enforces a maximum execution duration on an async function.
 * Rejects with TimeoutError if the function exceeds the timeout.
 *
 * @param {(...args: any[]) => Promise<T>} fn - Async function to wrap
 * @param {Object} options
 * @param {number}   options.timeout        - Maximum execution time in ms
 * @param {(...args: any[]) => void} [options.onTimeout] - Called when timeout occurs
 * @returns {(...args: any[]) => Promise<T>} Wrapped function with timeout
 */
export const withTimeout = U.withTimeout;

/**
 * Composes multiple flow control patterns (timeout, retry, circuit breaker, rate limit)
 * into a single resilient function wrapper.
 *
 * @param {(...args: any[]) => Promise<T>} fn - Async function to protect
 * @param {Object} options
 * @param {Object}  [options.withTimeout]     - WithTimeout options ({ timeout, onTimeout })
 * @param {Object}  [options.retry]           - Retry options ({ retries, delay, backoff, ... })
 * @param {Object}  [options.circuitBreaker]  - CircuitBreaker options ({ maxFailures, resetAfter, ... })
 * @param {Object}  [options.rateLimit]       - RateLimit options ({ maxCalls, windowMs, ... })
 * @returns {(...args: any[]) => Promise<T>} Composed resilient function
 */
export const composeFlow = U.composeFlow;

/**
 * Rate limits a function using a token bucket algorithm.
 *
 * @param {(...args: any[]) => T} fn - Function to rate limit
 * @param {Object} options
 * @param {number}   options.maxCalls                 - Maximum calls per window
 * @param {number}   [options.windowMs=1000]           - Time window in ms
 * @param {boolean}  [options.throws=true]             - Throw RateLimitError when limited
 * @param {(error: RateLimitError, nextAvailable: Date, args: any[]) => void} [options.onLimitReached] - Called when limit hit
 * @returns {(...args: any[]) => T} Rate-limited function
 */
export const rateLimit = U.rateLimit;

/**
 * Token bucket for precise rate limiting with optional persistence.
 *
 * @class
 * @param {Object} config
 * @param {number}  config.capacity          - Maximum tokens in the bucket
 * @param {number}  config.refillIntervalMs  - Interval between token refills (ms)
 * @param {Object}  [config.initialState]    - Initial state ({ tokens, lastRefill })
 * @param {Function} [config.save]           - Persistence save function
 * @param {Function} [config.load]           - Persistence load function
 *
 * @method consume(count?: number): boolean
 * @method hasTokens(count?: number): boolean
 * @method waitForToken(count?: number, options?: { onRateLimit?, abortController? }): Promise<void>
 * @method waitAndConsume(count?: number, options?: { onRateLimit?, abortController? }): Promise<boolean>
 * @method reset(): void
 * @method save(): Promise<void>
 * @method load(): Promise<void>
 * @property {number} tokens - Current token count
 * @property {Object} snapshot - Current bucket snapshot
 * @property {Object} state - Current bucket state
 * @property {boolean} isSaveable - Whether persistence is configured
 */
export const RateLimitTokenBucket = U.RateLimitTokenBucket;

/**
 * Processes an array with controlled concurrency, supporting error recovery
 * and progress tracking.
 *
 * @param {(item: T) => Promise<R>} fn - Async processor for each item
 * @param {Object} options
 * @param {T[]}      options.items                    - Array of items to process
 * @param {number}   [options.concurrency=10]          - Max parallel executions
 * @param {'abort'|'continue'} [options.failureMode]   - Stop or continue on error
 * @param {(error: Error, item: T, index: number) => void} [options.onError] - Error handler per item
 * @param {(total: number) => void} [options.onStart]  - Called when batch starts
 * @param {(results: BatchResult[]) => void} [options.onEnd] - Called when batch ends
 * @param {(params: ChunkParams) => void} [options.onChunkStart] - Called per chunk start
 * @param {(params: ChunkParams) => void} [options.onChunkEnd]   - Called per chunk end
 * @returns {Promise<Array<{ result: R|null, error: Error|null, item: T, index: number }>>}
 */
export const batch = U.batch;

/**
 * Deduplicates concurrent async calls with identical arguments. The first call
 * executes; subsequent concurrent calls share the same in-flight promise.
 * No post-settlement caching.
 *
 * @param {(...args: any[]) => Promise<T>} fn - Async function to deduplicate
 * @param {Object} [options]
 * @param {(...args: any[]) => string} [options.generateKey] - Custom cache key generator
 * @param {(...args: any[]) => boolean} [options.shouldDedupe] - Predicate to skip dedup
 * @param {(key: string) => void} [options.onStart]   - Called on first execution
 * @param {(key: string) => void} [options.onJoin]    - Called when joining existing promise
 * @param {(key: string, value: T) => void} [options.onResolve] - Called on resolution
 * @param {(key: string, error: unknown) => void} [options.onReject] - Called on rejection
 * @returns {(...args: any[]) => Promise<T>} Deduplicated function
 */
export const withInflightDedup = U.withInflightDedup;

// ─── Data Operations ─────────────────────────────────────────────────────────

/**
 * Deep clones a value, preserving modern JS types (Map, Set, Date, WeakRef, WeakMap).
 *
 * @param {T} value - Value to clone
 * @returns {T} Deep clone of value
 */
export const clone = U.clone;

/**
 * Deep equality comparison across all JavaScript types.
 *
 * @param {unknown} a - First value
 * @param {unknown} b - Second value
 * @returns {boolean} Whether values are deeply equal
 */
export const equals = U.equals;

/**
 * Deep merges two objects with configurable array and Set handling.
 *
 * @param {T} target - Target object (mutated)
 * @param {U} source - Source object to merge from
 * @param {Object} [options]
 * @param {boolean} [options.mergeArrays] - Concatenate arrays instead of replacing
 * @param {boolean} [options.mergeSets]   - Union Sets instead of replacing
 * @returns {T & U} Merged object
 */
export const merge = U.merge;

/**
 * Type-safe deep property access using dot notation.
 *
 * @param {T} obj - Object to access
 * @param {string} path - Dot-notation path (e.g. "a.b.c")
 * @returns {*|undefined} Value at path, or undefined if not found
 */
export const reach = U.reach;

/**
 * Sets a nested property using dot notation, creating intermediate objects as needed.
 *
 * @param {T} obj - Object to modify (mutated)
 * @param {string} path - Dot-notation path (e.g. "a.b.c")
 * @param {*} value - Value to set
 * @returns {void}
 */
export const setDeep = U.setDeep;

/**
 * Sets multiple nested values in one call. Fails fast on first error.
 *
 * @param {T} obj - Object to modify (mutated)
 * @param {Array<[string, *]>} entries - Array of [path, value] pairs
 * @returns {void}
 */
export const setDeepMany = U.setDeepMany;

/**
 * Transforms flat key-value config (e.g. env vars) into a nested config object
 * with automatic type coercion. Returns a memoized accessor function.
 *
 * @param {Record<string, string>} flatConfig - Flat key-value pairs
 * @param {Object} [opts]
 * @param {(key: string, val: string) => boolean} [opts.filter] - Filter predicate for keys
 * @param {boolean}  [opts.forceAllCapToLower=true] - Lowercase ALL_CAPS keys
 * @param {string}   [opts.separator="_"]            - Key segment separator
 * @param {string|number} [opts.stripPrefix]         - Prefix to strip from keys
 * @param {boolean}  [opts.parseUnits=false]          - Parse unit strings (e.g. "5mb")
 * @param {(key: string, value: unknown) => boolean} [opts.skipConversion] - Skip type conversion predicate
 * @param {Object|false} [opts.memoizeOpts]           - Memoize options or false to disable
 * @returns {(path?: string, defaultValue?: *) => *} Config accessor function
 */
export const makeNestedConfig = U.makeNestedConfig;

/**
 * Recursively coerces string values to appropriate JS types in-place.
 * Converts "true"/"yes" to true, "false"/"no" to false, numeric strings to numbers.
 *
 * @param {Object} obj - Object to mutate
 * @param {Object} [opts]
 * @param {boolean} [opts.parseUnits] - Parse unit strings (e.g. "5mb", "10s")
 * @param {(key: string, value: unknown) => boolean} [opts.skipConversion] - Skip predicate
 * @returns {void}
 */
export const castValuesToTypes = U.castValuesToTypes;

/**
 * Checks if a value represents an enabled state ("true", "yes", true, 1).
 *
 * @param {unknown} val
 * @returns {boolean}
 */
export const isEnabledValue = U.isEnabledValue;

/**
 * Checks if a value represents a disabled state ("false", "no", false, 0).
 *
 * @param {unknown} val
 * @returns {boolean}
 */
export const isDisabledValue = U.isDisabledValue;

/**
 * Checks if a value represents either an enabled or disabled state.
 *
 * @param {unknown} val
 * @returns {boolean}
 */
export const hasEnabledOrDisabledValue = U.hasEnabledOrDisabledValue;

// ─── Unit Conversion & Formatting ────────────────────────────────────────────

/**
 * Time unit constants and multiplier functions (values in milliseconds).
 *
 * @property {number} sec   - 1000
 * @property {number} min   - 60000
 * @property {number} hour  - 3600000
 * @property {number} day   - 86400000
 * @property {number} week  - 604800000
 * @method secs(n: number): number
 * @method mins(n: number): number
 * @method hours(n: number): number
 * @method days(n: number): number
 * @method weeks(n: number): number
 */
export const timeUnits = U.timeUnits;

/** @param {number} n @returns {number} Milliseconds for n seconds */
export const seconds = U.seconds;

/** @param {number} n @returns {number} Milliseconds for n minutes */
export const minutes = U.minutes;

/** @param {number} n @returns {number} Milliseconds for n hours */
export const hours = U.hours;

/** @param {number} n @returns {number} Milliseconds for n days */
export const days = U.days;

/** @param {number} n @returns {number} Milliseconds for n weeks */
export const weeks = U.weeks;

/** @param {number} n @returns {number} Milliseconds for n months (approximate) */
export const months = U.months;

/** @param {number} n @returns {number} Milliseconds for n years (approximate) */
export const years = U.years;

/**
 * Parses a human-readable time duration string into milliseconds.
 * e.g. "5s", "2m", "1h30m", "3d"
 *
 * @param {string} str - Duration string
 * @returns {number} Duration in milliseconds
 */
export const parseTimeDuration = U.parseTimeDuration;

/**
 * Formats milliseconds into a human-readable duration string.
 *
 * @param {number} ms - Duration in milliseconds
 * @param {Object} [opts]
 * @param {number} [opts.decimals] - Decimal places in output
 * @param {'sec'|'min'|'hour'|'day'|'week'|'month'|'year'} [opts.unit] - Force specific unit
 * @returns {string} Formatted duration (e.g. "2.5 hours")
 */
export const formatTimeDuration = U.formatTimeDuration;

/**
 * Byte size unit constants and multiplier functions.
 *
 * @property {number} kb - 1024
 * @property {number} mb - 1048576
 * @property {number} gb - 1073741824
 * @property {number} tb - 1099511627776
 * @method kbs(n: number): number
 * @method mbs(n: number): number
 * @method gbs(n: number): number
 * @method tbs(n: number): number
 */
export const byteUnits = U.byteUnits;

/** @param {number} n @returns {number} Bytes for n kilobytes */
export const kilobytes = U.kilobytes;

/** @param {number} n @returns {number} Bytes for n megabytes */
export const megabytes = U.megabytes;

/** @param {number} n @returns {number} Bytes for n gigabytes */
export const gigabytes = U.gigabytes;

/** @param {number} n @returns {number} Bytes for n terabytes */
export const terabytes = U.terabytes;

/**
 * Parses a human-readable byte size string into bytes.
 * e.g. "5kb", "2mb", "1.5gb"
 *
 * @param {string} str - Size string
 * @returns {number} Size in bytes
 */
export const parseByteSize = U.parseByteSize;

/**
 * Formats bytes into a human-readable size string.
 *
 * @param {number} bytes - Size in bytes
 * @param {Object} [opts]
 * @param {number} [opts.decimals=2] - Decimal places in output
 * @param {'kb'|'mb'|'gb'|'tb'} [opts.unit] - Force specific unit
 * @returns {string} Formatted size (e.g. "1.50 MB")
 */
export const formatByteSize = U.formatByteSize;

// ─── Performance & Caching ───────────────────────────────────────────────────

/**
 * Memoizes an async function with TTL, LRU eviction, inflight deduplication,
 * and stale-while-revalidate support. Returns an enhanced function with a
 * `.cache` interface for management.
 *
 * @param {(...args: any[]) => Promise<T>} fn - Async function to memoize
 * @param {Object} [options]
 * @param {number}   [options.ttl=60000]            - Time-to-live in ms
 * @param {number}   [options.maxSize=1000]          - Max cache entries (LRU eviction)
 * @param {number}   [options.cleanupInterval=60000] - Interval for expired entry cleanup (ms)
 * @param {(...args: any[]) => string} [options.generateKey] - Custom cache key generator
 * @param {(...args: any[]) => boolean} [options.shouldCache] - Predicate to skip caching
 * @param {boolean}  [options.useWeakRef=false]      - Use WeakRef for cached values
 * @param {number}   [options.staleIn]               - Time before value is considered stale (ms)
 * @param {number}   [options.staleTimeout]           - Max time for background revalidation (ms)
 * @param {(error: Error, args: any[]) => void} [options.onError] - Error handler
 * @param {Object}   [options.adapter]                - Custom cache adapter
 * @returns {Function & { cache: { clear(), delete(key), has(key), size, stats(), keys(), entries() } }}
 */
export const memoize = U.memoize;

/**
 * Synchronous memoization without inflight deduplication or stale-while-revalidate.
 *
 * @param {(...args: any[]) => T} fn - Synchronous function to memoize
 * @param {Object} [options]
 * @param {number}   [options.ttl=60000]            - Time-to-live in ms
 * @param {number}   [options.maxSize=1000]          - Max cache entries (LRU eviction)
 * @param {number}   [options.cleanupInterval=60000] - Cleanup interval (ms)
 * @param {(...args: any[]) => string} [options.generateKey] - Custom cache key generator
 * @param {(...args: any[]) => boolean} [options.shouldCache] - Predicate to skip caching
 * @param {boolean}  [options.useWeakRef=false]      - Use WeakRef for cached values
 * @param {(error: Error, args: any[]) => void} [options.onError] - Error handler
 * @returns {Function & { cache: { clear(), delete(key), has(key), size, stats(), keys(), entries() } }}
 */
export const memoizeSync = U.memoizeSync;

/**
 * Debounces a function, delaying execution until calls cease for the specified
 * delay period. Optionally enforces a maximum wait time.
 *
 * @param {(...args: any[]) => T} fn - Function to debounce
 * @param {Object} options
 * @param {number}  options.delay    - Debounce delay in ms
 * @param {number}  [options.maxWait] - Maximum wait before forced execution (ms)
 * @returns {{ (...args): void, flush(): T|undefined, cancel(): void }}
 */
export const debounce = U.debounce;

/**
 * Throttles a function to a maximum invocation rate.
 *
 * @param {(...args: any[]) => T} fn - Function to throttle
 * @param {Object} options
 * @param {number}  options.delay       - Minimum interval between calls (ms)
 * @param {boolean} [options.throws=true] - Throw ThrottleError when throttled
 * @param {(...args: any[]) => void} [options.onThrottle] - Called when invocation is throttled
 * @returns {{ (...args): T, cancel(): void }}
 */
export const throttle = U.throttle;

// ─── Validation & Type Guards ────────────────────────────────────────────────

/**
 * Runtime assertion. Throws if test is falsy.
 *
 * @param {unknown} test - Value to assert as truthy
 * @param {string} [message] - Error message
 * @param {typeof Error} [ErrorClass] - Custom error class to throw
 * @returns {void}
 * @throws {AssertError|ErrorClass}
 */
export const assert = U.assert;

/**
 * Deep object validation using path-based assertions.
 * Each assertion is a function returning [boolean, errorMessage].
 *
 * @param {T} obj - Object to validate
 * @param {Record<string, (value: *) => [boolean, string]>} assertions - Path-to-validator map
 * @returns {void}
 * @throws {AssertError}
 */
export const assertObject = U.assertObject;

/** @param {unknown} a @returns {boolean} True if a is a function */
export const isFunction = U.isFunction;

/** @param {unknown} a @returns {boolean} True if a is an object (including arrays, excluding null) */
export const isObject = U.isObject;

/** @param {unknown} a @returns {boolean} True if a is a plain object (not class instance) */
export const isPlainObject = U.isPlainObject;

/** @param {unknown} val @returns {boolean} True if val is a primitive type */
export const isPrimitive = U.isPrimitive;

/** @param {unknown} val @returns {boolean} True if val is undefined */
export const isUndefined = U.isUndefined;

/** @param {unknown} val @returns {boolean} True if val is not null/undefined */
export const isDefined = U.isDefined;

/** @param {unknown} val @returns {boolean} True if val is null */
export const isNull = U.isNull;

/** @returns {boolean} True if running in a browser environment */
export const isBrowser = U.isBrowser;

/** @returns {boolean} True if running in Node.js */
export const isNode = U.isNode;

/** @returns {boolean} True if running in React Native */
export const isReactNative = U.isReactNative;

/**
 * Checks that all values in an object pass a predicate.
 *
 * @param {T} item - Object to check
 * @param {(value: T[keyof T], key: string|number) => boolean} check - Predicate
 * @returns {boolean}
 */
export const allKeysValid = U.allKeysValid;

/**
 * Checks that all items in an iterable pass a predicate.
 *
 * @param {Iterable<unknown>} item - Iterable to check
 * @param {(value: unknown) => boolean} check - Predicate
 * @returns {boolean}
 */
export const allItemsValid = U.allItemsValid;

// ─── Error Types ─────────────────────────────────────────────────────────────

/** Error thrown when all retries are exhausted */
export const RetryError = U.RetryError;

/** Error thrown when a function exceeds its timeout */
export const TimeoutError = U.TimeoutError;

/** Error thrown when the circuit breaker is open */
export const CircuitBreakerError = U.CircuitBreakerError;

/** Error thrown when rate limit is exceeded */
export const RateLimitError = U.RateLimitError;

/** Error thrown when a throttled function is called too frequently */
export const ThrottleError = U.ThrottleError;

/** Error thrown by assert/assertObject on failure */
export const AssertError = U.AssertError;

/** @param {unknown} error @returns {boolean} True if error is a RetryError */
export const isRetryError = U.isRetryError;

/** @param {unknown} error @returns {boolean} True if error is a TimeoutError */
export const isTimeoutError = U.isTimeoutError;

/** @param {unknown} error @returns {boolean} True if error is a CircuitBreakerError */
export const isCircuitBreakerError = U.isCircuitBreakerError;

/** @param {unknown} error @returns {boolean} True if error is a RateLimitError */
export const isRateLimitError = U.isRateLimitError;

/** @param {unknown} error @returns {boolean} True if error is a ThrottleError */
export const isThrottleError = U.isThrottleError;

/** @param {unknown} error @returns {boolean} True if error is an AssertError */
export const isAssertError = U.isAssertError;

// ─── Misc ────────────────────────────────────────────────────────────────────

/**
 * Returns a TimeoutPromise that resolves after the specified delay.
 * The returned promise has a `.clear()` method to cancel the timeout early.
 *
 * @template T
 * @param {number} ms - Delay in milliseconds
 * @param {T} [value] - Optional value to resolve with
 * @returns {TimeoutPromise<T>} A promise with a `.clear()` method to cancel
 *
 * @example
 *     const p = wait(5000, 'done');
 *     p.clear(); // cancels the timeout, promise never resolves
 */
export const wait = U.wait;

/**
 * A Promise subclass with a `.clear()` method to cancel the pending timeout.
 * Returned by `wait()`.
 *
 * @class
 * @extends Promise<T>
 * @template T
 *
 * @param {(resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void} executor
 *
 * @property {() => void} clear - Cancels the timeout, preventing resolution
 *
 * @method then<TResult1, TResult2>(onfulfilled?, onrejected?): Promise<TResult1 | TResult2>
 * @method catch<TResult>(onrejected?): Promise<T | TResult>
 * @method finally(onfinally?): Promise<T>
 */
export const TimeoutPromise = U.TimeoutPromise;
