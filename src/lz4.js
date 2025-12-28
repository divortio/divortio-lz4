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
import { LZ4Worker } from './webWorker/workerClient.js';
// Raw Block Imports
import { compressBlock } from './block/blockCompress.js';
import { decompressBlock } from './block/blockDecompress.js';

// Import Type Handling Batteries
import {
    compressString, decompressString,
    compressObject, decompressObject
} from './shared/typeHandling.js';

/**
 *
 * @type {{
 *      compressRaw: ((function(Uint8Array, Uint8Array, Uint16Array): number)|*),
 *      decompressRaw: ((function(Uint8Array, Uint8Array): number)|*),
 *      compress: ((function((string|Object|ArrayBuffer|ArrayBufferView), {blockIndependence?: boolean, contentChecksum?: boolean, maxBlockSize?: number}=): Uint8Array)|*),
 *      decompress: ((function((ArrayBuffer|ArrayBufferView)): Uint8Array)|*),
 *      compressStream: ((function({blockIndependence?: boolean, contentChecksum?: boolean, maxBlockSize?: number}=): TransformStream<Uint8Array, Uint8Array>)|*),
 *      decompressStream: ((function({maxBlockSize?: number}=): TransformStream<Uint8Array, Uint8Array>)|*),
 *      compressAsync: ((function(Uint8Array, {blockIndependence?: boolean, contentChecksum?: boolean, maxBlockSize?: number}=, number=): Promise<Uint8Array>)|*),
 *      decompressAsync: ((function(Uint8Array, {maxBlockSize?: number}=, number=): Promise<Uint8Array>)|*),
 *      compressWorker: ((function(Uint8Array): Promise<Uint8Array>)|*),
 *      decompressWorker: ((function(Uint8Array, number): Promise<Uint8Array>)|*),
 *      compressString: ((function(string, Object=): Uint8Array)|*),
 *      decompressString: ((function(Uint8Array): string)|*),
 *      compressObject: ((function((Object|Array|number|boolean), Object=): Uint8Array)|*),
 *      decompressObject: ((function(Uint8Array): (Object|Array|number|boolean))|*)
 *      }}
 */
