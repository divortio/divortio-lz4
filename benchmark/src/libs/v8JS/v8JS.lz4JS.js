/**
 * @fileoverview Implementation of the LZ4JS benchmark adapter.
 * Adapts the 'lz4js' library (a pure JavaScript port of LZ4) to the standard BaseLib interface.
 */

import { BaseLib } from '../shared/baseLib.js';

/**
 * Wrapper for the 'lz4js' library.
 * This is a pure JavaScript implementation of LZ4, often considered the "legacy" standard
 * for JS-based LZ4 compression before newer, more optimized variants appeared.
 *
 * @class V8JSLz4JS
 * @extends {BaseLib}
 */
export class V8JSLz4JS extends BaseLib {
    /**
     * Creates an instance of the V8JSLz4JS adapter.
     * Sets up the metadata for the benchmark runner.
     */
    constructor() {
        // name: 'lz4js' - Semantic name used in reports (often labeled "Legacy")
        // library: 'lz4js' - Actual NPM package name
        // environment: 'V8' - Universal JS (Node.js & Browser)
        // language: 'Javascript' - Pure JS implementation
        super('lz4js', 'lz4js', 'V8', 'JS');
    }

    /**
     * Dynamically imports the 'lz4js' module.
     *
     * @async
     * @override
     * @returns {Promise<void>} Resolves when the library is loaded.
     */
    async load() {
        // The lz4js package typically exposes itself via a default export
        this.lib = (await import('lz4js')).default;
    }

    /**
     * Compresses data using lz4js.
     *
     * @override
     * @param {Uint8Array|Buffer} input - The raw input data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: lz4js creates its own output buffer and does not support
     * writing to a pre-allocated buffer in its high-level API.
     * @returns {Uint8Array|Buffer} The compressed data.
     */
    compress(input, outputBuffer) {
        // lz4js.compress() accepts Node Buffers or arrays and returns a new Buffer/Array
        return this.lib.compress(input);
    }

    /**
     * Decompresses data using lz4js.
     *
     * @override
     * @param {Uint8Array|Buffer} compressedInput - The compressed data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: lz4js allocates a new buffer for the result.
     * @returns {Uint8Array|Buffer} The decompressed data.
     */
    decompress(compressedInput, outputBuffer) {
        return this.lib.decompress(compressedInput);
    }
}