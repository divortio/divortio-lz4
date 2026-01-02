/**
 * @fileoverview Implementation of the LZ4 Wasm (Node.js) benchmark adapter.
 * Adapts the 'lz4-wasm-nodejs' library to the standard BaseLib interface.
 */

import { BaseLib } from '../shared/baseLib.js';

/**
 * Wrapper for the 'lz4-wasm-nodejs' library.
 * This is a WebAssembly implementation of LZ4 specifically packaged for Node.js.
 * It usually offers better performance than pure JS implementations by running
 * the compression logic in WASM.
 *
 * @class NodeLz4Wasm
 * @extends {BaseLib}
 */
export class NodeLz4Wasm extends BaseLib {
    /**
     * Creates an instance of the NodeLz4Wasm adapter.
     */
    constructor() {
        // name: 'lz4-wasm-node' - Semantic name for reports
        // library: 'lz4-wasm-nodejs' - NPM package name
        // environment: 'Node' - Server-side environment
        // language: 'WASM' - WebAssembly implementation
        super('lz4-wasm-node', 'lz4-wasm-nodejs', 'NodeJS', 'WASM');

        /** @type {Function|null} The wasm compress function */
        this.compressFn = null;
        /** @type {Function|null} The wasm decompress function */
        this.decompressFn = null;
    }

    /**
     * Dynamically imports the 'lz4-wasm-nodejs' module.
     *
     * @async
     * @override
     * @returns {Promise<void>} Resolves when the library is loaded.
     */
    async load() {
        try {
            const mod = await import('lz4-wasm-nodejs');
            this.compressFn = mod.compress;
            this.decompressFn = mod.decompress;
        } catch (err) {
            throw new Error(`Failed to load 'lz4-wasm-nodejs'. Please ensure it is installed. ${err.message}`);
        }
    }

    /**
     * Compresses data using lz4-wasm-nodejs.
     *
     * @override
     * @param {Uint8Array|Buffer} input - The raw input data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer (unused by this lib).
     * @returns {Uint8Array|Buffer} The compressed data (newly allocated).
     */
    compress(input, outputBuffer) {
        if (!this.compressFn) throw new Error("Library not loaded");
        // lz4-wasm-nodejs returns a new Buffer/Uint8Array
        return this.compressFn(input);
    }

    /**
     * Decompresses data using lz4-wasm-nodejs.
     *
     * @override
     * @param {Uint8Array|Buffer} compressedInput - The compressed data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer (unused by this lib).
     * @returns {Uint8Array|Buffer} The decompressed data.
     */
    decompress(compressedInput, outputBuffer) {
        if (!this.decompressFn) throw new Error("Library not loaded");
        return this.decompressFn(compressedInput);
    }
}