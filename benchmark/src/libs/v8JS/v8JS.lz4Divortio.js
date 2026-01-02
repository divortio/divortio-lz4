/**
 * @fileoverview Implementation of the Divortio LZ4 benchmark adapter.
 * Adapts the local 'lz4-divortio' source code to the standard BaseLib interface.
 */

import { BaseLib } from '../shared/baseLib.js';

/**
 * Wrapper for the 'lz4-divortio' library.
 * This is a highly optimized, modern JavaScript implementation of LZ4
 * designed for zero-allocation performance and high throughput.
 *
 * @class V8JSLz4Divortio
 * @extends {BaseLib}
 */
export class V8JSLz4Divortio extends BaseLib {
    /**
     * Creates an instance of the V8JSLz4Divortio adapter.
     */
    constructor() {
        // name: 'lz4-divortio' - Semantic name for reports
        // library: 'lz4-divortio' - Local library name
        // environment: 'V8' - Optimized for V8/Node.js
        // language: 'Javascript' - Pure JS implementation
        super('lz4-divortio', 'lz4-divortio', 'V8', 'Javascript');

        /** @type {Object|null} The core LZ4 module containing compress logic */
        this.LZ4 = null;
        /** @type {Function|null} The specific buffer decompression function */
        this.decompressBuffer = null;
    }

    /**
     * Dynamically imports the local entrypoint.
     * Uses a relative path to locate the source file from the benchmark directory.
     *
     * @async
     * @override
     * @returns {Promise<void>} Resolves when the library is loaded.
     */
    async load() {
        // Relative path from 'benchmark/libraries/' to 'src/lz4.js'
        const mod = await import('../../../../src/lz4.js');

        this.LZ4 = mod.LZ4;

        // We assume the main entrypoint exports the buffer decompressor.
        // If your project structure still separates them, we can add the secondary import here.
        this.decompressBuffer = mod.decompressBuffer;

        if (!this.LZ4) {
            throw new Error("Failed to load LZ4 object from ../../src/lz4.js");
        }
    }

    /**
     * Compresses data using the optimized Divortio LZ4 implementation.
     *
     * @override
     * @param {Uint8Array|Buffer} input - The raw input data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * @returns {Uint8Array|Buffer} The compressed data.
     */
    compress(input, outputBuffer) {
        if (!this.LZ4) throw new Error("Library not loaded");

        // Configuration based on 'benchWorker.js' optimization flags:
        // dict: null, blockSize: 4MB, blockIndep: true, checksum: false, addSize: true

        if (outputBuffer) {
            // Zero-Allocation Mode: Writes directly to outputBuffer.
            // Returns the byte length of the compressed data.
            const length = this.LZ4.compress(input, null, 4194304, true, false, true, outputBuffer);

            // Return the useful subarray of the shared buffer
            return outputBuffer.subarray(0, length);
        } else {
            // Allocation Mode: Returns a new buffer
            return this.LZ4.compress(input, null, 4194304, true, false, true);
        }
    }

    /**
     * Decompresses data using the Divortio LZ4 buffer decompressor.
     *
     * @override
     * @param {Uint8Array|Buffer} compressedInput - The compressed data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer (unused in current API).
     * @returns {Uint8Array|Buffer} The decompressed data.
     */
    decompress(compressedInput, outputBuffer) {
        if (!this.decompressBuffer) throw new Error("Library not loaded or decompressBuffer missing");

        // decompressBuffer allocates and returns the result
        return this.decompressBuffer(compressedInput);
    }
}