/**
 * @fileoverview Implementation of the Node.js Zlib (Gzip) benchmark adapter.
 */

import { BaseLib } from '../shared/baseLib.js';
import zlib from 'node:zlib';

/**
 * Wrapper for the Node.js native Gzip implementation.
 * Gzip is the standard compression for the web (HTTP), offering a good balance
 * of ratio and speed, though generally slower than LZ4/Snappy.
 *
 * @class NodeZlibGzip
 * @extends {BaseLib}
 */
export class NodeZlibGzip extends BaseLib {
    constructor() {
        super('node-gzip', 'node:zlib', 'NodeJS', 'C++');
    }

    async load() {
        // node:zlib is built-in, no loading required.
        // We verify the sync methods exist just in case.
        if (!zlib.gzipSync || !zlib.gunzipSync) {
            throw new Error("Node.js zlib module missing sync methods.");
        }
    }

    /**
     * Compresses data using Node.js Gzip.
     *
     * @override
     * @param {Uint8Array|Buffer} input - The raw input data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: Node.js zlib allocates a new buffer, so this is unused.
     * @returns {Uint8Array|Buffer} The compressed data.
     */
    compress(input, outputBuffer) {
        // gzipSync(buffer, [options])
        return zlib.gzipSync(input);
    }

    /**
     * Decompresses data using Node.js Gunzip.
     *
     * @override
     * @param {Uint8Array|Buffer} compressedInput - The compressed data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: Node.js zlib allocates a new buffer, so this is unused.
     * @returns {Uint8Array|Buffer} The decompressed data.
     */
    decompress(compressedInput, outputBuffer) {
        // gunzipSync(buffer, [options])
        return zlib.gunzipSync(compressedInput);
    }
}