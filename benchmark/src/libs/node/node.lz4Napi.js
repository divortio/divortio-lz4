/**
 * @fileoverview Implementation of the lz4-napi benchmark adapter.
 * Adapts the 'lz4-napi' library (a Node.js N-API binding powered by Rust) to the standard BaseLib interface.
 */

import { BaseLib } from '../shared/baseLib.js';

/**
 * Wrapper for the 'lz4-napi' library.
 * This is a high-performance Node.js binding that uses N-API (Node-API) to interface
 * with a native LZ4 implementation. It is backed by Rust (via napi-rs and lz4-flex),
 * providing native performance with memory safety.
 *
 * @class NodeLz4Napi
 * @extends {BaseLib}
 */
export class NodeLz4Napi extends BaseLib {
    /**
     * Creates an instance of the NodeLz4Napi adapter.
     * Sets up the metadata for the benchmark runner.
     */
    constructor() {
        // name: 'lz4-napi' - Semantic name used in reports
        // library: 'lz4-napi' - Actual NPM package name
        // environment: 'NodeJS' - Runs in Node.js (Native Addon)
        // language: 'Rust' - Implemented in Rust using N-API
        super('lz4-napi', 'lz4-napi', 'NodeJS', 'Rust');
    }

    /**
     * Dynamically imports the 'lz4-napi' module.
     *
     * @async
     * @override
     * @returns {Promise<void>} Resolves when the library is loaded.
     */
    async load() {
        // lz4-napi exports the module as the default export
        this.lib = (await import('lz4-napi')).default;
    }

    /**
     * Compresses data using lz4-napi.
     *
     * @override
     * @param {Uint8Array|Buffer} input - The raw input data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: lz4-napi's synchronous API allocates a new Buffer for the result
     * and does not support writing to a pre-allocated output buffer.
     * @returns {Buffer} The compressed data as a Node Buffer.
     */
    compress(input, outputBuffer) {
        return this.lib.compressSync(input);
    }

    /**
     * Decompresses data using lz4-napi.
     *
     * @override
     * @param {Uint8Array|Buffer} compressedInput - The compressed data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer (ignored).
     * @returns {Buffer} The decompressed data as a Node Buffer.
     */
    decompress(compressedInput, outputBuffer) {
        return this.lib.uncompressSync(compressedInput);
    }
}