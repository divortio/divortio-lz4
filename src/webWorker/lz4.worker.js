/**
 * @fileoverview
 * LZ4 Web Worker (Implementation)
 * ============================================================================
 * The dedicated worker script that runs inside the worker thread.
 *
 * CAPABILITIES:
 * 1. Buffer Mode: Sync compression for complete arrays (Low overhead).
 * 2. Stream Mode: Async piping for Readable/Writable streams (Low memory).
 *
 * OPTIMIZATIONS:
 * - Transferable Objects (Zero-Copy Return)
 * - SharedArrayBuffer Support (Zero-Copy Input)
 */

import { compressBuffer } from '../buffer/bufferCompress.js';
import { decompressBuffer } from '../buffer/bufferDecompress.js';
import { createCompressStream } from '../stream/streamCompress.js';
import { createDecompressStream } from '../stream/streamDecompress.js';

// --- TYPE FIX ---
// Cast 'self' to DedicatedWorkerGlobalScope to enable transfer list TS checks.
/** @type {DedicatedWorkerGlobalScope} */
// @ts-ignore
const workerSelf = self;

/**
 * Global Message Handler
 */
workerSelf.onmessage = async (event) => {
    const { id, task, buffer, readable, writable, options } = event.data;

    try {
        // --- 1. STREAM MODE ---
        // Streams are transferred, so we process them directly.
        if (task === 'stream-compress') {
            const { dictionary, maxBlockSize, blockIndependence, contentChecksum } = options || {};

            const transformStream = createCompressStream(
                dictionary,
                maxBlockSize,
                blockIndependence,
                contentChecksum
            );

            await readable
                .pipeThrough(transformStream)
                .pipeTo(writable);

            workerSelf.postMessage({ id, status: 'success' });
            return;
        }

        if (task === 'stream-decompress') {
            const { dictionary, verifyChecksum } = options || {};

            const transformStream = createDecompressStream(
                dictionary,
                verifyChecksum
            );

            await readable
                .pipeThrough(transformStream)
                .pipeTo(writable);

            workerSelf.postMessage({ id, status: 'success' });
            return;
        }

        // --- 2. BUFFER MODE ---
        // 'buffer' is either an ArrayBuffer (cloned) or SharedArrayBuffer (shared).
        const inputData = new Uint8Array(buffer);
        let resultTypedArray;

        if (task === 'compress') {
            const { dictionary, maxBlockSize, blockIndependence, contentChecksum } = options || {};
            resultTypedArray = compressBuffer(inputData, dictionary, maxBlockSize, blockIndependence, contentChecksum);
        }
        else if (task === 'decompress') {
            const { dictionary, verifyChecksum } = options || {};
            resultTypedArray = decompressBuffer(inputData, dictionary, verifyChecksum);
        }
        else {
            throw new Error(`LZ4 Worker: Unknown task "${task}"`);
        }

        const resultBuffer = resultTypedArray.buffer;

        // Optimization: Zero-Copy Return
        // We transfer the result buffer back to the main thread.
        // Note: SharedArrayBuffers cannot be transferred.
        const transferList = (resultBuffer instanceof ArrayBuffer && !(resultBuffer instanceof SharedArrayBuffer))
            ? [resultBuffer]
            : [];

        workerSelf.postMessage({
            id,
            status: 'success',
            buffer: resultBuffer
        }, transferList);

    } catch (error) {
        console.error("LZ4 Worker Error:", error);
        workerSelf.postMessage({
            id,
            status: 'error',
            error: error.message || 'Unknown Worker Error'
        });
    }
};