/**
 * @fileoverview
 * LZ4 JS - The Universal LZ4 Library
 * ============================================================================
 * A high-performance, zero-dependency LZ4 implementation for JavaScript.
 * Supports Node.js, Browsers, Web Workers, and Cloudflare Workers.
 *
 * MODES:
 * 1. Sync: Blocking, fastest for small data.
 * 2. Async: Non-blocking (time-sliced), keeps UI responsive.
 * 3. Stream: Memory-efficient piping for huge datasets.
 * 4. Worker: True parallelism using background threads (batteries-included).
 */

import { compressBuffer } from './buffer/bufferCompress.js';
import { decompressBuffer } from './buffer/bufferDecompress.js';
import { createCompressStream } from "./stream/streamCompress.js";
import { createDecompressStream } from "./stream/streamDecompress.js";
import { compressAsync } from "./stream/streamAsyncCompress.js";
import { decompressAsync } from "./stream/streamAsyncDecompress.js";

// FIXED: Path updated from ./worker/ to ./webWorker/
import { LZ4Worker } from './webWorker/workerClient.js';

// Raw Block Imports
import { compressBlock } from './block/blockCompress.js';
import { decompressBlock } from './block/blockDecompress.js';

// FIXED: Path updated from ./extra/ to ./shared/
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
     * @param {Uint8Array} input - Data to compress.
     * @param {Uint8Array} output - Output buffer.
     * @param {Uint16Array} hashTable - Reusable hash table.
     * @returns {number} Bytes written.
     */
    compressRaw: compressBlock,

    /**
     * Decompresses a raw block (Low Level).
     * @param {Uint8Array} input - Compressed block data.
     * @param {Uint8Array} output - Output buffer.
     * @returns {number} Bytes written.
     */
    decompressRaw: decompressBlock,

    /**
     * Synchronous Compression.
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
     * Synchronous Decompression.
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
     * Compresses data chunk-by-chunk.
     *
     * @param {Uint8Array|null} [dictionary]
     * @param {number} [maxBlockSize]
     * @param {boolean} [blockIndependence]
     * @param {boolean} [contentChecksum]
     * @returns {TransformStream<Uint8Array, Uint8Array>}
     */
    compressStream: createCompressStream,

    /**
     * Creates a Decompression Stream (TransformStream).
     * Decompresses data chunk-by-chunk.
     *
     * @param {Uint8Array|null} [dictionary]
     * @param {boolean} [verifyChecksum]
     * @returns {TransformStream<Uint8Array, Uint8Array>}
     */
    decompressStream: createDecompressStream,

    // ========================================================================
    // 3. ASYNC (Time-Sliced)
    // ========================================================================

    /**
     * Asynchronous Compression (Main Thread).
     * Yields to event loop to keep UI responsive.
     *
     * @param {Uint8Array} input
     * @param {Uint8Array|null} [dictionary]
     * @param {number} [maxBlockSize]
     * @param {boolean} [blockIndependence]
     * @param {boolean} [contentChecksum]
     * @param {number} [chunkSize]
     * @returns {Promise<Uint8Array>}
     */
    compressAsync: compressAsync,

    /**
     * Asynchronous Decompression (Main Thread).
     * Yields to event loop to keep UI responsive.
     *
     * @param {Uint8Array} input
     * @param {Uint8Array|null} [dictionary]
     * @param {boolean} [verifyChecksum]
     * @param {number} [chunkSize]
     * @returns {Promise<Uint8Array>}
     */
    decompressAsync: decompressAsync,

    // ========================================================================
    // 4. WEB WORKER (True Parallelism)
    // ========================================================================

    /**
     * Off-Thread Compression (Buffer).
     * Spawns a background Worker to compress data.
     *
     * @param {Uint8Array} input
     * @param {Object} [options] - Options passed to worker.
     * @returns {Promise<Uint8Array>}
     */
    compressWorker: LZ4Worker.compress,

    /**
     * Off-Thread Decompression (Buffer).
     * Spawns a background Worker to decompress data.
     *
     * @param {Uint8Array} input
     * @param {Object} [options]
     * @returns {Promise<Uint8Array>}
     */
    decompressWorker: LZ4Worker.decompress,

    /**
     * Off-Thread Streaming Compression.
     * Pipes a ReadableStream through the Worker to a WritableStream.
     *
     * @param {ReadableStream} readable
     * @param {WritableStream} writable
     * @param {Object} [options]
     * @returns {Promise<void>}
     */
    compressWorkerStream: LZ4Worker.compressStream,

    /**
     * Off-Thread Streaming Decompression.
     * Pipes a ReadableStream through the Worker to a WritableStream.
     *
     * @param {ReadableStream} readable
     * @param {WritableStream} writable
     * @param {Object} [options]
     * @returns {Promise<void>}
     */
    decompressWorkerStream: LZ4Worker.decompressStream,

    // ========================================================================
    // 5. BATTERIES-INCLUDED HELPERS (Type Handling)
    // ========================================================================

    /**
     * Compress a String (UTF-8).
     * @param {string} str
     * @param {Uint8Array|null} [dictionary]
     * @returns {Uint8Array}
     */
    compressString: compressString,

    /**
     * Decompress to a String (UTF-8).
     * @param {Uint8Array} compressedData
     * @param {Uint8Array|null} [dictionary]
     * @returns {string}
     */
    decompressString: decompressString,

    /**
     * Compress a JSON Object.
     * @param {object|Array} obj
     * @param {Uint8Array|null} [dictionary]
     * @returns {Uint8Array}
     */
    compressObject: compressObject,

    /**
     * Decompress to a JSON Object.
     * @param {Uint8Array} compressedData
     * @param {Uint8Array|null} [dictionary]
     * @returns {object|Array}
     */
    decompressObject: decompressObject,
};

export default LZ4;