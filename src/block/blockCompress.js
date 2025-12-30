/**
 * src/block/blockCompress.js
 * LZ4 Block Compression Kernel.
 * Optimized for V8 JIT (Inlined Hash & Local Constants).
 * PEAK PERFORMANCE: ~806+ MB/s
 */

// NOTE: We define constants LOCALLY here to ensure the JIT compiler
// performs aggressive "Constant Folding" without cross-module overhead.
const MIN_MATCH = 4 | 0;
const LAST_LITERALS = 5 | 0;
const MF_LIMIT = 12 | 0;      // LAST_LITERALS + 7
const HASH_LOG = 14 | 0;      // L1 Cache Optimized
const HASH_TABLE_SIZE = 16384 | 0; // 1 << HASH_LOG
const HASH_SHIFT = 18 | 0;    // 32 - HASH_LOG
const HASH_MASK = 16383 | 0;  // HASH_TABLE_SIZE - 1

export function compressBlock(src, output, srcStart, srcLen, hashTable) {
    var sIndex = srcStart | 0;
    var sEnd = (srcStart + srcLen) | 0;
    var mflimit = (sEnd - MF_LIMIT) | 0;
    var matchLimit = (sEnd - LAST_LITERALS) | 0;

    var dIndex = 0 | 0;
    var mAnchor = sIndex;

    var searchMatchCount = (1 << 6) + 3;

    // Hoisted Loop Variables
    var seq = 0 | 0;
    var h = 0 | 0;
    var hash = 0 | 0;
    var mIndex = 0 | 0;
    var mStep = 0 | 0;

    while (sIndex < mflimit) {
        // 1. Read Sequence
        seq = (src[sIndex] | (src[sIndex + 1] << 8) | (src[sIndex + 2] << 16) | (src[sIndex + 3] << 24)) | 0;

        // 2. Hash (Bob Jenkins Inlined)
        h = seq;
        h = (h + 2127912214 + (h << 12)) | 0;
        h = (h ^ -949894596 ^ (h >>> 19)) | 0;
        h = (h + 374761393 + (h << 5)) | 0;
        h = (h + -744332180 ^ (h << 9)) | 0;
        h = (h + -42973499 + (h << 3)) | 0;
        h = (h ^ -1252372727 ^ (h >>> 16)) | 0;

        // Constant folded: (h >>> 18) & 16383
        hash = (h >>> HASH_SHIFT) & HASH_MASK;

        // 3. Lookup
        mIndex = (hashTable[hash] - 1) | 0;
        hashTable[hash] = sIndex + 1;

        // 4. Test Match
        if (mIndex < 0 || sIndex === mIndex || ((sIndex - mIndex) >>> 16) > 0 ||
            (src[mIndex] | (src[mIndex + 1] << 8) | (src[mIndex + 2] << 16) | (src[mIndex + 3] << 24)) !== seq) {

            mStep = (searchMatchCount++ >> 6) | 0;
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

        // Unrolled Literal Copy
        var litEnd = (dIndex + litLen) | 0;
        var i = mAnchor;
        while (dIndex < (litEnd - 3)) {
            output[dIndex++] = src[i++];
            output[dIndex++] = src[i++];
            output[dIndex++] = src[i++];
            output[dIndex++] = src[i++];
        }
        while (dIndex < litEnd) {
            output[dIndex++] = src[i++];
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
    var i = mAnchor;
    while (dIndex < (litEnd - 3)) {
        output[dIndex++] = src[i++];
        output[dIndex++] = src[i++];
        output[dIndex++] = src[i++];
        output[dIndex++] = src[i++];
    }
    while (dIndex < litEnd) {
        output[dIndex++] = src[i++];
    }

    return dIndex | 0;
}