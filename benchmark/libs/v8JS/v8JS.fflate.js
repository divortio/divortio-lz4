/**
 * @fileoverview Implementation of the fflate benchmark adapter.
 */

import { BaseLib } from '../shared/baseLib.js';

/**
 * Wrapper for the 'fflate' library.
 * fflate is a high-performance, zero-dependency compression library for JavaScript.
 * It is often used as a modern, faster, and lighter alternative to 'pako' (zlib port).
 *
 * This wrapper uses fflate's Gzip implementation by default as it is the most
 * common standard for comparison against other web-focused libraries.
 *
 * @class V8JSFflate
 * @extends {BaseLib}
 */
export class V8JSFflate extends BaseLib {
    /**
     * Creates an instance of the V8JSFflate adapter.
     */
    constructor() {
        // name: 'fflate' - Semantic name for reports
        // library: 'fflate' - NPM package name
        // environment: 'V8' - Universal JS (Node & Browser)
        // language: 'Javascript' - Pure JS implementation
        super('fflate', 'fflate', 'V8', 'Javascript');

        /** @type {Function|null} The gzip function */
        this.gzipSync = null;
        /** @type {Function|null} The gunzip function */
        this.gunzipSync = null;
    }

    /**
     * Dynamically imports the 'fflate' module.
     *
     * @async
     * @override
     * @returns {Promise<void>} Resolves when the library is loaded.
     */
    async load() {
        try {
            // fflate exports many small functions for tree-shaking.
            // We import the synchronous gzip/gunzip variants.
            const mod = await import('fflate');
            this.gzipSync = mod.gzipSync;
            this.gunzipSync = mod.gunzipSync;
        } catch (err) {
            throw new Error(`Failed to load 'fflate'. Please ensure it is installed via npm. ${err.message}`);
        }
    }

    /**
     * Compresses data using fflate (Gzip).
     *
     * @override
     * @param {Uint8Array|Buffer} input - The raw input data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: fflate allocates a new buffer in its high-level API, so this is unused.
     * @returns {Uint8Array} The compressed data.
     */
    compress(input, outputBuffer) {
        if (!this.gzipSync) throw new Error("Library not loaded");
        // gzipSync(data, opts) -> Uint8Array
        // We use default options (level 6 usually)
        return this.gzipSync(input);
    }

    /**
     * Decompresses data using fflate (Gunzip).
     *
     * @override
     * @param {Uint8Array|Buffer} compressedInput - The compressed data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: fflate allocates a new buffer in its high-level API, so this is unused.
     * @returns {Uint8Array} The decompressed data.
     */
    decompress(compressedInput, outputBuffer) {
        if (!this.gunzipSync) throw new Error("Library not loaded");
        // gunzipSync(data) -> Uint8Array
        return this.gunzipSync(compressedInput);
    }
}