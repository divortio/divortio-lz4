/**
 * src/stream/streamDecompress.js
 * * LZ4 Decompression Stream (Web Streams API).
 * * This module provides a standard `TransformStream` for decompressing LZ4 streams.
 * * It integrates with the `LZ4Decoder` state machine to handle split frames,
 * multi-chunk blocks, and rolling history windows transparently.
 * @module streamDecompress
 */

import { LZ4Decoder } from '../shared/lz4Decode.js';
import { ensureBuffer } from '../shared/lz4Util.js';

/**
 * Creates a standard TransformStream for LZ4 decompression.
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary (history window)
 * if the stream was compressed with a preset dictionary.
 * @param {boolean} [verifyChecksum=true] - If true, validates the xxHash32 content checksum
 * at the end of the frame (if present). Set to false for a slight speed boost if data integrity
 * is already guaranteed by another layer.
 * @returns {TransformStream} A web standard TransformStream that accepts compressed `Uint8Array` chunks
 * and emits decompressed `Uint8Array` chunks.
 */
export function createDecompressStream(dictionary = null, verifyChecksum = true) {
    const decoder = new LZ4Decoder(dictionary, verifyChecksum);

    return new TransformStream({
        /**
         * Transforms compressed input chunks into decompressed data.
         * @param {Uint8Array} chunk - Input compressed chunk.
         * @param {TransformStreamDefaultController} controller - Stream controller.
         */
        transform(chunk, controller) {
            try {
                // Compatibility check (ensure input is always a buffer)
                const data = ensureBuffer(chunk);

                // The decoder manages state; we just feed it bytes.
                // It returns an array of fully decompressed blocks (if any completed).
                const chunks = decoder.update(data);

                for (const c of chunks) {
                    controller.enqueue(c);
                }
            } catch (e) {
                controller.error(e);
            }
        },

        /**
         * Called when the stream closes.
         * For decompression, we don't need to write a footer, but we could check for
         * incomplete frames here if strict validation was required.
         * @param {TransformStreamDefaultController} controller - Stream controller.
         */
        flush(controller) {
            // No-op for LZ4 decompression (frames are self-terminating)
        }
    });
}