/**
 * @fileoverview Implementation of the Pako benchmark adapter.
 */

import { BaseLib } from '../shared/baseLib.js';

/**
 * Wrapper for the 'pako' library.
 * Pako is a very popular, full-featured port of the zlib library to JavaScript.
 * It is known for its reliability and wide adoption, serving as the benchmark
 * baseline for many other JS compression libraries.
 *
 * This wrapper uses Pako's Deflate/Inflate (zlib format) methods.
 *
 * @class V8JSPako
 * @extends {BaseLib}
 */
export class V8JSPako extends BaseLib {
    /**
     * Creates an instance of the V8JSPako adapter.
     */
    constructor() {
        // name: 'pako' - Semantic name for reports
        // library: 'pako' - NPM package name
        // environment: 'V8' - Universal JS (Node & Browser)
        // language: 'Javascript' - Pure JS implementation
        super('pako', 'pako', 'V8', 'JS');

        /** @type {Function|null} The deflate function */
        this.deflate = null;
        /** @type {Function|null} The inflate function */
        this.inflate = null;
    }

    /**
     * Dynamically imports the 'pako' module.
     * Compatible with Pako v2.x ESM exports.
     *
     * @async
     * @override
     * @returns {Promise<void>} Resolves when the library is loaded.
     */
    async load() {
        try {
            // Pako v2 exports 'deflate' and 'inflate' directly.
            // Pako v1 usually exported a default object.
            // We try named imports first (v2 style).
            const mod = await import('pako');

            if (mod.deflate && mod.inflate) {
                this.deflate = mod.deflate;
                this.inflate = mod.inflate;
            } else if (mod.default && mod.default.deflate) {
                // Fallback for v1 or CJS interop
                this.deflate = mod.default.deflate;
                this.inflate = mod.default.inflate;
            } else {
                throw new Error("Could not find deflate/inflate in pako exports.");
            }
        } catch (err) {
            throw new Error(`Failed to load 'pako'. Please ensure it is installed via npm. ${err.message}`);
        }
    }

    /**
     * Compresses data using Pako (Deflate).
     *
     * @override
     * @param {Uint8Array|Buffer} input - The raw input data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: Pako ignores this and always allocates a new buffer.
     * @returns {Uint8Array} The compressed data.
     */
    compress(input, outputBuffer) {
        if (!this.deflate) throw new Error("Library not loaded");

        // pako.deflate(data, [options]) -> Uint8Array
        // Pako manages its own memory allocation, so outputBuffer is unused here.
        return this.deflate(input);
    }

    /**
     * Decompresses data using Pako (Inflate).
     *
     * @override
     * @param {Uint8Array|Buffer} compressedInput - The compressed data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: Pako ignores this and always allocates a new buffer.
     * @returns {Uint8Array} The decompressed data.
     */
    decompress(compressedInput, outputBuffer) {
        if (!this.inflate) throw new Error("Library not loaded");

        // pako.inflate(data, [options]) -> Uint8Array
        // Pako manages its own memory allocation, so outputBuffer is unused here.
        return this.inflate(compressedInput);
    }
}