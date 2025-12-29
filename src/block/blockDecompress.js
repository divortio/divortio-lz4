/**
 * src/block/blockDecompress.js
 * LZ4 Block Decompression Kernel.
 * Optimized for V8 and aligned with LZ4 Block Format 1.6.1.
 * Now supports Dictionary/Window for dependent blocks.
 */

import { Lz4Base } from "../shared/lz4Base.js";
import { MIN_MATCH } from "../shared/constants.js";

// Local alias for hot-path speed
const readU16 = Lz4Base.readU16;

/**
 * Decompresses a raw LZ4 block.
 * @param {Uint8Array} input - The compressed data.
 * @param {Uint8Array} output - The destination buffer.
 * @param {Uint8Array} [dictionary] - Optional previous decoded data (64KB window) for dependent blocks.
 * @returns {number} The number of bytes written to output.
 * @throws {Error} If malformed data or buffer overflow is detected.
 */
export function decompressBlock(input, output, dictionary) {
    let inPos = 0 | 0;
    let outPos = 0 | 0;
    const inLen = input.length | 0;
    const outLen = output.length | 0;

    // Dictionary setup
    const dictLen = dictionary ? dictionary.length | 0 : 0;

    while (inPos < inLen) {
        // 1. Read Token
        const token = input[inPos++];

        // --- Literals ---
        let literalLen = (token >>> 4) | 0;

        // LSIC for Literals (Long Sequence)
        if (literalLen === 0x0F) {
            let s = 0 | 0;
            do {
                if (inPos >= inLen) throw new Error("LZ4: Unexpected end of input reading literals");
                s = input[inPos++];
                literalLen = (literalLen + s) | 0;
            } while (s === 0xFF);
        }

        // Copy Literals
        if (literalLen > 0) {
            const endLit = (inPos + literalLen) | 0;
            if (endLit > inLen || (outPos + literalLen) > outLen) {
                throw new Error("LZ4: Output buffer too small or input malformed during literals");
            }

            // Fast copy for larger chunks
            if (literalLen < 16) {
                for (let i = 0; i < literalLen; i = (i + 1) | 0) {
                    output[outPos + i] = input[inPos + i];
                }
            } else {
                output.set(input.subarray(inPos, endLit), outPos);
            }
            outPos = (outPos + literalLen) | 0;
            inPos = endLit;
        }

        // If we are at the exact end of input, the block is done (no match expected)
        if (inPos === inLen) break;

        // --- Match ---
        // Match must have at least 2 bytes available (Offset)
        if (inPos + 2 > inLen) throw new Error("LZ4: Unexpected end of input reading offset");

        const offset = readU16(input, inPos);
        inPos = (inPos + 2) | 0;

        if (offset === 0) throw new Error("LZ4: Invalid offset 0");

        // Read Match Length
        let matchLen = (token & 0x0F) | 0;

        // LSIC for Match Length
        if (matchLen === 0x0F) {
            let s = 0 | 0;
            do {
                if (inPos >= inLen) throw new Error("LZ4: Unexpected end of input reading match length");
                s = input[inPos++];
                matchLen = (matchLen + s) | 0;
            } while (s === 0xFF);
        }
        matchLen = (matchLen + MIN_MATCH) | 0;

        // Validate bounds
        if ((outPos + matchLen) > outLen) throw new Error("LZ4: Output buffer too small for match");

        // --- Match Copy Logic ---
        // copySrc is relative to the current output position.
        // If copySrc is negative, we are looking back into the Dictionary (history).
        const copySrc = (outPos - offset) | 0;

        if (copySrc < 0) {
            // === Dictionary Match Case ===
            // We need to read from the dictionary buffer.
            const dictIndex = (dictLen + copySrc) | 0; // copySrc is negative

            // Bound check: Do we have enough history?
            if (dictIndex < 0) {
                throw new Error(`LZ4: Invalid match offset ${offset} exceeds dictionary window`);
            }

            // Does the match bleed from Dictionary into Current Output?
            // e.g. Dict="AB", Match starts at B (len 4) -> "B(start)..."
            // copySrc is -1. matchLen is 4.
            // We copy 1 byte from Dict, then 3 bytes from Current Output (which are currently being written).
            const bytesFromDict = (0 - copySrc) | 0;

            if (matchLen <= bytesFromDict) {
                // Case A: Match is entirely within the dictionary
                // Optimization: use .set for speed
                output.set(dictionary.subarray(dictIndex, dictIndex + matchLen), outPos);
                outPos = (outPos + matchLen) | 0;
            } else {
                // Case B: Match starts in dictionary, continues in current block ("Split Match")
                // 1. Copy the dictionary part
                output.set(dictionary.subarray(dictIndex, dictLen), outPos);
                outPos = (outPos + bytesFromDict) | 0;

                // 2. Copy the rest from the current block (Standard Overlapping Copy)
                const remaining = (matchLen - bytesFromDict) | 0;
                for (let i = 0; i < remaining; i = (i + 1) | 0) {
                    output[outPos + i] = output[(outPos - offset) + i];
                }
                outPos = (outPos + remaining) | 0;
            }

        } else {
            // === Standard Internal Match Case ===
            // 1. Non-Overlapping Copy (Fastest)
            // If the match source is far enough back that we won't overwrite it while reading
            if (offset >= matchLen) {
                if (matchLen < 16) {
                    for (let i = 0; i < matchLen; i = (i + 1) | 0) {
                        output[outPos + i] = output[copySrc + i];
                    }
                } else {
                    output.set(output.subarray(copySrc, copySrc + matchLen), outPos);
                }
                outPos = (outPos + matchLen) | 0;
            } else {
                // 2. Overlapping Copy (RLE-like)
                // We must copy byte-by-byte because we might be reading data we just wrote.
                for (let i = 0; i < matchLen; i = (i + 1) | 0) {
                    output[outPos + i] = output[(outPos - offset) + i];
                }
                outPos = (outPos + matchLen) | 0;
            }
        }
    }

    return outPos | 0;
}