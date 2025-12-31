/**
 * src/buffer/bufferCompress.js
 * * LZ4 Frame Compression (High-Level API).
 * * This module implements the LZ4 Frame Format (spec v1.6.1). It handles:
 * - Frame Headers (Magic Number, Flags, Block Max Size, Content Size, Dict ID)
 * - Block Management (Chunking input into blocks)
 * - Checksums (Header & Content xxHash32)
 * - Memory Management (Zero-Allocation option via pre-allocated buffers)
 * * It delegates the actual compression of raw bytes to the optimized `blockCompress` kernel.
 * @module bufferCompress
 */

import { xxHash32 } from '../xxhash32/xxhash32.js';
import { compressBlock } from '../block/blockCompress.js';
import { ensureBuffer } from '../shared/lz4Util.js';

// --- Constants & Frame Flags ---

const MIN_MATCH = 4 | 0;
const HASH_LOG = 14 | 0;
const HASH_TABLE_SIZE = 16384 | 0;
const HASH_SHIFT = 18 | 0;
const HASH_MASK = 16383 | 0;

const LZ4_VERSION = 1;

/** Flag: Blocks are independent (no dependencies on previous blocks). */
const FLG_BLOCK_INDEPENDENCE_MASK = 0x20;

/** Flag: A 32-bit Content Checksum is appended at the end of the frame. */
const FLG_CONTENT_CHECKSUM_MASK = 0x04;

/** Flag: The original content size (8 bytes) is stored in the header. */
const FLG_CONTENT_SIZE_MASK = 0x08;

/** Flag: A Dictionary ID (4 bytes) is stored in the header. */
const FLG_DICT_ID_MASK = 0x01;

/**
 * LZ4 Block Maximum Sizes.
 * Encoded as 3 bits in the Block Descriptor (BD) byte.
 */
const BLOCK_MAX_SIZES = {
    4: 65536,       // 64 KB
    5: 262144,      // 256 KB
    6: 1048576,     // 1 MB
    7: 4194304      // 4 MB
};

/**
 * Global Hash Table (16K Entries).
 * Reused across calls to avoid allocation overhead.
 * This makes the compressor non-reentrant but extremely fast for single-threaded execution.
 */
const GLOBAL_HASH_TABLE = new Int32Array(HASH_TABLE_SIZE);

// --- Helpers ---

/**
 * Writes a 32-bit integer to a byte array in Little Endian format.
 * @param {Uint8Array} b - Destination buffer.
 * @param {number} i - Integer to write.
 * @param {number} n - Offset.
 */
function writeU32(b, i, n) {
    b[n] = i & 0xFF;
    b[n + 1] = (i >>> 8) & 0xFF;
    b[n + 2] = (i >>> 16) & 0xFF;
    b[n + 3] = (i >>> 24) & 0xFF;
}

/**
 * Maps a byte size to the corresponding LZ4 Block ID (4, 5, 6, or 7).
 * @param {number} bytes - Max block size in bytes.
 * @returns {number} The LZ4 Block ID.
 */
function getBlockId(bytes) {
    if (!bytes || bytes <= 65536) return 4;
    if (bytes <= 262144) return 5;
    if (bytes <= 1048576) return 6;
    return 7;
}

/**
 * Compresses a buffer into a complete LZ4 Frame.
 * * Optimization Features:
 * - **Zero Allocation**: If `outputBuffer` is provided, no new memory is allocated.
 * - **Static Hash Table**: Uses a shared global table to avoid GC.
 * - **Direct Write**: Passes output pointers directly to the block compressor.
 * @param {Uint8Array|ArrayBuffer|Buffer} input - The raw data to compress.
 * @param {Uint8Array} [dictionary=null] - Optional dictionary for pre-warming the compressor.
 * @param {number} [maxBlockSize=4194304] - Maximum size of a single block (default 4MB).
 * @param {boolean} [blockIndependence=false] - If true, blocks can be decompressed independently (slightly lower ratio).
 * @param {boolean} [contentChecksum=false] - If true, adds a xxHash32 checksum of the original content at the end.
 * @param {boolean} [addContentSize=true] - If true, adds the original content size to the header (recommended).
 * @param {Uint8Array} [outputBuffer=null] - **Optimization**: A pre-allocated buffer to write the compressed data into.
 * If null, a new buffer is allocated (approx worst-case size).
 * @returns {Uint8Array} A view of the compressed LZ4 Frame (either a new buffer or a subarray of `outputBuffer`).
 */
