/**
 * @fileoverview Web Streams API wrapper for LZ4 Decompression.
 *
 * This module exports a factory function to create a standard `TransformStream`
 * that accepts chunks of an LZ4 Frame and emits decompressed raw data.
 * It is compatible with:
 * - Modern Browsers
 * - Node.js (v18+ or via `stream/web`)
 * - Cloudflare Workers
 * - Deno
 *
 * @module stream/streamDecompress
 */

import {LZ4Decoder} from '../shared/lz4Decode.js';

/**
 * Creates a standard TransformStream for LZ4 decompression.
 *
 * The resulting stream maintains an internal state machine (via `LZ4Decoder`) to
 * handle fragmented frames, multi-byte headers split across chunks, and
 * block boundaries. It emits `Uint8Array` chunks of the original uncompressed data.
 *
 * @param {Object} [options] - Configuration options for the decoder.
 * @param {number} [options.maxBlockSize=65536] - Hint for initial buffer allocation (optional).
 * @returns {TransformStream<Uint8Array, Uint8Array>} A writable/readable stream pair for decompression.
 *
 * @example
 * // Browser/Cloudflare Example: Decompressing a network resource
 * const response = await fetch('data.lz4');
 * const decompressedStream = response.body.pipeThrough(createDecompressStream());
 *
 * @example
 * // Node.js Pipeline Example
 * import { pipeline } from 'stream/promises';
 * import { createReadStream, createWriteStream } from 'fs';
 *
 * await pipeline(
 * createReadStream('archive.lz4'),
 * createDecompressStream(),
 * createWriteStream('output.txt')
 * );
 */
export function createDecompressStream(options = {}) {
    const decoder = new LZ4Decoder(options);

    return new TransformStream({
        /**
         * Processes a compressed data chunk.
         * @param {Uint8Array} chunk - Incoming binary data (part of an LZ4 frame).
         * @param {TransformStreamDefaultController} controller - Stream controller.
         */
        transform(chunk, controller) {
            try {
                // The decoder manages internal buffering and returns any blocks
                // that were completed by this new chunk.
                const chunks = decoder.update(chunk);
                for (const c of chunks) {
                    controller.enqueue(c);
                }
            } catch (e) {
                // Propagate corruption/checksum errors to the stream consumer
                controller.error(e);
            }
        }
    });
}