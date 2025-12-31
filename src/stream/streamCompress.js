/**
 * src/stream/streamCompress.js
 * * LZ4 Compression Stream (Web Streams API).
 * * This module provides a standard `TransformStream` for compressing data using LZ4.
 * * It allows for streaming compression in environments supporting the Web Streams API
 * (Browsers, Node.js 18+, Deno, Cloudflare Workers).
 * @module streamCompress
 */

import { LZ4Encoder } from "../shared/lz4Encode.js";
import { ensureBuffer } from "../shared/lz4Util.js";

/**
 * Creates a standard TransformStream for LZ4 compression.
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary for compression (warmup).
 * @param {number} [maxBlockSize=4194304] - Target block size in bytes (default 4MB).
 * @param {boolean} [blockIndependence=false] - If false, allows matches across blocks (better compression, slower seeking).
 * @param {boolean} [contentChecksum=false] - If true, appends XXHash32 checksum at the end of the stream.
 * @returns {TransformStream} A web standard TransformStream that accepts Uint8Array chunks and emits compressed LZ4 frames.
 */
export function createCompressStream(dictionary = null, maxBlockSize = 4194304, blockIndependence = false, contentChecksum = false) {
    // Initialize Encoder
    // Note: Arguments must be reordered to match LZ4Encoder's signature:
    // constructor(maxBlockSize, blockIndependence, contentChecksum, dictionary)
    const encoder = new LZ4Encoder(maxBlockSize, blockIndependence, contentChecksum, dictionary);

    return new TransformStream({
        /**
         * Transforms input chunks into compressed blocks.
         * @param {Uint8Array} chunk - Input data chunk.
         * @param {TransformStreamDefaultController} controller - Stream controller.
         */
        transform(chunk, controller) {
            try {
                // Compatibility check (ensure input is always a buffer)
                const data = ensureBuffer(chunk);

                // Process chunk
                // 'add' returns an array of compressed blocks (Uint8Array[])
                const frames = encoder.add(data);

                for (const frame of frames) {
                    controller.enqueue(frame);
                }
            } catch (e) {
                controller.error(e);
            }
        },

        /**
         * Flushes any remaining data when the stream ends.
         * @param {TransformStreamDefaultController} controller - Stream controller.
         */
        flush(controller) {
            try {
                // Finish stream (flush buffer + write EndMark + Checksum)
                const frames = encoder.finish();
                for (const frame of frames) {
                    controller.enqueue(frame);
                }
            } catch (e) {
                controller.error(e);
            }
        }
    });
}