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
 * - Transferable Objects (Zero-Copy)
 * - SharedArrayBuffer Support
 */

import { compressBuffer } from '../buffer/bufferCompress.js';
import { decompressBuffer } from '../buffer/bufferDecompress.js';
import { createCompressStream } from '../stream/streamCompress.js';
import { createDecompressStream } from '../stream/streamDecompress.js';

// --- TYPE FIX ---
// We cast 'self' to DedicatedWorkerGlobalScope to fix IDE warnings.
// The IDE defaults to 'Window', which expects postMessage(msg, targetOrigin, transfer).
// Workers expect postMessage(msg, transfer).

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

        // Note: Standard ArrayBuffers are transferred (moved).
        // SharedArrayBuffers are copied (cloned).
        const transferList = (resultBuffer instanceof ArrayBuffer && !(resultBuffer instanceof SharedArrayBuffer))
            ? [resultBuffer]
            : [];

        // Correct Worker Syntax: postMessage(message, transferList)
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