/**
 * @fileoverview
 * LZ4 Worker Client (Main Thread Orchestrator)
 * ============================================================================
 * "Batteries-Included" wrapper for off-main-thread compression.
 *
 * SUPPORT:
 * - Buffer API: `compress(data)`, `decompress(data)`
 * - Stream API: `compressStream(readable, writable)`, `decompressStream(...)`
 */

/** @type {Worker|null} */
let workerInstance = null;

/** @type {number} */
let messageIdCounter = 0;

/**
 * Map to correlate Worker responses back to their specific Promises.
 */
const pendingTasks = new Map();

/**
 * Lazy-loads the Web Worker singleton.
 */
function getWorker() {
    if (!workerInstance) {
        // Feature Detection
        if (!window.crossOriginIsolated) {
            console.warn("[LZ4] Info: SharedArrayBuffer unavailable (COOP/COEP headers missing). Large buffer operations may copy memory.");
        }

        // Initialize Worker
        workerInstance = new Worker(new URL('./lz4.worker.js', import.meta.url), {
            type: 'module',
            name: 'LZ4-Worker'
        });

        workerInstance.onmessage = (event) => {
            const { id, status, buffer, error } = event.data;
            const taskResolver = pendingTasks.get(id);

            if (taskResolver) {
                if (status === 'success') {
                    // For Buffer tasks: resolve with the data
                    // For Stream tasks: resolve void (completion signal)
                    const result = buffer ? new Uint8Array(buffer) : undefined;
                    taskResolver.resolve(result);
                } else {
                    taskResolver.reject(new Error(error || 'Unknown Worker Error'));
                }
                pendingTasks.delete(id);
            }
        };

        workerInstance.onerror = (err) => {
            console.error("[LZ4] Worker Critical Error:", err);
        };
    }
    return workerInstance;
}

/**
 * Dispatches a Buffer task.
 * @private
 */
function runBufferTask(task, data, options = {}) {
    const worker = getWorker();
    const id = ++messageIdCounter;

    return new Promise((resolve, reject) => {
        pendingTasks.set(id, { resolve, reject });

        let transferBuffer = data.buffer;

        // Optimization: Use SharedArrayBuffer if available/possible
        if (window.crossOriginIsolated) {
            if (data.buffer instanceof SharedArrayBuffer) {
                transferBuffer = data.buffer;
            } else {
                try {
                    const sab = new SharedArrayBuffer(data.byteLength);
                    new Uint8Array(sab).set(data);
                    transferBuffer = sab;
                } catch (e) { /* Fallback */ }
            }
        }

        worker.postMessage({
            id,
            task,
            buffer: transferBuffer,
            options
        });
    });
}

/**
 * Dispatches a Stream task.
 * Transfers the streams to the worker, so they become unusable in the main thread.
 * @private
 */
function runStreamTask(task, readable, writable, options = {}) {
    const worker = getWorker();
    const id = ++messageIdCounter;

    return new Promise((resolve, reject) => {
        pendingTasks.set(id, { resolve, reject });

        // We MUST transfer the streams to the worker
        worker.postMessage({
            id,
            task,
            readable,
            writable,
            options
        }, [readable, writable]); // <--- Transfer ownership
    });
}

export const LZ4Worker = {
    // --- Buffer API (Simple) ---

    /**
     * Compress data (Buffer).
     * @param {Uint8Array} data
     * @param {Object} [options]
     * @returns {Promise<Uint8Array>}
     */
    compress: (data, options) => runBufferTask('compress', data, options),

    /**
     * Decompress data (Buffer).
     * @param {Uint8Array} data
     * @param {Object} [options]
     * @returns {Promise<Uint8Array>}
     */
    decompress: (data, options) => runBufferTask('decompress', data, options),


    // --- Stream API (High Performance) ---

    /**
     * Compress a stream. Pipes readable -> worker -> writable.
     * @param {ReadableStream} readable - Source data.
     * @param {WritableStream} writable - Destination for compressed data.
     * @param {Object} [options]
     * @returns {Promise<void>} Resolves when the stream completes.
     */
    compressStream: (readable, writable, options) => runStreamTask('stream-compress', readable, writable, options),

    /**
     * Decompress a stream. Pipes readable -> worker -> writable.
     * @param {ReadableStream} readable - Source compressed data.
     * @param {WritableStream} writable - Destination for raw data.
     * @param {Object} [options]
     * @returns {Promise<void>} Resolves when the stream completes.
     */
    decompressStream: (readable, writable, options) => runStreamTask('stream-decompress', readable, writable, options)
};