export const LZ4 = {
    // ========================================================================
    // 1. SYNCHRONOUS (Blocking)
    // ========================================================================
    /**
     * Compresses a raw block.
     * @param {Uint8Array} input - Data to compress.
     * @param {Uint8Array} output - Output buffer (must be large enough).
     * @param {Uint16Array} hashTable - Reusable hash table.
     * @returns {number} Bytes written.
     */
    compressRaw: compressBlock,

    /**
     * Decompresses a raw block.
     * @param {Uint8Array} input - Compressed block data.
     * @param {Uint8Array} output - Output buffer (must be allocated to originalSize).
     * @returns {number} Bytes written.
     */
    decompressRaw: decompressBlock,

    /**
     * Synchronous Compression.
     * Compresses a buffer immediately on the current thread.
     *
     * @param {Uint8Array} input - The raw data to compress.
     * @returns {Uint8Array} The compressed LZ4 data.
     *
     * Best for: Small data (< 1MB), Node.js scripts, or inside Web Workers.
     * Warning: Blocks the event loop. Do not use for large files on the UI thread.
     */
    compress: compressBuffer,

    /**
     * Synchronous Decompression.
     * Decompresses LZ4 data immediately on the current thread.
     *
     * @param {Uint8Array} input - The compressed LZ4 data.
     * @param {number} originalSize - The size of the uncompressed data (bytes).
     * @returns {Uint8Array} The restored raw data.
     *
     * Best for: Small data (< 1MB), Node.js scripts, or inside Web Workers.
     * Warning: Blocks the event loop. Do not use for large files on the UI thread.
     */
    decompress: decompressBuffer,

    // ========================================================================
    // 2. STREAMING (Memory Efficient)
    // ========================================================================

    /**
     * Creates a Compression Stream (TransformStream).
     * Compresses data chunk-by-chunk as it flows through the stream.
     *
     * @returns {TransformStream<Uint8Array, Uint8Array>}
     *
     * Best for: Cloudflare Workers, Node.js pipelines, Network requests, or
     * processing files larger than available RAM.
     */
    compressStream: createCompressStream,

    /**
     * Creates a Decompression Stream (TransformStream).
     * Decompresses data chunk-by-chunk as it flows through the stream.
     *
     * @returns {TransformStream<Uint8Array, Uint8Array>}
     *
     * Best for: Cloudflare Workers, Node.js pipelines, Network requests, or
     * processing files larger than available RAM.
     */
    decompressStream: createDecompressStream,

    // ========================================================================
    // 3. ASYNC (Time-Sliced)
    // ========================================================================

    /**
     * Asynchronous Compression (Main Thread).
     * Compresses data in chunks, yielding to the event loop periodically
     * to prevent freezing the UI.
     *
     * @param {Uint8Array} input - The raw data.
     * @returns {Promise<Uint8Array>}
     *
     * Best for: Browser Main Thread when Web Workers are not an option.
     * Note: Slower than Sync, but keeps the page responsive.
     */
    compressAsync: compressAsync,

    /**
     * Asynchronous Decompression (Main Thread).
     * Decompresses data in chunks, yielding to the event loop periodically
     * to prevent freezing the UI.
     *
     * @param {Uint8Array} input - The compressed data.
     * @param {number} originalSize - The uncompressed size.
     * @returns {Promise<Uint8Array>}
     *
     * Best for: Browser Main Thread when Web Workers are not an option.
     * Note: Slower than Sync, but keeps the page responsive.
     */
    decompressAsync: decompressAsync,

    // ========================================================================
    // 4. WEB WORKER (True Parallelism)
    // ========================================================================

    /**
     * Off-Thread Compression (Zero-Friction).
     * Automatically spawns a background Worker to compress data without
     * impacting the main thread's performance.
     *
     * @param {Uint8Array} input - The raw data.
     * @returns {Promise<Uint8Array>}
     *
     * Best for: Heavy processing in Browsers.
     * Optimization: Automatically uses SharedArrayBuffer if Cross-Origin headers are set.
     */
    compressWorker: LZ4Worker.compress,

    /**
     * Off-Thread Decompression (Zero-Friction).
     * Automatically spawns a background Worker to decompress data without
     * impacting the main thread's performance.
     *
     * @param {Uint8Array} input - The compressed LZ4 data.
     * @param {number} originalSize - The uncompressed size.
     * @returns {Promise<Uint8Array>}
     *
     * Best for: Heavy processing in Browsers.
     * Optimization: Automatically uses SharedArrayBuffer if Cross-Origin headers are set.
     */
    decompressWorker: LZ4Worker.decompress,

    // ========================================================================
    // 5. BATTERIES-INCLUDED HELPERS (Type Handling)
    // ========================================================================

    /**
     * Compress a String.
     * Encodes the string to UTF-8 bytes and then compresses it.
     *
     * @param {string} str - The text string to compress.
     * @returns {Uint8Array} The compressed LZ4 binary data.
     *
     * Example: const bin = LZ4.compressString("Hello World");
     */
    compressString: compressString,

    /**
     * Decompress to a String.
     * Decompresses the LZ4 binary and decodes the UTF-8 bytes back to a string.
     *
     * @param {Uint8Array} compressedData - The compressed LZ4 data.
     * @param {number} originalSize - Length of the UTF-8 buffer (not char count).
     * @returns {string} The restored string.
     */
    decompressString: decompressString,

    /**
     * Compress a JSON Object.
     * Serializes a JavaScript object/array to a JSON string, encodes it,
     * and compresses the result.
     *
     * @param {object|Array} obj - The JSON-serializable object.
     * @returns {Uint8Array} The compressed LZ4 binary data.
     *
     * Example: const bin = LZ4.compressObject({ id: 1, data: "test" });
     */
    compressObject: compressObject,

    /**
     * Decompress to a JSON Object.
     * Decompresses the LZ4 binary, decodes the UTF-8 JSON string, and
     * parses it back into a JavaScript object.
     *
     * @param {Uint8Array} compressedData - The compressed LZ4 data.
     * @param {number} originalSize - Length of the uncompressed JSON string buffer.
     * @returns {object|Array} The restored JavaScript object.
     */
    decompressObject: decompressObject,
};

export default LZ4;