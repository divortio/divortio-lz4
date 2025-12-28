import {
    MIN_MATCH, LAST_LITERALS, HASH_SEED, HASH_SHIFT, MAX_DISTANCE
} from '../shared/constants.js';
import {Lz4Base} from "../shared/lz4Base.js";

/**
 * src/blockCompress.js
 * LZ4 Block Compression Kernel.
 * Optimized for V8: local aliases, strict 32-bit math.
 */

// Local alias for hot-path speed
const writeU16 = Lz4Base.writeU16;

/**
 * LZ4 Hash Function.
 * Uses Math.imul for fast 32-bit multiplication.
 */
function hashSequence(value) {
    return (Math.imul(value, HASH_SEED) >>> HASH_SHIFT) & 0x3FFF;
}

/**
 * Compresses a raw LZ4 block.
 * @param {Uint8Array} input - The raw data.
 * @param {Uint8Array} output - The destination buffer.
 * @param {Uint16Array} hashTable - A reusable hash table (16KB).
 * @returns {number} The number of bytes written to output.
 */
export function compressBlock(input, output, hashTable) {
    let inPos = 0 | 0;
    let outPos = 0 | 0;
    let anchor = 0 | 0;
    const len = input.length | 0;
    const limit = (len - LAST_LITERALS) | 0;

    hashTable.fill(0xFFFF);

    if (len >= MIN_MATCH) {
        let hashPos = inPos;

        while (hashPos < limit) {
            let matchIndex = -1 | 0;
            let offset = 0 | 0;

            // Read 4 bytes as 32-bit integer for hashing
            const sequence = (input[hashPos] | (input[hashPos+1]<<8) | (input[hashPos+2]<<16) | (input[hashPos+3]<<24)) | 0;
            const hash = hashSequence(sequence);
            const refIndex = hashTable[hash];
            hashTable[hash] = hashPos;

            // Check if we have a valid match candidate
            if (refIndex !== 0xFFFF) {
                const dist = (hashPos - refIndex) | 0;
                // Check MAX_DISTANCE (64KB window)
                if (dist < MAX_DISTANCE) {
                    const refSequence = (input[refIndex] | (input[refIndex+1]<<8) | (input[refIndex+2]<<16) | (input[refIndex+3]<<24)) | 0;
                    // Exact 4-byte match check
                    if (sequence === refSequence) {
                        matchIndex = refIndex;
                        offset = dist;
                    }
                }
            }

            if (matchIndex > -1) {
                // --- MATCH FOUND ---

                // 1. Encode Literals
                const litLen = (hashPos - anchor) | 0;
                const tokenPos = outPos++;
                let token = 0;

                if (litLen >= 15) {
                    token = 0xF0;
                    let l = (litLen - 15) | 0;
                    while (l >= 255) {
                        output[outPos++] = 255;
                        l = (l - 255) | 0;
                    }
                    output[outPos++] = l;
                } else {
                    token = (litLen << 4);
                }

                // Copy Literals
                if (litLen > 0) {
                    if (litLen < 16) {
                        // Small copy unroll
                        for (let i = 0; i < litLen; i=(i+1)|0) output[outPos + i] = input[anchor + i];
                        outPos = (outPos + litLen) | 0;
                    } else {
                        // Large copy
                        output.set(input.subarray(anchor, hashPos), outPos);
                        outPos = (outPos + litLen) | 0;
                    }
                }

                // 2. Extend Match Length
                let matchLen = 4 | 0;
                const maxMatch = (len - LAST_LITERALS - hashPos) | 0;
                const sStart = (hashPos + 4) | 0;
                const rStart = (matchIndex + 4) | 0;

                // Byte-by-byte extension
                while (matchLen < maxMatch && input[sStart + matchLen - 4] === input[rStart + matchLen - 4]) {
                    matchLen = (matchLen + 1) | 0;
                }

                // 3. Write Offset & Match Length
                writeU16(output, offset, outPos);
                outPos = (outPos + 2) | 0;

                const lenCode = (matchLen - 4) | 0;
                if (lenCode >= 15) {
                    token |= 0x0F;
                    output[tokenPos] = token;

                    let l = (lenCode - 15) | 0;
                    while (l >= 255) {
                        output[outPos++] = 255;
                        l = (l - 255) | 0;
                    }
                    output[outPos++] = l;
                } else {
                    token |= lenCode;
                    output[tokenPos] = token;
                }

                // Update State
                inPos = (hashPos + matchLen) | 0;
                anchor = inPos;
                hashPos = inPos;
                continue;
            }
            hashPos = (hashPos + 1) | 0;
        }
        inPos = hashPos;
    }

    // --- Final Literals ---
    const litLen = (len - anchor) | 0;
    const tokenPos = outPos++;
    let token = 0;

    if (litLen >= 15) {
        token = 0xF0;
        let l = (litLen - 15) | 0;
        while (l >= 255) {
            output[outPos++] = 255;
            l = (l - 255) | 0;
        }
        output[outPos++] = l;
    } else {
        token = (litLen << 4);
    }

    output[tokenPos] = token;

    if (litLen > 0) {
        if (litLen < 16) {
            for (let i = 0; i < litLen; i=(i+1)|0) output[outPos + i] = input[anchor + i];
            outPos = (outPos + litLen) | 0;
        } else {
            output.set(input.subarray(anchor, len), outPos);
            outPos = (outPos + litLen) | 0;
        }
    }

    return outPos | 0;
}