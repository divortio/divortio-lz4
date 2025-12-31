/**
 * src/block/blockCompress.js
 * * LZ4 Block Compression Kernel.
 * * This is the high-performance core of the compressor. It is heavily optimized for the
 * V8 JavaScript engine (Node.js/Chrome) using the following techniques:
 * * 1. **Zero Allocation**: Writes directly to a pre-allocated output buffer to avoid GC overhead.
 * 2. **Static Types**: Uses bitwise operations (`| 0`) to force V8 to use 32-bit integer registers.
 * 3. **Double-Copy Literals**: Copies 8 bytes at a time for literals, using overlapping writes
 * for tails to avoid expensive byte-by-byte loops.
 * 4. **Fibonacci Hash**: Uses the standard LZ4 multiplicative hash (Math.imul) for maximum throughput.
 * @module blockCompress
 */

// --- Constants (Hoisted for Constant Folding) ---

/** Minimum literals required at the end of the block (LZ4 Spec). */
const LAST_LITERALS = 5 | 0;

/** Minimum parsing limit (12 bytes) to ensure safety. */
const MF_LIMIT = 12 | 0; // LAST_LITERALS + 7

/** Shift amount to extract the hash index (32 - 14 = 18). */
const HASH_SHIFT = 18 | 0;

/** Mask to ensure hash index stays within bounds (16383). */
const HASH_MASK = 16383 | 0;

/** Constant for Multiplicative Hash (Knuth / Fibonacci) */
const HASH_MULTIPLIER = 2654435761 | 0;

/**
 * Compresses a single block of data using the LZ4 algorithm.
 * @param {Uint8Array} src - The source input buffer.
 * @param {Uint8Array} output - The destination output buffer.
 * @param {number} srcStart - The start offset in the source buffer.
 * @param {number} srcLen - The number of bytes to compress.
 * @param {Int32Array} hashTable - A pre-allocated 16K Int32Array for match finding.
 * Must be cleared (filled with 0) before use, unless valid history exists.
 * @param {number} outputOffset - The offset in the output buffer to start writing.
 * @returns {number} The final offset in the output buffer (pointing to the byte after the last written byte).
 */
