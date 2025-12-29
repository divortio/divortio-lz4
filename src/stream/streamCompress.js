/**
 * @fileoverview Web Streams API wrapper for LZ4 Compression.
 * Optimized defaults for V8.
 *
 * @module stream/streamCompress
 */

import { LZ4Encoder } from "../shared/lz4Encode.js";

/**
 * Creates a standard TransformStream for LZ4 compression.
 *
 * @param {Uint8Array|null} [dictionary=null]
 * @param {number} [maxBlockSize=65536]
 * @param {boolean} [blockIndependence=false]
 * @param {boolean} [contentChecksum=false]
 * @returns {TransformStream<Uint8Array, Uint8Array>}
 */
export function createCompressStream(dictionary = null, maxBlockSize = 65536, blockIndependence = false, contentChecksum = false) {
    // Pass flat args to the Class Constructor
    const encoder = new LZ4Encoder(dictionary, maxBlockSize, blockIndependence, contentChecksum);

    return new TransformStream({
        /**
         * @param {Uint8Array} chunk
         * @param {TransformStreamDefaultController} controller
         */
        transform(chunk, controller) {
            try {
                const frames = encoder.update(chunk);
                for (const frame of frames) controller.enqueue(frame);
            } catch (e) {
                controller.error(e);
            }
        },
        /**
         * @param {TransformStreamDefaultController} controller
         */
        flush(controller) {
            try {
                const frames = encoder.finish();
                for (const frame of frames) controller.enqueue(frame);
            } catch (e) {
                controller.error(e);
            }
        }
    });
}
