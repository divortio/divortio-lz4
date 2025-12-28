/**
 * @fileoverview
 * LZ4 Worker Client (Main Thread Orchestrator)
 * ============================================================================
 * A "Batteries-Included" wrapper that manages the Web Worker instance.
 * It provides a simple Promise-based API for off-main-thread compression.
 *
 * FEATURES:
 * 1. Singleton Instance: Reuses one worker for all requests.
 * 2. SharedArrayBuffer: Automatically upgrades buffers to SABs if supported
 * to prevent blocking and avoid data cloning/neutering.
 * 3. Fallback: Gracefully handles environments without COOP/COEP headers.
 */

/** @type {Worker|null} */
let workerInstance = null;

/** @type {number} */
let messageIdCounter = 0;

/**
 * Map to correlate Worker responses back to their specific Promises.
 * Key: messageId, Value: { resolve, reject }
 * @type {Map<number, {resolve: Function, reject: Function}>}
 */
const pendingTasks = new Map();

/**
 * Lazy-loads the Web Worker singleton.
 * Uses `import.meta.url` to resolve the worker script relative to this module.
 *
 * @returns {Worker} The active worker instance.
 */
function getWorker() {
    if (!workerInstance) {
        // Feature Detection: Warn if high-performance mode is unavailable
        if (!window.crossOriginIsolated) {
            console.warn(
                "[LZ4] Performance Warning: Page is not 'cross-origin isolated'. " +
                "SharedArrayBuffer is disabled. Large file operations may be slower due to memory copying. " +
                "Serve with headers: 'Cross-Origin-Opener-Policy: same-origin' and 'Cross-Origin-Embedder-Policy: require-corp'."
            );
        }

        // Initialize Worker (Type: Module allows imports inside the worker)
        workerInstance = new Worker(new URL('./lz4.worker.js', import.meta.url), {
            type: 'module',
            name: 'LZ4-Worker'
        });

        // Global Response Handler
        workerInstance.onmessage = (event) => {
            const { id, status, buffer, error } = event.data;
            const taskResolver = pendingTasks.get(id);

            if (taskResolver) {
                if (status === 'success') {
                    // Wrap the returned ArrayBuffer in a view
                    taskResolver.resolve(new Uint8Array(buffer));
                } else {
                    taskResolver.reject(new Error(error || 'Unknown Worker Error'));
                }
                // Cleanup
                pendingTasks.delete(id);
            }
        };

        // Global Error Handler (for script loading errors, etc.)
        workerInstance.onerror = (err) => {
            console.error("[LZ4] Worker Critical Error:", err);
        };
    }
    return workerInstance;
}

/**
 * Generic handler to dispatch tasks to the worker.
 *
 * @param {string} task - 'compress' or 'decompress'.
 * @param {Uint8Array} data - The input data.
 * @param {number} [originalSize=0] - Required for decompression.
 * @returns {Promise<Uint8Array>}
 */
function runWorkerTask(task, data, originalSize = 0) {
    const worker = getWorker();
    const id = ++messageIdCounter;

    return new Promise((resolve, reject) => {
        pendingTasks.set(id, { resolve, reject });

        let transferBuffer = data.buffer;
        let isShared = false;

        // --------------------------------------------------------------------
        // MEMORY OPTIMIZATION STRATEGY
        // --------------------------------------------------------------------
        // Goal: Avoid "neutering" the user's buffer (rendering it unusable in main thread)
        // while avoiding slow structured clones.
        //
        // 1. If we have SharedArrayBuffer support (crossOriginIsolated):
        //    We copy the input to a SAB. The Worker reads the SAB.
        //    Result: Fast, and User keeps their original data valid.
        //
        // 2. If no SAB support:
        //    We rely on standard structured cloning (default postMessage behavior).
        //    Result: Slower for huge files, but safe (non-destructive).
        // --------------------------------------------------------------------

        if (window.crossOriginIsolated) {
            // If it's already a SAB, use it directly
            if (data.buffer instanceof SharedArrayBuffer) {
                transferBuffer = data.buffer;
                isShared = true;
            }
            // Otherwise, upgrade standard buffer to SAB
            else {
                try {
                    const sab = new SharedArrayBuffer(data.byteLength);
                    new Uint8Array(sab).set(data);
                    transferBuffer = sab;
                    isShared = true;
                } catch (e) {
                    // Fallback to standard buffer if allocation fails
                    transferBuffer = data.buffer;
                }
            }
        }

        // Payload
        const message = {
            id,
            task,
            buffer: transferBuffer,
            originalSize
        };

        // If using standard ArrayBuffers, we technically *could* transfer them
        // using the 2nd arg [transferBuffer], but that would destroy the user's
        // variable 'data'. For a library, safety > raw speed, so we don't transfer
        // unless explicitly asked (future feature).
        //
        // If it is a SharedArrayBuffer, we just send it (no transfer list needed).
        worker.postMessage(message);
    });
}

/**
 * The Public Worker API.
 */
export const LZ4Worker = {
    /**
     * Compress data on a background thread.
     * @param {Uint8Array} data - Input data.
     * @returns {Promise<Uint8Array>} Compressed data.
     */
    compress: (data) => runWorkerTask('compress', data),

    /**
     * Decompress data on a background thread.
     * @param {Uint8Array} data - Compressed LZ4 data.
     * @param {number} originalSize - The original byte size (required).
     * @returns {Promise<Uint8Array>} Decompressed data.
     */
    decompress: (data, originalSize) => runWorkerTask('decompress', data, originalSize)
};