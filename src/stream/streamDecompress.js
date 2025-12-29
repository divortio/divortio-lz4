/**
 * @fileoverview Web Streams API wrapper for LZ4 Decompression.
 * Supports Dictionary/Window injection.
 *
 * @module stream/streamDecompress
 */

import { LZ4Decoder } from '../shared/lz4Decode.js';

/**
 * Creates a standard TransformStream for LZ4 decompression.
 *
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary (history window).
 * @param {boolean} [verifyChecksum=true] - If false, skips content checksum verification (faster).
 * @returns {TransformStream<Uint8Array, Uint8Array>}
 */
export function createDecompressStream(dictionary = null, verifyChecksum = true) {
    const decoder = new LZ4Decoder(dictionary, verifyChecksum);

    return new TransformStream({
        /**
         * @param {Uint8Array} chunk
         * @param {TransformStreamDefaultController} controller
         */
        transform(chunk, controller) {
            try {
                const chunks = decoder.update(chunk);
                for (const c of chunks) {
                    controller.enqueue(c);
                }
            } catch (e) {
                controller.error(e);
            }
        }
    });
}