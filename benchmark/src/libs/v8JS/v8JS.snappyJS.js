/**
 * @fileoverview Implementation of the SnappyJS benchmark adapter.
 * Adapts the pure JavaScript 'snappyjs' library to the standard BaseLib interface.
 */

import { BaseLib } from '../shared/baseLib.js';

/**
 * Wrapper for the 'snappyjs' library.
 * This library is a pure JavaScript implementation of the Snappy compression algorithm,
 * porting Google's reference implementation.
 *
 * @class V8JSSnappyJS
 * @extends {BaseLib}
 */
export class V8JSSnappyJS extends BaseLib {
    /**
     * Creates an instance of the V8JSSnappyJS adapter.
     * Sets up the metadata for the benchmark runner.
     */
    constructor() {
        // name: 'snappyjs' - Semantic name used in reports
        // library: 'snappyjs' - Actual NPM package name
        // environment: 'V8' - Universal JS (Node.js & Browser)
        // language: 'Javascript' - Pure JS implementation
        super('snappyjs', 'snappyjs', 'V8', 'JS');
    }

    /**
     * Dynamically imports the 'snappyjs' module.
     * Stores the default export for use in compression/decompression.
     *
     * @async
     * @override
     * @returns {Promise<void>} Resolves when the library is loaded.
     */
    async load() {
        this.lib = (await import('snappyjs')).default;
    }

    /**
     * Compresses data using SnappyJS.
     *
     * @override
     * @param {Uint8Array|Buffer} input - The raw input data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer (ignored by SnappyJS as it allocates its own).
     * @returns {ArrayBuffer} The compressed data as an ArrayBuffer.
     */
    compress(input, outputBuffer) {
        // SnappyJS requires ArrayBuffer. It cannot handle Node Buffers or generic TypedArrays directly
        // if they are views into a larger buffer (common in our benchmark runner).
        const ab = this._ensureArrayBuffer(input);
        return this.lib.compress(ab);
    }

    /**
     * Decompresses data using SnappyJS.
     *
     * @override
     * @param {Uint8Array|Buffer} compressedInput - The compressed data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer (ignored by SnappyJS).
     * @returns {ArrayBuffer} The decompressed data as an ArrayBuffer.
     */
    decompress(compressedInput, outputBuffer) {
        const ab = this._ensureArrayBuffer(compressedInput);
        return this.lib.uncompress(ab);
    }

    /**
     * Helper to ensure the input data is a valid ArrayBuffer suitable for SnappyJS.
     * SnappyJS often fails if passed a Buffer view (subarray) directly because it reads
     * from the start of the underlying buffer, ignoring byteOffset.
     *
     * @private
     * @param {Uint8Array|Buffer} data - The input data view or buffer.
     * @returns {ArrayBuffer} An ArrayBuffer containing exactly the data to process.
     */
    _ensureArrayBuffer(data) {
        // If it's already a clean ArrayBuffer starting at 0 and matching length, use it.
        if (data.buffer && data.byteLength === data.buffer.byteLength && data.byteOffset === 0) {
            return data.buffer;
        }
        // Otherwise, create a sliced copy to ensure 0-offset and correct length.
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
}