export function compressBuffer(input, dictionary = null, maxBlockSize = 4194304, blockIndependence = false, contentChecksum = false, addContentSize = true, outputBuffer = null) {
    const rawInput = ensureBuffer(input);

    // --- Dictionary Setup ---
    let workingBuffer = rawInput;
    let inputStartOffset = 0;
    let dictLen = 0;
    let dictId = null;

    if (dictionary && dictionary.length > 0) {
        const dictBuffer = ensureBuffer(dictionary);
        // Calculate Dictionary ID (Hash of the dict)
        dictId = xxHash32(dictBuffer, 0);

        // LZ4 only uses the last 64KB of the dictionary
        const dictWindow = dictBuffer.length > 65536 ? dictBuffer.subarray(dictBuffer.length - 65536) : dictBuffer;
        dictLen = dictWindow.length;

        // Create a combined view (virtually) or copy if needed
        // For simplicity and speed in JS, we create a new buffer if dict exists
        // (This allocation is unavoidable if we want to support dicts efficiently in blockCompress)
        workingBuffer = new Uint8Array(dictLen + rawInput.length);
        workingBuffer.set(dictWindow, 0);
        workingBuffer.set(rawInput, dictLen);
        inputStartOffset = dictLen;
    }

    const len = rawInput.length | 0;
    const bdId = getBlockId(maxBlockSize);
    const resolvedBlockSize = BLOCK_MAX_SIZES[bdId] | 0;

    // --- Output Buffer Selection ---
    let output;
    let outPos = 0 | 0;

    if (outputBuffer) {
        // Use user-provided buffer (Zero Allocation Path)
        output = outputBuffer;
    } else {
        // Allocate worst-case size: Header + Input + 0.4% overhead + Footer
        const worstCaseSize = (19 + len + (len / 255 | 0) + 64 + 8) | 0;
        output = new Uint8Array(worstCaseSize);
    }

    // --- 1. Write Header ---

    // Magic Number (0x184D2204) Little Endian
    output[outPos++] = 0x04; output[outPos++] = 0x22; output[outPos++] = 0x4D; output[outPos++] = 0x18;

    // FLG Byte
    let flg = (LZ4_VERSION << 6);
    if (blockIndependence) flg |= FLG_BLOCK_INDEPENDENCE_MASK;
    if (contentChecksum) flg |= FLG_CONTENT_CHECKSUM_MASK;
    if (dictId !== null) flg |= FLG_DICT_ID_MASK;
    if (addContentSize) flg |= FLG_CONTENT_SIZE_MASK;
    output[outPos++] = flg;

    // BD Byte
    output[outPos++] = (bdId & 0x07) << 4;

    const headerStart = 4;

    // Content Size (Optional)
    if (addContentSize) {
        writeU32(output, len >>> 0, outPos);
        outPos += 4;
        writeU32(output, (len / 4294967296) | 0, outPos); // High 32 bits
        outPos += 4;
    }

    // Dictionary ID (Optional)
    if (dictId !== null) {
        writeU32(output, dictId, outPos);
        outPos += 4;
    }

    // Header Checksum (xxHash32 of flags/content size/dictID)
    const headerHash = xxHash32(output.subarray(headerStart, outPos), 0);
    output[outPos++] = (headerHash >>> 8) & 0xFF;

    // --- 2. Compression Loop ---

    const hashTable = GLOBAL_HASH_TABLE;
    hashTable.fill(0); // Clear table for new compression

    // Pre-warm Dictionary (if present)
    if (dictLen > 0) {
        const mask = HASH_MASK;
        const shift = HASH_SHIFT;
        const limit = (dictLen - 4) | 0;

        for (let i = 0; i <= limit; i++) {
            var seq = (workingBuffer[i] | (workingBuffer[i + 1] << 8) | (workingBuffer[i + 2] << 16) | (workingBuffer[i + 3] << 24)) | 0;
            var h = seq;
            // Jenkins Hash (Matched to blockCompress)
            h = (h + 2127912214 + (h << 12)) | 0;
            h = (h ^ -949894596 ^ (h >>> 19)) | 0;
            h = (h + 374761393 + (h << 5)) | 0;
            h = (h + -744332180 ^ (h << 9)) | 0;
            h = (h + -42973499 + (h << 3)) | 0;
            h = (h ^ -1252372727 ^ (h >>> 16)) | 0;
            var hash = (h >>> shift) & mask;
            hashTable[hash] = i + 1;
        }
    }

    let srcPos = inputStartOffset;
    const totalEnd = inputStartOffset + len;

    while (srcPos < totalEnd) {
        const end = Math.min(srcPos + resolvedBlockSize, totalEnd) | 0;
        const blockSize = (end - srcPos) | 0;

        // Reserve 4 bytes for Block Size
        const sizePos = outPos;
        outPos = (outPos + 4) | 0;

        // Perform Compression directly into output buffer
        // Returns the number of bytes written
        const compSize = compressBlock(workingBuffer, output, srcPos, blockSize, hashTable, outPos);

        if (compSize > 0 && compSize < blockSize) {
            // Compressed Block
            writeU32(output, compSize, sizePos);
            outPos = (outPos + compSize) | 0;
        } else {
            // Uncompressed Block (Fallback)
            // Flag high bit (0x80000000) indicates uncompressed data
            writeU32(output, blockSize | 0x80000000, sizePos);
            output.set(workingBuffer.subarray(srcPos, end), outPos);
            outPos = (outPos + blockSize) | 0;
        }

        // If blocks are independent, clear the hash table history
        if (blockIndependence) {
            hashTable.fill(0);
        }

        srcPos = end;
    }

    // --- 3. Footer ---

    // EndMark (4 bytes of 0)
    writeU32(output, 0, outPos);
    outPos = (outPos + 4) | 0;

    // Content Checksum (Optional)
    if (contentChecksum) {
        const fullHash = xxHash32(rawInput, 0);
        writeU32(output, fullHash, outPos);
        outPos = (outPos + 4) | 0;
    }

    // Return the used portion of the output buffer
    return output.subarray(0, outPos);
}