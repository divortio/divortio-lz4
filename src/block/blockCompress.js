/**
 * src/block/blockCompress.js
 * * @fileoverview Core LZ4 Block Compression Kernel.
 * This module implements the raw LZ4 block compression algorithm. It is heavily tuned
 * for V8 (Node.js/Chrome) performance, utilizing:
 * - Integer math optimization (`| 0`) to force 32-bit integer execution paths.
 * - Hash table lookups for deduplication.
 * - Unrolled loops for literal copying to reduce branching overhead.
 * - Overlapping write strategies for small buffers to avoid bounds checks.
 * * @module blockCompress
 */

const LAST_LITERALS = 5 | 0;
const MF_LIMIT = 12 | 0;
const HASH_SHIFT = 18 | 0;
const HASH_MASK = 16383 | 0;
const HASH_MULTIPLIER = 2654435761 | 0;

/**
 * Compresses a single block of data using the LZ4 algorithm.
 * * This low-level function writes compressed sequences directly into the `output` buffer.
 * It does not handle frame headers, checksums, or memory allocation.
 * @param {Uint8Array} src - The source buffer containing the raw input data.
 * @param {Uint8Array} output - The destination buffer for compressed data.
 * @param {number} srcStart - The starting offset in the `src` buffer.
 * @param {number} srcLen - The length of the data to compress in this block.
 * @param {Int32Array} hashTable - A pre-allocated hash table (16k entries) for match finding.
 * @param {number} outputOffset - The starting offset in the `output` buffer to write to.
 * @returns {number} The number of bytes written to the `output` buffer.
 */
