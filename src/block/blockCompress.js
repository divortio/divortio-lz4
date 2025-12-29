/**
 * src/block/blockCompress.js
 * LZ4 Block Compression Kernel.
 * Optimized for V8 JIT (Inlined Hash & Zero-Allocation).
 */

import {
    LAST_LITERALS,
    MF_LIMIT,
    HASH_TABLE_SIZE,
    HASH_SHIFT
} from '../shared/constants.js';

/**
 * Compresses a block of data.
 * @param {Uint8Array} src - Input buffer.
 * @param {Uint8Array} output - Output buffer.
 * @param {number} srcStart - Start index.
 * @param {number} srcLen - Length of block.
 * @param {Uint32Array} hashTable - Hash table (1-based indexing).
 * @returns {number} Bytes written.
 */
export function compressBlock(src, output, srcStart, srcLen, hashTable) {
    var sIndex = srcStart | 0;
    var sEnd = (srcStart + srcLen) | 0;
    var mflimit = (sEnd - MF_LIMIT) | 0;
    var matchLimit = (sEnd - LAST_LITERALS) | 0;

    var dIndex = 0 | 0;
    var mAnchor = sIndex;

    // Acceleration State
    var searchMatchCount = (1 << 6) + 3;

    // Hash Constants
    var HASH_MASK = (HASH_TABLE_SIZE - 1) | 0;

    while (sIndex < mflimit) {
        // 1. Read Sequence
        var seq = (src[sIndex] | (src[sIndex + 1] << 8) | (src[sIndex + 2] << 16) | (src[sIndex + 3] << 24)) | 0;

        // 2. Hash (Bob Jenkins / lz4js variant inline)
        var h = seq;
        h = (h + 2127912214 + (h << 12)) | 0;
        h = (h ^ -949894596 ^ (h >>> 19)) | 0;
        h = (h + 374761393 + (h << 5)) | 0;
        h = (h + -744332180 ^ (h << 9)) | 0;
        h = (h + -42973499 + (h << 3)) | 0;
        h = (h ^ -1252372727 ^ (h >>> 16)) | 0;

        var hash = (h >>> HASH_SHIFT) & HASH_MASK;

        // 3. Lookup
        var mIndex = (hashTable[hash] - 1) | 0;
        hashTable[hash] = sIndex + 1;

        // 4. Test Match
        // FIX: Added 'sIndex === mIndex' to prevent offset 0 on dirty hash tables.
        // FIX: The shift check (offset >>> 16) > 0 handles negative offsets (-1 >>> 16 = 65535) and >64k.
        // It does NOT catch 0.
        if (mIndex < 0 || sIndex === mIndex || ((sIndex - mIndex) >>> 16) > 0 ||
            (src[mIndex] | (src[mIndex + 1] << 8) | (src[mIndex + 2] << 16) | (src[mIndex + 3] << 24)) !== seq) {

            // No Match: Accelerate
            var mStep = (searchMatchCount++ >> 6) | 0;
            sIndex = (sIndex + mStep) | 0;
            continue;
        }

        // --- MATCH FOUND ---
        searchMatchCount = (1 << 6) + 3;

        // 5. Encode Literals
        var litLen = (sIndex - mAnchor) | 0;
        var tokenPos = dIndex++;

        if (litLen >= 15) {
            output[tokenPos] = 0xF0;
            var l = (litLen - 15) | 0;
            while (l >= 255) {
                output[dIndex++] = 255;
                l = (l - 255) | 0;
            }
            output[dIndex++] = l;
        } else {
            output[tokenPos] = (litLen << 4);
        }

        var litEnd = (dIndex + litLen) | 0;
        while (dIndex < litEnd) {
            output[dIndex++] = src[mAnchor++];
        }

        // 6. Encode Match Length
        var sPtr = (sIndex + 4) | 0;
        var mPtr = (mIndex + 4) | 0;

        while (sPtr < matchLimit && src[sPtr] === src[mPtr]) {
            sPtr = (sPtr + 1) | 0;
            mPtr = (mPtr + 1) | 0;
        }

        var matchLen = (sPtr - sIndex) | 0;

        // Write Offset
        var offset = (sIndex - mIndex) | 0;
        output[dIndex++] = offset & 0xff;
        output[dIndex++] = (offset >>> 8) & 0xff;

        // Write Length
        var lenCode = (matchLen - 4) | 0;
        if (lenCode >= 15) {
            output[tokenPos] |= 0x0F;
            var l = (lenCode - 15) | 0;
            while (l >= 255) {
                output[dIndex++] = 255;
                l = (l - 255) | 0;
            }
            output[dIndex++] = l;
        } else {
            output[tokenPos] |= lenCode;
        }

        sIndex = sPtr;
        mAnchor = sPtr;
    }

    // --- Final Literals ---
    var litLen = (sEnd - mAnchor) | 0;
    var tokenPos = dIndex++;

    if (litLen >= 15) {
        output[tokenPos] = 0xF0;
        var l = (litLen - 15) | 0;
        while (l >= 255) {
            output[dIndex++] = 255;
            l = (l - 255) | 0;
        }
        output[dIndex++] = l;
    } else {
        output[tokenPos] = (litLen << 4);
    }

    var litEnd = (dIndex + litLen) | 0;
    while (dIndex < litEnd) {
        output[dIndex++] = src[mAnchor++];
    }

    return dIndex | 0;
}