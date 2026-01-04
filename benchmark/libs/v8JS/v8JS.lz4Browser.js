/**
 * @fileoverview Implementation of the lz4-browser benchmark adapter.
 */

import { BaseLib } from '../shared/baseLib.js';

/**
 * Wrapper for the `lz4-browser` library.
 * This library is a pure JavaScript implementation of LZ4, originally targeted
 * for browser environments but usable in Node.js via this wrapper.
 * It provides simple synchronous `encode` (compress) and `decode` (decompress) methods.
 *
 * @class V8JSLz4Browser
 * @extends {BaseLib}
 */
export class V8JSLz4Browser extends BaseLib {
    /**
     * Creates an instance of the V8JSLz4Browser adapter.
     */
    constructor() {
        // name: 'lz4-browser' - Semantic name for reports
        // library: 'lz4-browser' - NPM package name
        // environment: 'V8' - Universal JS (Node & Browser)
        // language: 'Javascript' - Pure JS implementation
        super('lz4-browser', 'lz4-browser', 'V8', 'JS');

        /** @type {Function|null} The encode (compress) function */
        this.encodeFn = null;
        /** @type {Function|null} The decode (decompress) function */
        this.decodeFn = null;
    }

    /**
     * Loads the lz4-browser library.
     * Dynamically imports the package to keep initial bundle size/startup fast.
     *
     * @async
     * @override
     * @returns {Promise<void>}
     * @throws {Error} If the 'lz4-browser' package is not installed.
     */
    async load() {
        try {
            const mod = await import('lz4-browser');
            // The library exports 'encode' and 'decode' directly
            this.encodeFn = mod.encode;
            this.decodeFn = mod.decode;
        } catch (err) {
            throw new Error("Failed to load 'lz4-browser'. Please ensure it is installed via npm.");
        }

        if (!this.encodeFn || !this.decodeFn) {
            throw new Error("lz4-browser loaded but missing encode/decode exports.");
        }
    }

    /**
     * Compresses the input data using lz4-browser.
     *
     * @override
     * @param {Uint8Array|Buffer} input - The raw data to compress.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: lz4-browser 'encode' allocates a new Uint8Array, so this is unused.
     * @returns {Uint8Array} The compressed data.
     * @throws {Error} If the library is not loaded.
     */
    compress(input, outputBuffer) {
        if (!this.encodeFn) {
            throw new Error("V8JSLz4Browser is not loaded. Call load() first.");
        }
        return this.encodeFn(input);
    }

    /**
     * Decompresses the input data using lz4-browser.
     *
     * @override
     * @param {Uint8Array|Buffer} input - The compressed LZ4 data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: lz4-browser 'decode' handles output buffer allocation internally, so this is unused.
     * @returns {Uint8Array} The decompressed data.
     * @throws {Error} If the library is not loaded or data is invalid.
     */
    decompress(input, outputBuffer) {
        if (!this.decodeFn) {
            throw new Error("V8JSLz4Browser is not loaded. Call load() first.");
        }
        return this.decodeFn(input);
    }
}

export default V8JSLz4Browser;