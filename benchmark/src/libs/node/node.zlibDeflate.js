/**
 * @fileoverview Implementation of the Node.js Zlib (Deflate) benchmark adapter.
 */

import { BaseLib } from '../shared/baseLib.js';
import zlib from 'node:zlib';

/**
 * Wrapper for the Node.js native Deflate implementation.
 * Deflate is the underlying algorithm for Gzip and Zip. It provides raw
 * DEFLATE streams (zlib format), usually slightly smaller than Gzip
 * because it lacks the Gzip header/footer.
 *
 * @class NodeZlibDeflate
 * @extends {BaseLib}
 */
export class NodeZlibDeflate extends BaseLib {
    constructor() {
        super('node-deflate', 'node:zlib', 'NodeJS', 'C++');
    }

    async load() {
        if (!zlib.deflateSync || !zlib.inflateSync) {
            throw new Error("Node.js zlib module missing sync methods.");
        }
    }

    /**
     * Compresses data using Node.js Deflate.
     *
     * @override
     * @param {Uint8Array|Buffer} input - The raw input data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: Node.js zlib allocates a new buffer, so this is unused.
     * @returns {Uint8Array|Buffer} The compressed data.
     */
    compress(input, outputBuffer) {
        return zlib.deflateSync(input);
    }

    /**
     * Decompresses data using Node.js Inflate.
     *
     * @override
     * @param {Uint8Array|Buffer} compressedInput - The compressed data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: Node.js zlib allocates a new buffer, so this is unused.
     * @returns {Uint8Array|Buffer} The decompressed data.
     */
    decompress(compressedInput, outputBuffer) {
        return zlib.inflateSync(compressedInput);
    }
}