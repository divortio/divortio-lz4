/**
 * src/buffer/bufferDecompress.js
 * LZ4 Frame Format Decompression - Zero Allocation Edition.
 */

import { xxHash32 } from '../xxhash32/xxhash32.js';
import { decompressBlock } from '../block/blockDecompress.js';
import { ensureBuffer } from '../shared/lz4Util.js';

const MAGIC_NUMBER = 0x184D2204;
const LZ4_VERSION = 1;
const FLG_VERSION_MASK = 0xC0;
const FLG_BLOCK_CHECKSUM_MASK = 0x10;
const FLG_CONTENT_SIZE_MASK = 0x08;
const FLG_CONTENT_CHECKSUM_MASK = 0x04;
const FLG_DICT_ID_MASK = 0x01;

const BLOCK_MAX_SIZES = { 4: 65536, 5: 262144, 6: 1048576, 7: 4194304 };
const FALLBACK_WORKSPACE = new Uint8Array(BLOCK_MAX_SIZES[7]);

// Function removed: readU32 (Inlined manually below)

export function decompressBuffer(input, dictionary = null, verifyChecksum = true) {
    const data = ensureBuffer(input);
    const len = data.length | 0;
    let pos = 0 | 0;

    // Inline ReadU32 (Magic Number)
    if (len < 4 || ((data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24)) >>> 0) !== MAGIC_NUMBER) {
        throw new Error("LZ4: Invalid Magic Number");
    }
    pos += 4;

    const flg = data[pos++];
    const version = (flg & FLG_VERSION_MASK) >> 6;
    if (version !== LZ4_VERSION) throw new Error(`LZ4: Unsupported Version ${version}`);

    const hasBlockChecksum = (flg & FLG_BLOCK_CHECKSUM_MASK) !== 0;
    const hasContentSize = (flg & FLG_CONTENT_SIZE_MASK) !== 0;
    const hasContentChecksum = (flg & FLG_CONTENT_CHECKSUM_MASK) !== 0;
    const hasDictId = (flg & FLG_DICT_ID_MASK) !== 0;

    pos++; // Skip BD

    let expectedOutputSize = 0;
    if (hasContentSize) {
        // Inline ReadU32
        const low = (data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24)) >>> 0;
        const high = (data[pos + 4] | (data[pos + 5] << 8) | (data[pos + 6] << 16) | (data[pos + 7] << 24)) >>> 0;
        pos = (pos + 8) | 0;
        expectedOutputSize = (high * 4294967296) + low;
    }
    if (hasDictId) pos += 4;
    pos++; // Header Checksum

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
        outputChunks = [];
        window = new Uint8Array(WINDOW_SIZE);
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

    let workspace = FALLBACK_WORKSPACE;
    if (workspace.length < BLOCK_MAX_SIZES[7]) workspace = new Uint8Array(BLOCK_MAX_SIZES[7]);

    while (pos < len) {
        // Inline ReadU32 (Block Size)
        const blockSize = (data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24)) >>> 0;
        pos += 4;
        if (blockSize === 0) break;

        const isUncompressed = (blockSize & 0x80000000) !== 0;
        const actualSize = blockSize & 0x7FFFFFFF;

        if (useDirectWrite) {
            if (isUncompressed) {
                result.set(data.subarray(pos, pos + actualSize), resultPos);
                resultPos += actualSize;
            } else {
                const bytes = decompressBlock(data, pos, actualSize, result, resultPos, dictionary);
                resultPos += bytes;
            }
        } else {
            let chunk;
            if (isUncompressed) {
                chunk = data.slice(pos, pos + actualSize);
                outputChunks.push(chunk);
            } else {
                const dict = (windowPos > 0) ? window.subarray(0, windowPos) : null;
                const bytes = decompressBlock(data, pos, actualSize, workspace, 0, dict);
                chunk = workspace.slice(0, bytes);
                outputChunks.push(chunk);
            }

            const chunkLen = chunk.length;
            if (chunkLen >= WINDOW_SIZE) {
                window.set(chunk.subarray(chunkLen - WINDOW_SIZE), 0);
                windowPos = WINDOW_SIZE;
            } else if (windowPos + chunkLen <= WINDOW_SIZE) {
                window.set(chunk, windowPos);
                windowPos += chunkLen;
            } else {
                const keep = WINDOW_SIZE - chunkLen;
                window.copyWithin(0, windowPos - keep, windowPos);
                window.set(chunk, keep);
                windowPos = WINDOW_SIZE;
            }
        }

        pos += actualSize;
        if (hasBlockChecksum) pos += 4;
    }

    if (!useDirectWrite) {
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

    if (hasContentChecksum && verifyChecksum) {
        // Inline ReadU32 (Content Checksum)
        const storedContentHash = (data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24)) >>> 0;
        const actualContentHash = xxHash32(result, 0);
        if (storedContentHash !== actualContentHash) throw new Error("LZ4: Content Checksum Error");
    }

    return result;
}