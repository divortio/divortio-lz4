/**
 * @fileoverview Implementation of the Node.js Zlib (Brotli) benchmark adapter.
 */

import { BaseLib } from '../shared/baseLib.js';
import zlib from 'node:zlib';

/**
 * Wrapper for the Node.js native Brotli implementation.
 * Brotli is a modern compression algorithm (by Google) optimized for the web.
 * It generally offers better compression ratios than Gzip but can be slower
 * at high compression levels.
 *
 * @class NodeZlibBrotli
 * @extends {BaseLib}
 */
export class NodeZlibBrotli extends BaseLib {
    constructor() {
        super('node-brotli', 'node:zlib', 'NodeJS', 'C++');
    }

    async load() {
        if (!zlib.brotliCompressSync || !zlib.brotliDecompressSync) {
            throw new Error("Node.js zlib module missing Brotli support (Node v10.16+ required).");
        }
    }

    /**
     * Compresses data using Node.js Brotli.
     *
     * @override
     * @param {Uint8Array|Buffer} input - The raw input data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: Node.js zlib allocates a new buffer, so this is unused.
     * @returns {Uint8Array|Buffer} The compressed data.
     */
    compress(input, outputBuffer) {
        // We use default quality settings (usually quality 11 in Node)
        return zlib.brotliCompressSync(input);
    }

    /**
     * Decompresses data using Node.js Brotli.
     *
     * @override
     * @param {Uint8Array|Buffer} compressedInput - The compressed data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: Node.js zlib allocates a new buffer, so this is unused.
     * @returns {Uint8Array|Buffer} The decompressed data.
     */
    decompress(compressedInput, outputBuffer) {
        return zlib.brotliDecompressSync(compressedInput);
    }
}