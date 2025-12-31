/**
 * src/buffer/bufferDecompress.js
 * * LZ4 Frame Format Decompression.
 * * This module handles the parsing and decompression of full LZ4 Frames. It implements
 * the **Zero-Allocation / Direct Write** strategy when the "Content Size" header is present,
 * allowing it to decompress directly into the final buffer without intermediate chunks.
 * * Features:
 * - **Frame Parsing**: Handles Magic Number, Flags (Version, Block Independence, Checksums), and Descriptors.
 * - **Direct Write Optimization**: If the total size is known, allocates once and writes directly.
 * - **Streaming Support (Fallback)**: If size is unknown, uses a chunked approach with a rolling 64KB window.
 * - **Checksum Verification**: Validates Content Checksum (xxHash32) if enabled.
 * @module bufferDecompress
 */

import { xxHash32 } from '../xxhash32/xxhash32.js';
import { decompressBlock } from '../block/blockDecompress.js';
import { ensureBuffer } from '../shared/lz4Util.js';

// --- Constants ---

/** LZ4 Magic Number (Little Endian). */
const MAGIC_NUMBER = 0x184D2204;

/** Supported LZ4 Version (1). */
const LZ4_VERSION = 1;

// --- Flag Masks ---
const FLG_VERSION_MASK = 0xC0;
const FLG_BLOCK_CHECKSUM_MASK = 0x10;
const FLG_CONTENT_SIZE_MASK = 0x08;
const FLG_CONTENT_CHECKSUM_MASK = 0x04;
const FLG_DICT_ID_MASK = 0x01;

/** Max Block Sizes (mapped from Block Descriptor ID). */
const BLOCK_MAX_SIZES = { 4: 65536, 5: 262144, 6: 1048576, 7: 4194304 };

/** * Shared workspace for chunked decompression.
 * Reused to avoid allocation when the output size is unknown.
 * Size: 4MB (Max Block Size).
 */
const FALLBACK_WORKSPACE = new Uint8Array(BLOCK_MAX_SIZES[7]);

/**
 * Decompresses an LZ4 Frame into a Uint8Array.
 * @param {Uint8Array|ArrayBuffer|Buffer} input - The compressed LZ4 frame.
 * @param {Uint8Array} [dictionary=null] - Optional dictionary for pre-warming (used in dependent block streams).
 * @param {boolean} [verifyChecksum=true] - If true, calculates and verifies the Content Checksum (xxHash32).
 * @returns {Uint8Array} The decompressed data.
 * @throws {Error} If the Magic Number is invalid, Version is unsupported, or Checksum fails.
 */
