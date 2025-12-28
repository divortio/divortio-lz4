/**
 * scheduler.js
 *
 * A high-performance utility for managing event loop yielding in CPU-bound tasks.
 * This module abstracts the differences between Node.js (setImmediate),
 * Modern Browsers (scheduler.postTask), and standard environments (setTimeout)
 * to prevent UI freezing or thread blocking during heavy compression operations.
 *
 * @module stream/scheduler
 */

// --- Environment Detection ---

/**
 * Detects if the current environment is Node.js.
 * @type {boolean}
 */
const isNode = typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null;

/**
 * Detects if the modern `scheduler.postTask` API is available (Chrome/Edge).
 * This API is preferred in browsers as it allows prioritizing user-visible work without clamping.
 * @type {boolean}
 */
const isSchedulerAvailable = typeof scheduler !== 'undefined' &&
    typeof scheduler.postTask === 'function';

// --- Yield Primitives ---

/**
 * Yields execution control back to the event loop.
 *
 * This function selects the most performant primitive for the current environment:
 * 1. **Node.js**: Uses `setImmediate`. This is the fastest method, scheduling execution
 * on the 'check' phase of the event loop with near-zero latency.
 * 2. **Modern Browsers**: Uses `scheduler.postTask` with 'user-visible' priority.
 * This tells the browser to schedule the task without the heavy throttling usually applied to `setTimeout`.
 * 3. **Fallback**: Uses `setTimeout(..., 0)`. While universally supported, this is often
 * clamped by browsers to ~4ms, making it the least efficient option.
 *
 * @returns {Promise<void>} A promise that resolves once the event loop has ticked.
 */
const yieldControl = isNode
    ? () => new Promise(resolve => setImmediate(resolve))
    : isSchedulerAvailable
        ? () => scheduler.postTask(() => {}, { priority: 'user-visible' })
        : () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Creates a "Time Slicer" function that enforces a strict time budget.
 *
 * This factory returns a check function that accumulates execution time.
 * When the elapsed time exceeds the `budgetMs`, the check function yields
 * to the event loop and resets the timer. This allows long-running loops
 * to run "almost" synchronously while guaranteeing responsiveness.
 *
 * @param {number} [budgetMs=8] - The time budget in milliseconds before a yield is forced.
 * Defaults to 8ms (approx half a 60fps frame).
 * @returns {function(): Promise<void>} An async function to await inside tight loops.
 *
 * @example
 * const yieldIfOverBudget = createTimeSlicer(12);
 * while (true) {
 * doHeavyWork();
 * await yieldIfOverBudget(); // Only pauses if >12ms has passed
 * }
 */
export function createTimeSlicer(budgetMs = 8) {
    let start = performance.now();

    return async function checkYield() {
        const now = performance.now();
        if ((now - start) >= budgetMs) {
            await yieldControl();
            start = performance.now(); // Reset clock after returning from yield
        }
    };
}