/**
 * @fileoverview Implementation of the Snappy benchmark adapter.
 */

import { BaseLib } from '../shared/baseLib.js';

/**
 * Wrapper for the Node.js `snappy` library (Google's Snappy compression).
 * This wrapper focuses on the synchronous bindings provided by the package to ensure
 * benchmarks measure raw algorithmic performance rather than async overhead.
 *
 * @class NodeSnappy
 * @extends {BaseLib}
 */
export class NodeSnappy extends BaseLib {
    /**
     * Creates an instance of the NodeSnappy adapter.
     */
    constructor() {
        // name: 'snappy' - Semantic name for reports
        // library: 'snappy' - NPM package name
        // environment: 'Node' - Node.js specific (C++ bindings)
        // language: 'C++ (Binding)' - Native implementation
        super('snappy', 'snappy', 'NodeJS', 'C++');

        /** @type {Object|null} The snappy module instance */
        this.snappy = null;
    }

    /**
     * Loads the snappy library.
     * Dynamically imports the 'snappy' package to keep the startup footprint light.
     *
     * @async
     * @override
     * @returns {Promise<void>}
     * @throws {Error} If the 'snappy' package is not installed.
     */
    async load() {
        try {
            // Import the default export from the snappy package
            this.snappy = (await import('snappy')).default;
        } catch (err) {
            throw new Error("Failed to load 'snappy'. Please ensure it is installed via npm.");
        }
    }

    /**
     * Compresses the input data using Snappy (Synchronous).
     *
     * @override
     * @param {Buffer|Uint8Array} input - The raw data to compress.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: Snappy's synchronous binding allocates a new buffer, so this is unused.
     * @returns {Buffer} The compressed data.
     * @throws {Error} If the library is not loaded.
     */
    compress(input, outputBuffer) {
        if (!this.snappy) {
            throw new Error("NodeSnappy is not loaded. Call load() first.");
        }
        // We use compressSync to avoid the overhead of the libuv thread pool
        // and async promise handling during tight benchmark loops.
        return this.snappy.compressSync(input);
    }

    /**
     * Decompresses the input data using Snappy (Synchronous).
     *
     * @override
     * @param {Buffer|Uint8Array} input - The compressed Snappy data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: Snappy's synchronous binding allocates a new buffer, so this is unused.
     * @returns {Buffer} The decompressed data.
     * @throws {Error} If the library is not loaded or data is invalid.
     */
    decompress(input, outputBuffer) {
        if (!this.snappy) {
            throw new Error("NodeSnappy is not loaded. Call load() first.");
        }
        // uncompressSync throws if the input data is invalid
        return this.snappy.uncompressSync(input);
    }
}

export default {NodeSnappy};