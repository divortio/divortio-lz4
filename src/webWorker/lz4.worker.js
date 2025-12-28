/**
 * @fileoverview
 * LZ4 Web Worker (Implementation)
 * ============================================================================
 * The dedicated worker script that runs inside the worker thread.
 * It listens for tasks ('compress' or 'decompress'), executes them using
 * the synchronous buffer methods, and returns the result.
 *
 * OPTIMIZATIONS:
 * 1. Zero-Copy Transfers: Uses 'transferable objects' in postMessage to move
 * memory ownership instantly instead of copying bytes.
 * 2. SharedArrayBuffer Support: Can read directly from shared memory if provided,
 * eliminating the input copy overhead.
 *
 */

import { compressBuffer } from '../buffer/bufferCompress.js';
import { decompressBuffer } from '../buffer/bufferDecompress.js';

/**
 * Global Message Handler
 * Listens for commands from the main thread (workerClient.js).
 *
 * @param {MessageEvent} event - The message event containing the payload.
 * @property {string} event.data.task - 'compress' | 'decompress'
 * @property {number} event.data.id - Unique request ID to match the Promise.
 * @property {ArrayBuffer|SharedArrayBuffer} event.data.buffer - Raw data.
 * @property {number} [event.data.originalSize] - Required for decompression.
 */
self.onmessage = (event) => {
    const { id, task, buffer, originalSize } = event.data;

    try {
        let resultTypedArray;

        // 1. Create a view on the buffer (works for both ArrayBuffer and SAB)
        const inputData = new Uint8Array(buffer);

        // 2. Execute Task
        if (task === 'compress') {
            resultTypedArray = compressBuffer(inputData);
        } else if (task === 'decompress') {
            if (!originalSize && originalSize !== 0) {
                throw new Error('LZ4 Worker: "originalSize" is required for decompression.');
            }
            resultTypedArray = decompressBuffer(inputData, originalSize);
        } else {
            throw new Error(`LZ4 Worker: Unknown task "${task}"`);
        }

        // 3. Send Result
        // We use the second argument of postMessage (transferList) to
        // ZERO-COPY move the result buffer back to the main thread.
        const resultBuffer = resultTypedArray.buffer;

        self.postMessage({
            id,
            status: 'success',
            buffer: resultBuffer
        }, [resultBuffer]); // <--- Transfer ownership

    } catch (error) {
        // Send error details back to reject the Promise
        self.postMessage({
            id,
            status: 'error',
            error: error.message || 'Unknown Worker Error'
        });
    }
};