export function decompressBuffer(input, dictionary = null, verifyChecksum = true) {
    const data = ensureBuffer(input);
    const len = data.length | 0;
    let pos = 0 | 0;

    // --- 1. Header Parsing ---

    // Magic Number Check (Inline ReadU32)
    if (len < 4 || ((data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24)) >>> 0) !== MAGIC_NUMBER) {
        throw new Error("LZ4: Invalid Magic Number");
    }
    pos += 4;

    // FLG (Flags) Byte
    const flg = data[pos++];
    const version = (flg & FLG_VERSION_MASK) >> 6;
    if (version !== LZ4_VERSION) throw new Error(`LZ4: Unsupported Version ${version}`);

    const hasBlockChecksum = (flg & FLG_BLOCK_CHECKSUM_MASK) !== 0;
    const hasContentSize = (flg & FLG_CONTENT_SIZE_MASK) !== 0;
    const hasContentChecksum = (flg & FLG_CONTENT_CHECKSUM_MASK) !== 0;
    const hasDictId = (flg & FLG_DICT_ID_MASK) !== 0;

    // BD (Block Descriptor) Byte
    pos++;

    // Content Size (Optional)
    let expectedOutputSize = 0;
    if (hasContentSize) {
        // Inline ReadU32 (Low) + ReadU32 (High)
        const low = (data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24)) >>> 0;
        const high = (data[pos + 4] | (data[pos + 5] << 8) | (data[pos + 6] << 16) | (data[pos + 7] << 24)) >>> 0;
        pos = (pos + 8) | 0;
        // Combine 64-bit size (Max 9PB in JS)
        expectedOutputSize = (high * 4294967296) + low;
    }

    // Dictionary ID (Optional)
    if (hasDictId) pos += 4;

    // Header Checksum
    pos++;

    // --- 2. Setup Decompression Strategy ---

    // Direct Write Optimization: If we know the size, we allocate ONCE and write directly.
    const useDirectWrite = (expectedOutputSize > 0);

    let result = null;
    let resultPos = 0;
    let outputChunks = null;
    let window = null;
    let windowPos = 0;
    const WINDOW_SIZE = 65536;

    if (useDirectWrite) {
        result = new Uint8Array(expectedOutputSize);
    } else {
        // Unknown Size: Use Chunk Accumulation
        outputChunks = [];
        window = new Uint8Array(WINDOW_SIZE); // Rolling window for back-references

        // Initialize Dictionary
        if (dictionary) {
            const dLen = dictionary.length;
            if (dLen > WINDOW_SIZE) {
                window.set(dictionary.subarray(dLen - WINDOW_SIZE), 0);
                windowPos = WINDOW_SIZE;
            } else {
                window.set(dictionary, 0);
                windowPos = dLen;
            }
        }
    }

    // Workspace for block decompression (if not Direct Write)
    let workspace = FALLBACK_WORKSPACE;
    // Ensure workspace is large enough (rare edge case where max block size changes)
    if (workspace.length < BLOCK_MAX_SIZES[7]) workspace = new Uint8Array(BLOCK_MAX_SIZES[7]);

    // --- 3. Block Loop ---

    while (pos < len) {
        // Read Block Size
        const blockSize = (data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24)) >>> 0;
        pos += 4;

        // Check for EndMark (0x00000000)
        if (blockSize === 0) break;

        // Check Uncompressed Flag (High bit set)
        const isUncompressed = (blockSize & 0x80000000) !== 0;
        const actualSize = blockSize & 0x7FFFFFFF;

        if (useDirectWrite) {
            // --- Strategy A: Direct Write ---
            if (isUncompressed) {
                result.set(data.subarray(pos, pos + actualSize), resultPos);
                resultPos += actualSize;
            } else {
                // Decompress directly into the final buffer
                // This is the fastest path (Zero Allocation)
                const bytes = decompressBlock(data, pos, actualSize, result, resultPos, dictionary);
                resultPos += bytes;
            }
        } else {
            // --- Strategy B: Chunked (Unknown Size) ---
            let chunk;
            if (isUncompressed) {
                chunk = data.slice(pos, pos + actualSize);
                outputChunks.push(chunk);
            } else {
                // Decompress into workspace
                const dict = (windowPos > 0) ? window.subarray(0, windowPos) : null;
                const bytes = decompressBlock(data, pos, actualSize, workspace, 0, dict);
                // Slice result out (Allocation)
                chunk = workspace.slice(0, bytes);
                outputChunks.push(chunk);
            }

            // Update Rolling Window (Last 64KB)
            const chunkLen = chunk.length;
            if (chunkLen >= WINDOW_SIZE) {
                window.set(chunk.subarray(chunkLen - WINDOW_SIZE), 0);
                windowPos = WINDOW_SIZE;
            } else if (windowPos + chunkLen <= WINDOW_SIZE) {
                window.set(chunk, windowPos);
                windowPos += chunkLen;
            } else {
                // Shift window
                const keep = WINDOW_SIZE - chunkLen;
                window.copyWithin(0, windowPos - keep, windowPos);
                window.set(chunk, keep);
                windowPos = WINDOW_SIZE;
            }
        }

        pos += actualSize;

        // Skip Block Checksum
        if (hasBlockChecksum) pos += 4;
    }

    // --- 4. Finalize ---

    if (!useDirectWrite) {
        // Concatenate chunks if we didn't pre-allocate
        if (outputChunks.length === 1) {
            result = outputChunks[0];
        } else {
            let totalLen = 0;
            for (const c of outputChunks) totalLen += c.length;
            result = new Uint8Array(totalLen);
            let offset = 0;
            for (const c of outputChunks) {
                result.set(c, offset);
                offset += c.length;
            }
        }
    }

    // Content Checksum Verification
    if (hasContentChecksum && verifyChecksum) {
        const storedContentHash = (data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24)) >>> 0;
        const actualContentHash = xxHash32(result, 0);
        if (storedContentHash !== actualContentHash) throw new Error("LZ4: Content Checksum Error");
    }

    return result;
}