export function compressBlock(src, output, srcStart, srcLen, hashTable, outputOffset) {
    // V8 Optimization: Force 32-bit integer types
    var sIndex = srcStart | 0;
    var sEnd = (srcStart + srcLen) | 0;
    var mflimit = (sEnd - MF_LIMIT) | 0;
    var matchLimit = (sEnd - LAST_LITERALS) | 0;

    var dIndex = outputOffset | 0;
    var mAnchor = sIndex;

    var searchMatchCount = (1 << 6) + 3;

    // Hoisted Loop Variables (Prevents allocation in hot loop)
    var seq = 0 | 0;
    var hash = 0 | 0;
    var mIndex = 0 | 0;
    var mStep = 0 | 0;

    // Main Search Loop
    while (sIndex < mflimit) {
        // 1. Read 4-byte Sequence
        // Read 32-bit integer (little-endian) manually to avoid DataView overhead
        seq = (src[sIndex] | (src[sIndex + 1] << 8) | (src[sIndex + 2] << 16) | (src[sIndex + 3] << 24)) | 0;

        // 2. Hash (Fibonacci / Multiplicative)
        // Replaces the complex Jenkins hash with the standard LZ4 hash.
        // This is significantly faster in V8 (single multiplication vs 6+ ops)
        hash = (Math.imul(seq, HASH_MULTIPLIER) >>> HASH_SHIFT) & HASH_MASK;

        // 3. Lookup Match
        // We store positions as (index + 1) to distinguish 0 (empty) from index 0.
        // Therefore we subtract 1 on retrieval.
        mIndex = (hashTable[hash] - 1) | 0;
        hashTable[hash] = sIndex + 1;

        // 4. Validate Match
        // Conditions:
        // - mIndex must be valid (>= 0)
        // - mIndex must be strictly less than current sIndex
        // - Distance must be within 64KB (MAX_DISTANCE) - check: ((sIndex - mIndex) >>> 16) > 0
        // - The sequence at mIndex must actually match the sequence at sIndex (collision check)
        if (mIndex < 0 || sIndex === mIndex || ((sIndex - mIndex) >>> 16) > 0 ||
            (src[mIndex] | (src[mIndex + 1] << 8) | (src[mIndex + 2] << 16) | (src[mIndex + 3] << 24)) !== seq) {

            // No match: Advance parsing position
            // Uses a "Step Skip" heuristic to speed up incompressible data scanning
            mStep = (searchMatchCount++ >> 6) | 0;
            sIndex = (sIndex + mStep) | 0;
            continue;
        }

        // --- MATCH FOUND ---
        searchMatchCount = (1 << 6) + 3; // Reset skip step

        // 5. Encode Literals
        // Literals are the bytes between the last match (mAnchor) and the current match (sIndex)
        var litLen = (sIndex - mAnchor) | 0;
        var tokenPos = dIndex++;

        // Write Token (Literal Length part)
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

        // Copy Literals (Optimized)
        if (litLen > 0) {
            var litSrc = mAnchor;
            if (litLen >= 8) {
                var litEnd = (dIndex + litLen) | 0;

                // For very large copies, use native set()
                if (litLen > 32) {
                    output.set(src.subarray(litSrc, litSrc + litLen), dIndex);
                    dIndex = litEnd;
                } else {
                    // "Unroll 8": Copy 8 bytes at a time manually.
                    // This is faster than a loop for small-medium sizes in V8.
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
                    // "Double Copy Tail": Copy the LAST 8 bytes overlappingly.
                    // This avoids a byte-by-byte tail loop.
                    var tailOut = (litEnd - 8) | 0;
                    var tailSrc = (litSrc + (litEnd - dIndex) - 8) | 0;
                    output[tailOut] = src[tailSrc];
                    output[tailOut+1] = src[tailSrc+1];
                    output[tailOut+2] = src[tailSrc+2];
                    output[tailOut+3] = src[tailSrc+3];
                    output[tailOut+4] = src[tailSrc+4];
                    output[tailOut+5] = src[tailSrc+5];
                    output[tailOut+6] = src[tailSrc+6];
                    output[tailOut+7] = src[tailSrc+7];
                    dIndex = litEnd;
                }
            } else {
                // Tiny Literals (1-7 bytes): Byte loop
                while (litLen-- > 0) output[dIndex++] = src[litSrc++];
            }
        }

        // 6. Encode Match Length
        // We found a match at sIndex vs mIndex. We already know the first 4 bytes match.
        // Check how much longer it goes.
        var sPtr = (sIndex + 4) | 0;
        var mPtr = (mIndex + 4) | 0;

        // Match Extension Loop (Standard Byte Loop)
        // REVERTED: Manual 4-byte check was slower in V8 due to manual integer construction costs.
        // V8 optimizes this simple loop very effectively.
        while (sPtr < matchLimit && src[sPtr] === src[mPtr]) {
            sPtr = (sPtr + 1) | 0;
            mPtr = (mPtr + 1) | 0;
        }

        var matchLen = (sPtr - sIndex) | 0;

        // Write Match Offset (Little Endian)
        var offset = (sIndex - mIndex) | 0;
        output[dIndex++] = offset & 0xff;
        output[dIndex++] = (offset >>> 8) & 0xff;

        // Write Match Length
        // (min match is 4, so we subtract 4)
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

        // Prepare for next iteration
        sIndex = sPtr;
        mAnchor = sPtr;
    }

    // --- Final Literals (Tail) ---
    // Copy any remaining bytes after the last match
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

    // Copy Final Literals
    var litSrc = mAnchor;
    if (litLen > 0) {
        if (litLen >= 8) {
            var litEnd = (dIndex + litLen) | 0;
            if (litLen > 32) {
                output.set(src.subarray(litSrc, litSrc + litLen), dIndex);
                dIndex = litEnd;
            } else {
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
                var tailOut = (litEnd - 8) | 0;
                var tailSrc = (litSrc + (litEnd - dIndex) - 8) | 0;
                output[tailOut] = src[tailSrc];
                output[tailOut+1] = src[tailSrc+1];
                output[tailOut+2] = src[tailSrc+2];
                output[tailOut+3] = src[tailSrc+3];
                output[tailOut+4] = src[tailSrc+4];
                output[tailOut+5] = src[tailSrc+5];
                output[tailOut+6] = src[tailSrc+6];
                output[tailOut+7] = src[tailSrc+7];
                dIndex = litEnd;
            }
        } else {
            while (litLen-- > 0) output[dIndex++] = src[litSrc++];
        }
    }

    // Return the total size of compressed data written to output
    return (dIndex - outputOffset) | 0;
}