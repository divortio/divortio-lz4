import { LZ4Base, MIN_MATCH } from '../lz4.common.js';

/**
 * src/blockDecompress.js
 * LZ4 Block Decompression Kernel.
 * Optimized for V8.
 */

// Local alias for hot-path speed
const readU16 = LZ4Base.readU16;

/**
 * Decompresses a raw LZ4 block.
 * @param {Uint8Array} input - The compressed data.
 * @param {Uint8Array} output - The destination buffer.
 * @returns {number} The number of bytes written to output.
 */
export function decompressBlock(input, output) {
    let inPos = 0 | 0;
    let outPos = 0 | 0;
    const inLen = input.length | 0;
    const outLen = output.length | 0;

    while (inPos < inLen) {
        // 1. Read Token
        const token = input[inPos++];

        // --- Literals ---
        let literalLen = (token >>> 4) | 0;

        // LSIC for Literals
        if (literalLen === 0x0F) {
            let s = 0 | 0;
            do {
                s = input[inPos++];
                literalLen = (literalLen + s) | 0;
            } while (s === 0xFF);
        }

        // Copy Literals
        if (literalLen > 0) {
            if ((outPos + literalLen) > outLen) throw new Error("LZ4 Error: Output buffer too small");

            const endLit = (inPos + literalLen) | 0;

            if (literalLen < 16) {
                // Small copy unroll
                for (let i = 0; i < literalLen; i = (i + 1) | 0) {
                    output[outPos + i] = input[inPos + i];
                }
                outPos = (outPos + literalLen) | 0;
                inPos = endLit;
            } else {
                // Large copy
                output.set(input.subarray(inPos, endLit), outPos);
                outPos = (outPos + literalLen) | 0;
                inPos = endLit;
            }
        }

        if (inPos >= inLen) break;

        // --- Match ---
        // Read Offset
        const offset = readU16(input, inPos);
        inPos = (inPos + 2) | 0;

        if (offset === 0) throw new Error("LZ4 Error: Invalid offset 0");

        // Read Match Length
        let matchLen = (token & 0x0F) | 0;

        // LSIC for Match
        if (matchLen === 0x0F) {
            let s = 0 | 0;
            do {
                s = input[inPos++];
                matchLen = (matchLen + s) | 0;
            } while (s === 0xFF);
        }
        matchLen = (matchLen + MIN_MATCH) | 0;

        const copySrc = (outPos - offset) | 0;
        if (copySrc < 0) throw new Error("LZ4 Error: Invalid match offset");
        if ((outPos + matchLen) > outLen) throw new Error("LZ4 Error: Output buffer too small");

        // Copy Match
        if (offset >= matchLen) {
            // Non-overlapping fast copy
            if (matchLen < 16) {
                for (let i = 0; i < matchLen; i = (i+1)|0) output[outPos + i] = output[copySrc + i];
            } else {
                output.set(output.subarray(copySrc, copySrc + matchLen), outPos);
            }
            outPos = (outPos + matchLen) | 0;
        } else {
            // Overlapping copy (byte-by-byte for RLE-like)
            for (let i = 0; i < matchLen; i = (i+1)|0) {
                output[outPos++] = output[copySrc + i];
            }
        }
    }

    return outPos | 0;
}