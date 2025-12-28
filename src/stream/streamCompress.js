/**
 * @fileoverview Web Streams API wrapper for LZ4 Compression.
 *
 * This module exports a factory function to create a standard `TransformStream`
 * that compresses incoming chunks of binary data into an LZ4 Frame.
 * It is compatible with:
 * - Modern Browsers
 * - Node.js (v18+ or via `stream/web`)
 * - Cloudflare Workers
 * - Deno
 *
 * @module stream/streamCompress
 */

import {LZ4Encoder} from "../shared/lz4Encode.js";

/**
 * Creates a standard TransformStream for LZ4 compression.
 *
 * The resulting stream accepts raw binary chunks (`Uint8Array`) and emits
 * chunks of a valid LZ4 Frame. It manages the entire lifecycle, including
 * the Frame Header, Block Compression, and EndMark/Checksum generation.
 *
 * @param {Object} [options] - Configuration options for the LZ4 Encoder.
 * @param {boolean} [options.blockIndependence=true] - If true, blocks are independent (no dictionary dependency).
 * @param {boolean} [options.contentChecksum=true] - If true, appends an xxHash32 checksum of the original content.
 * @param {number} [options.maxBlockSize=65536] - The maximum size of a single LZ4 block (default 64KB).
 * @returns {TransformStream<Uint8Array, Uint8Array>} A writable/readable stream pair for compression.
 *
 * @example
 * // Browser/Cloudflare Example
 * const response = await fetch('data.txt');
 * const compressedStream = response.body.pipeThrough(createCompressStream());
 *
 * @example
 * // Node.js Pipeline Example
 * import { pipeline } from 'stream/promises';
 * await pipeline(
 * fs.createReadStream('input.txt'),
 * createCompressStream(),
 * fs.createWriteStream('output.lz4')
 * );
 */
export function createCompressStream(options = {}) {
    // Instantiate the stateful encoder
    const encoder = new LZ4Encoder(options);

    return new TransformStream({
        /**
         * Processes a data chunk.
         * @param {Uint8Array} chunk - Raw input data.
         * @param {TransformStreamDefaultController} controller - Stream controller.
         */
        transform(chunk, controller) {
            try {
                // The encoder buffers data and returns complete blocks if enough data has accumulated.
                const frames = encoder.update(chunk);
                for (const frame of frames) {
                    controller.enqueue(frame);
                }
            } catch (e) {
                controller.error(e);
            }
        },

        /**
         * Finalizes the stream.
         * Flushes remaining buffers and writes the EndMark.
         * @param {TransformStreamDefaultController} controller - Stream controller.
         */
        flush(controller) {
            try {
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