/**
 * scheduler.js
 *
 * A high-performance utility for managing event loop yielding in CPU-bound tasks.
 * Abstracts setImmediate, scheduler.postTask, and setTimeout.
 *
 * @module stream/scheduler
 */

// --- Environment Detection ---

const isNode = typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null;

const isSchedulerAvailable = typeof scheduler !== 'undefined' &&
    typeof scheduler.postTask === 'function';

// Polyfill for performance.now() if missing (e.g., very old environments)
const now = (typeof performance !== 'undefined' && performance.now)
    ? () => performance.now()
    : () => Date.now();

// --- Yield Primitives ---

/**
 * Yields execution control back to the event loop.
 * Priority: setImmediate (Node) > postTask (Browser) > setTimeout (Fallback)
 * @returns {Promise<void>}
 */
const yieldControl = isNode
    ? () => new Promise(resolve => setImmediate(resolve))
    : isSchedulerAvailable
        ? () => scheduler.postTask(() => {}, { priority: 'user-visible' })
        : () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Creates a "Time Slicer" function that enforces a strict time budget.
 *
 * @param {number} [budgetMs=8] - The time budget in milliseconds.
 * @returns {function(): Promise<void>} An async function to await inside tight loops.
 */
export function createTimeSlicer(budgetMs = 8) {
    let start = now();

    return async function checkYield() {
        if ((now() - start) >= budgetMs) {
            await yieldControl();
            start = now(); // Reset clock
        }
    };
}