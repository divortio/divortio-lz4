/**
 * src/block/blockCompress.js
 * LZ4 Block Compression Kernel.
 * Optimized for V8: strict 32-bit integer math, reduced function calls, and inlined utilities.
 *
 * Implements "Prefix Mode" compression:
 * The `src` buffer is assumed to contain [Dictionary | InputBlock].
 * Compression starts at `srcStart` but matches can be found back to `srcStart - 65536`.
 */

import {
    MIN_MATCH,
    LAST_LITERALS,
    HASH_SEED,
    HASH_SHIFT,
    MAX_DISTANCE,
    MF_LIMIT,
    HASH_TABLE_SIZE
} from '../shared/constants.js';

/**
 * Compresses a block of data within a sliding window.
 *
 * @param {Uint8Array} src - The buffer containing history + current data.
 * @param {Uint8Array} output - The destination buffer.
 * @param {number} srcStart - The index in `src` where the current block begins.
 * @param {number} srcLen - The length of the current block to compress.
 * @param {Int32Array} hashTable - The reusable hash table (maps Hash -> Absolute Index).
 * @returns {number} The number of bytes written to output.
 */
export function compressBlock(src, output, srcStart, srcLen, hashTable) {
    // Local vars for V8 Optimization
    let inPos = srcStart | 0;
    let outPos = 0 | 0;
    let anchor = inPos;

    // The hard limit for input reading.
    // We cannot read past (End - LAST_LITERALS).
    const inputEnd = (srcStart + srcLen) | 0;
    const matchLimit = (inputEnd - LAST_LITERALS) | 0;

    // The "Match Finder" limit.
    // We stop searching for matches 12 bytes before the end (LAST_LITERALS + 7).
    // This allows the inner match-check loop to read 8 bytes safely without checking bounds every byte.
    const mfLimit = (inputEnd - MF_LIMIT) | 0;

    // Minimum index we can reference (Sliding Window of 64KB)
    // We cannot reference data older than MAX_DISTANCE or before index 0.
    const windowStart = Math.max(0, inPos - MAX_DISTANCE) | 0;

    // Only attempt compression if we have enough data
    if (srcLen >= MIN_MATCH) {
        let hashPos = inPos;

        // Main Loop: Search for matches until we hit the Match Finder Limit
        while (hashPos < mfLimit) {
            let matchIndex = -1 | 0;
            let offset = 0 | 0;

            // 1. Hash Generation (Next 4 bytes)
            // Manual read for performance (vs DataView)
            const sequence = (src[hashPos] | (src[hashPos + 1] << 8) | (src[hashPos + 2] << 16) | (src[hashPos + 3] << 24)) | 0;

            // Math.imul is the fastest way to do 32-bit multiplication in JS
            // (HASH_TABLE_SIZE - 1) is our mask (0x3FFF for 16KB)
            const hash = (Math.imul(sequence, HASH_SEED) >>> HASH_SHIFT) & (HASH_TABLE_SIZE - 1);

            // 2. Lookup & Update
            const refIndex = hashTable[hash] | 0;
            hashTable[hash] = hashPos;

            // 3. Match Verification
            // Conditions:
            // - refIndex is valid (not -1/empty)
            // - refIndex is within the 64KB window (refIndex >= windowStart)
            // - refIndex is strictly before current pos
            if (refIndex !== -1 && refIndex >= windowStart && refIndex < hashPos) {
                // We have a candidate, check the 4-byte sequence value
                // Safe to read here because hashPos < mfLimit ensures we are far from end
                const refSequence = (src[refIndex] | (src[refIndex + 1] << 8) | (src[refIndex + 2] << 16) | (src[refIndex + 3] << 24)) | 0;

                if (sequence === refSequence) {
                    matchIndex = refIndex;
                    offset = (hashPos - refIndex) | 0;
                }
            }

            // --- MATCH FOUND ---
            if (matchIndex > -1) {
                // A. Encode Literals (Difference between anchor and current position)
                const litLen = (hashPos - anchor) | 0;
                const tokenPos = outPos++;

                // Optimized Token/Length writing
                if (litLen >= 15) {
                    output[tokenPos] = 0xF0;
                    let l = (litLen - 15) | 0;
                    // Unroll 255 loop slightly? V8 handles simple loops well.
                    while (l >= 255) {
                        output[outPos++] = 255;
                        l = (l - 255) | 0;
                    }
                    output[outPos++] = l;
                } else {
                    output[tokenPos] = (litLen << 4);
                }

                // Copy Literals
                if (litLen > 0) {
                    // .set() is faster for larger chunks, loop is faster for tiny chunks (<16)
                    if (litLen < 16) {
                        for (let i = 0; i < litLen; i = (i + 1) | 0) {
                            output[outPos + i] = src[anchor + i];
                        }
                    } else {
                        output.set(src.subarray(anchor, hashPos), outPos);
                    }
                    outPos = (outPos + litLen) | 0;
                }

                // B. Encode Match Length
                // We already matched 4 bytes. Extend match forward.
                let matchLen = 4 | 0;

                // Max length we can check without crossing bounds
                // Note: We use matchLimit here (LAST_LITERALS), not mfLimit.
                // We can match up to the very last 5 bytes.
                const maxMatch = (inputEnd - LAST_LITERALS - hashPos) | 0;

                // Pointers for extension
                const sStart = (hashPos + 4) | 0;
                const rStart = (matchIndex + 4) | 0;

                // Byte-by-byte extension check
                // This is the hottest loop; ensure strict types.
                while (matchLen < maxMatch && src[sStart + matchLen - 4] === src[rStart + matchLen - 4]) {
                    matchLen = (matchLen + 1) | 0;
                }

                // C. Write Offset (Little Endian U16)
                // Inlined for speed
                output[outPos] = offset & 0xff;
                output[outPos + 1] = (offset >>> 8) & 0xff;
                outPos = (outPos + 2) | 0;

                // D. Write Match Length Code
                // The stored length is (actualLength - 4)
                const lenCode = (matchLen - 4) | 0;
                if (lenCode >= 15) {
                    output[tokenPos] |= 0x0F; // Add to existing token
                    let l = (lenCode - 15) | 0;
                    while (l >= 255) {
                        output[outPos++] = 255;
                        l = (l - 255) | 0;
                    }
                    output[outPos++] = l;
                } else {
                    output[tokenPos] |= lenCode;
                }

                // E. Prepare for next iteration
                inPos = (hashPos + matchLen) | 0;
                anchor = inPos;
                hashPos = inPos; // Skip hashing the bytes we just matched
                continue;
            }

            // No match found, step forward
            hashPos = (hashPos + 1) | 0;
        }
        inPos = hashPos;
    }

    // --- Final Literals ---
    // Write any remaining bytes from the anchor to the end of the block
    const litLen = (inputEnd - anchor) | 0;
    const tokenPos = outPos++;

    if (litLen >= 15) {
        output[tokenPos] = 0xF0;
        let l = (litLen - 15) | 0;
        while (l >= 255) {
            output[outPos++] = 255;
            l = (l - 255) | 0;
        }
        output[outPos++] = l;
    } else {
        output[tokenPos] = (litLen << 4);
    }

    if (litLen > 0) {
        if (litLen < 16) {
            for (let i = 0; i < litLen; i = (i + 1) | 0) {
                output[outPos + i] = src[anchor + i];
            }
        } else {
            output.set(src.subarray(anchor, inputEnd), outPos);
        }
        outPos = (outPos + litLen) | 0;
    }

    return outPos | 0;
}