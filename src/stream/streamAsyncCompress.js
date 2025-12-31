/**
 * src/stream/streamAsyncCompress.js
 * * Async LZ4 Compression (Web Streams & Promises).
 * * This module provides a non-blocking compression stream using a task scheduler.
 * It is useful for compressing large files in browser main threads or busy Node.js
 * processes without blocking the event loop.
 * @module streamAsyncCompress
 */

import { LZ4Encoder } from "../shared/lz4Encode.js";
import { ensureBuffer } from "../shared/lz4Util.js";
import { TaskScheduler } from "./scheduler.js";

/**
 * Creates an Asynchronous Compression Stream.
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary for compression (warmup).
 * @param {number} [maxBlockSize=4194304] - Target block size in bytes (default 4MB).
 * @param {boolean} [blockIndependence=false] - If false, allows matches across blocks (better compression).
 * @param {boolean} [contentChecksum=false] - If true, appends XXHash32 checksum at the end.
 * @param {number} [concurrency=1] - Task limit (acts as a yield mechanism to prevent blocking).
 * @returns {TransformStream} A Web Standard TransformStream.
 */
export function createAsyncCompressStream(dictionary = null, maxBlockSize = 4194304, blockIndependence = false, contentChecksum = false, concurrency = 1) {
    // Note: Concurrency should generally be 1 for stateful LZ4 consistency
    const scheduler = new TaskScheduler(concurrency);

    // Instantiate Encoder (Positional Arguments: Size, Indep, Checksum, Dict)
    const encoder = new LZ4Encoder(maxBlockSize, blockIndependence, contentChecksum, dictionary);

    return new TransformStream({
        async transform(chunk, controller) {
            try {
                await scheduler.schedule(async () => {
                    const data = ensureBuffer(chunk);
                    const frames = encoder.add(data);
                    for (const frame of frames) {
                        controller.enqueue(frame);
                    }
                });
            } catch (e) {
                controller.error(e);
            }
        },
        async flush(controller) {
            try {
                await scheduler.schedule(async () => {
                    const frames = encoder.finish();
                    for (const frame of frames) {
                        controller.enqueue(frame);
                    }
                });
            } catch (e) {
                controller.error(e);
            }
        }
    });
}

/**
 * Compresses a buffer asynchronously (Promises).
 * * "Batteries-included" helper for non-blocking compression.
 * @param {Uint8Array|ArrayBuffer|Buffer} input - Input data.
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary.
 * @param {number} [maxBlockSize=4194304] - Block size (default 4MB).
 * @param {boolean} [blockIndependence=false] - Independent blocks.
 * @param {boolean} [contentChecksum=false] - Content checksum.
 * @param {number} [concurrency=1] - Task/Yield limit.
 * @returns {Promise<Uint8Array>} Compressed data.
 */
export async function compressAsync(input, dictionary = null, maxBlockSize = 4194304, blockIndependence = false, contentChecksum = false, concurrency = 1) {
    const stream = createAsyncCompressStream(dictionary, maxBlockSize, blockIndependence, contentChecksum, concurrency);
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    const chunks = [];

    // Write & Close
    writer.write(input);
    writer.close();

    // Read Output
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }

    // Merge
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