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
import { compressAsync, createAsyncCompressStream} from "./stream/streamAsyncCompress.js";
import { decompressAsync, createAsyncDecompressStream } from "./stream/streamAsyncDecompress.js";

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

    compressRaw: compressBlock,
    decompressRaw: decompressBlock,
    compress: compressBuffer,
    decompress: decompressBuffer,

    // ========================================================================
    // 2. STREAMING (Memory Efficient)
    // ========================================================================
    createCompressStream: createCompressStream,
    createDecompressStream: createDecompressStream,
    // ========================================================================
    // 3. ASYNC (Time-Sliced)
    // ========================================================================
    compressAsync: compressAsync,
    decompressAsync: decompressAsync,

    createAsyncCompressStream: createAsyncCompressStream,
    createAsyncDecompressStream: createAsyncDecompressStream,
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