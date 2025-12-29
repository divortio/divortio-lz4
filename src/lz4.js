/**
 * @fileoverview
 * LZ4 JS - The Universal LZ4 Library
 * ============================================================================
 * A high-performance, zero-dependency LZ4 implementation for JavaScript.
 * Supports Node.js, Browsers, Web Workers, and Cloudflare Workers.
 */

import { compressBuffer } from './buffer/bufferCompress.js';
import { decompressBuffer } from './buffer/bufferDecompress.js';
import { createCompressStream } from "./stream/streamCompress.js";
import { createDecompressStream } from "./stream/streamDecompress.js";
import { compressAsync } from "./stream/streamAsyncCompress.js";
import { decompressAsync } from "./stream/streamAsyncDecompress.js";

import { LZ4Worker } from './webWorker/workerClient.js';

// Raw Block Imports
import { compressBlock } from './block/blockCompress.js';
import { decompressBlock } from './block/blockDecompress.js';

import {
    compressString, decompressString,
    compressObject, decompressObject
} from './shared/typeHandling.js';

export const LZ4 = {
    // ========================================================================
    // 1. SYNCHRONOUS (Blocking)
    // ========================================================================

    /**
     * Compresses a raw block (Low Level).
     * Direct access to the kernel.
     * Signature: (input, output, srcStart, srcLen, hashTable)
     * Fixed: Reverted to direct alias to support existing tests.
     */
    compressRaw: compressBlock,

    /**
     * Decompresses a raw block (Low Level).
     * Signature: (input, output, dictionary)
     */
    decompressRaw: decompressBlock,

    /**
     * Synchronous Compression (Frame Format).
     * Compresses a buffer immediately on the current thread.
     *
     * @param {Uint8Array} input - The raw data.
     * @param {Uint8Array|null} [dictionary] - Optional dictionary.
     * @param {number} [maxBlockSize] - Block size (default 64KB).
     * @param {boolean} [blockIndependence] - False = better compression.
     * @param {boolean} [contentChecksum] - True = slower, safer.
     * @returns {Uint8Array} The compressed LZ4 data.
     */
    compress: compressBuffer,

    /**
     * Synchronous Decompression (Frame Format).
     * Decompresses LZ4 data immediately on the current thread.
     *
     * @param {Uint8Array} input - The compressed LZ4 data.
     * @param {Uint8Array|null} [dictionary] - Optional dictionary.
     * @param {boolean} [verifyChecksum] - False = faster.
     * @returns {Uint8Array} The restored raw data.
     */
    decompress: decompressBuffer,

    // ========================================================================
    // 2. STREAMING (Memory Efficient)
    // ========================================================================

    /**
     * Creates a Compression Stream (TransformStream).
     */
    compressStream: createCompressStream,

    /**
     * Creates a Decompression Stream (TransformStream).
     */
    decompressStream: createDecompressStream,

    // ========================================================================
    // 3. ASYNC (Time-Sliced)
    // ========================================================================

    compressAsync: compressAsync,
    decompressAsync: decompressAsync,

    // ========================================================================
    // 4. WEB WORKER (True Parallelism)
    // ========================================================================

    compressWorker: LZ4Worker.compress,
    decompressWorker: LZ4Worker.decompress,
    compressWorkerStream: LZ4Worker.compressStream,
    decompressWorkerStream: LZ4Worker.decompressStream,

    // ========================================================================
    // 5. BATTERIES-INCLUDED HELPERS (Type Handling)
    // ========================================================================

    compressString: compressString,
    decompressString: decompressString,
    compressObject: compressObject,
    decompressObject: decompressObject,
};

export default LZ4;