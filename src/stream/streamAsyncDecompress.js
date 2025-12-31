/**
 * src/stream/streamAsyncDecompress.js
 * * Async LZ4 Decompression (Web Streams & Promises).
 * * This module provides asynchronous decompression capabilities to prevent blocking
 * the main thread (UI freeze/Server lag).
 * * Features:
 * - **Stream Factory**: `createAsyncDecompressStream` for piping data.
 * - **Promise Helper**: `decompressAsync` for one-shot buffer decompression.
 * @module streamAsyncDecompress
 */

import { LZ4Decoder } from '../shared/lz4Decode.js';
import { ensureBuffer } from '../shared/lz4Util.js';
import { TaskScheduler } from './scheduler.js';

/**
 * Creates an Asynchronous Decompression Stream.
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary.
 * @param {boolean} [verifyChecksum=true] - If true, validates content checksums.
 * @param {number} [concurrency=1] - Task limit (effectively yields event loop).
 * @returns {TransformStream} A Web Standard TransformStream.
 */
export function createAsyncDecompressStream(dictionary = null, verifyChecksum = true, concurrency = 1) {
    const decoder = new LZ4Decoder(dictionary, verifyChecksum);
    const scheduler = new TaskScheduler(concurrency);

    return new TransformStream({
        async transform(chunk, controller) {
            try {
                await scheduler.schedule(async () => {
                    const data = ensureBuffer(chunk);
                    const outputChunks = decoder.update(data);
                    for (const c of outputChunks) {
                        controller.enqueue(c);
                    }
                });
            } catch (e) {
                controller.error(e);
            }
        },
        flush(controller) {
            // LZ4 frames self-terminate
        }
    });
}

/**
 * Decompresses a buffer asynchronously (Promises).
 * * This is a "batteries-included" helper that manages the stream lifecycle for you.
 * It yields the event loop during processing to keep the application responsive.
 * @param {Uint8Array|ArrayBuffer|Buffer} input - Compressed input.
 * @param {Uint8Array} [dictionary=null] - Optional dictionary.
 * @param {boolean} [verifyChecksum=true] - Validate checksums.
 * @param {number} [concurrency=1] - Task/Yield limit.
 * @returns {Promise<Uint8Array>} The decompressed data.
 */
export async function decompressAsync(input, dictionary = null, verifyChecksum = true, concurrency = 1) {
    const stream = createAsyncDecompressStream(dictionary, verifyChecksum, concurrency);
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    const chunks = [];

    // Feed input
    writer.write(input);
    writer.close();

    // Read output
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }

    // Merge chunks
    if (chunks.length === 1) return chunks[0];
    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
        result.set(c, offset);
        offset += c.length;
    }
    return result;
}