export function compressBlock(src, output, srcStart, srcLen, hashTable, outputOffset) {
    var sIndex = srcStart | 0;
    var sEnd = (srcStart + srcLen) | 0;
    var mflimit = (sEnd - MF_LIMIT) | 0;
    var matchLimit = (sEnd - LAST_LITERALS) | 0;

    var dIndex = outputOffset | 0;
    var mAnchor = sIndex;

    var searchMatchCount = (1 << 6) + 3;

    var seq = 0 | 0;
    var hash = 0 | 0;
    var mIndex = 0 | 0;
    var mStep = 0 | 0;

    // --- Main Compression Loop ---
    while (sIndex < mflimit) {
        // Read 4 bytes (sequence) at sIndex
        seq = (src[sIndex] | (src[sIndex + 1] << 8) | (src[sIndex + 2] << 16) | (src[sIndex + 3] << 24)) | 0;

        // Hash the sequence to find potential matches
        hash = (Math.imul(seq, HASH_MULTIPLIER) >>> HASH_SHIFT) & HASH_MASK;
        mIndex = (hashTable[hash] - 1) | 0;
        hashTable[hash] = sIndex + 1;

        // Verify Match:
        // 1. mIndex must be valid (>= 0)
        // 2. We cannot match the current position itself (sIndex === mIndex)
        // 3. Distance check: (sIndex - mIndex) must be within 64k window (>>> 16 === 0)
        // 4. Content check: The data at mIndex must match the current sequence
        if (mIndex < 0 || sIndex === mIndex || ((sIndex - mIndex) >>> 16) > 0 ||
            (src[mIndex] | (src[mIndex + 1] << 8) | (src[mIndex + 2] << 16) | (src[mIndex + 3] << 24)) !== seq) {

            // No match found: Skip forward
            mStep = (searchMatchCount++ >> 6) | 0;
            sIndex = (sIndex + mStep) | 0;
            continue;
        }

        searchMatchCount = (1 << 6) + 3;

        // --- Match Found: Encode Literals ---
        // Calculate the number of literal bytes (non-matching) before this match
        var litLen = (sIndex - mAnchor) | 0;
        var tokenPos = dIndex++;

        // Write literal length token
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

        // --- Copy Literals (Tuned) ---
        if (litLen > 0) {
            var litSrc = mAnchor;
            var litEnd = (dIndex + litLen) | 0;

            // TUNING: Threshold set to 64.
            // < 64: JS loop is competitive & avoids GC allocation.
            // > 64: Native set() speed outweighs the GC cost of subarray().
            if (litLen > 64) {
                output.set(src.subarray(litSrc, litSrc + litLen), dIndex);
                dIndex = litEnd;
            } else {
                // Optimized Small Copy Strategy

                // 1. Unroll 8 bytes
                var litLoopEnd = (litEnd - 8) | 0;
                while (dIndex < litLoopEnd) {
                    output[dIndex++] = src[litSrc++];
                    output[dIndex++] = src[litSrc++];
                    output[dIndex++] = src[litSrc++];
                    output[dIndex++] = src[litSrc++];
                    output[dIndex++] = src[litSrc++];
                    output[dIndex++] = src[litSrc++];
                    output[dIndex++] = src[litSrc++];
                    output[dIndex++] = src[litSrc++];
                }

                // 2. Overlapping Final Write (Double-Copy Tail)
                // If we have >= 8 bytes total, we copy the LAST 8 bytes of the block.
                // This overlaps with previous writes but avoids branch misprediction on tiny tails.
                if (litLen >= 8) {
                    var tailOut = (litEnd - 8) | 0;
                    var tailSrc = (mAnchor + litLen - 8) | 0;
                    output[tailOut]   = src[tailSrc];
                    output[tailOut+1] = src[tailSrc+1];
                    output[tailOut+2] = src[tailSrc+2];
                    output[tailOut+3] = src[tailSrc+3];
                    output[tailOut+4] = src[tailSrc+4];
                    output[tailOut+5] = src[tailSrc+5];
                    output[tailOut+6] = src[tailSrc+6];
                    output[tailOut+7] = src[tailSrc+7];
                    dIndex = litEnd;
                } else {
                    // Tiny Copy (0-7 bytes) - fall back to standard loop
                    while (dIndex < litEnd) {
                        output[dIndex++] = src[litSrc++];
                    }
                }
            }
        }

        // --- Encode Match ---
        var sPtr = (sIndex + 4) | 0;
        var mPtr = (mIndex + 4) | 0;

        // Find match length
        while (sPtr < matchLimit && src[sPtr] === src[mPtr]) {
            sPtr = (sPtr + 1) | 0;
            mPtr = (mPtr + 1) | 0;
        }

        var matchLen = (sPtr - sIndex) | 0;
        var offset = (sIndex - mIndex) | 0;

        // Write Offset (Little Endian)
        output[dIndex++] = offset & 0xff;
        output[dIndex++] = (offset >>> 8) & 0xff;

        // Write Match Length
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

    // --- Final Literals (Tail) ---
    // Handle any remaining data after the last match
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

    var litSrc = mAnchor;
    if (litLen > 0) {
        var litEnd = (dIndex + litLen) | 0;
        if (litLen > 64) {
            output.set(src.subarray(litSrc, litSrc + litLen), dIndex);
            dIndex = litEnd;
        } else {
            // Unroll 8
            var litLoopEnd = (litEnd - 8) | 0;
            while (dIndex < litLoopEnd) {
                output[dIndex++] = src[litSrc++];
                output[dIndex++] = src[litSrc++];
                output[dIndex++] = src[litSrc++];
                output[dIndex++] = src[litSrc++];
                output[dIndex++] = src[litSrc++];
                output[dIndex++] = src[litSrc++];
                output[dIndex++] = src[litSrc++];
                output[dIndex++] = src[litSrc++];
            }
            // Overlapping Tail
            if (litLen >= 8) {
                var tailOut = (litEnd - 8) | 0;
                var tailSrc = (mAnchor + litLen - 8) | 0;
                output[tailOut]   = src[tailSrc];
                output[tailOut+1] = src[tailSrc+1];
                output[tailOut+2] = src[tailSrc+2];
                output[tailOut+3] = src[tailSrc+3];
                output[tailOut+4] = src[tailSrc+4];
                output[tailOut+5] = src[tailSrc+5];
                output[tailOut+6] = src[tailSrc+6];
                output[tailOut+7] = src[tailSrc+7];
                dIndex = litEnd;
            } else {
                while (dIndex < litEnd) output[dIndex++] = src[litSrc++];
            }
        }
    }

    return (dIndex - outputOffset) | 0;
}