/**
 * src/block/blockDecompress.js
 * LZ4 Block Decompression Kernel.
 * Optimized for V8 with native intrinsics and edge-case handling.
 */

import { MIN_MATCH } from "../shared/constants.js";

/**
 * Decompresses a raw LZ4 block.
 * @param {Uint8Array} input - The compressed data.
 * @param {Uint8Array} output - The destination buffer.
 * @param {Uint8Array} [dictionary] - Optional previous decoded data.
 * @returns {number} The number of bytes written to output.
 */
export function decompressBlock(input, output, dictionary) {
    // V8: Use vars for hot path performance
    var inPos = 0 | 0;
    var outPos = 0 | 0;
    var inLen = input.length | 0;
    var outLen = output.length | 0;

    var dictLen = dictionary ? dictionary.length | 0 : 0;

    while (inPos < inLen) {
        // 1. Read Token
        var token = input[inPos++];

        // --- Literals ---
        var literalLen = (token >>> 4) | 0;

        if (literalLen === 0x0F) {
            var s = 0 | 0;
            do {
                if (inPos >= inLen) throw new Error("LZ4: Unexpected end of input reading literals");
                s = input[inPos++];
                literalLen = (literalLen + s) | 0;
            } while (s === 0xFF);
        }

        // Copy Literals
        if (literalLen > 0) {
            var endLit = (inPos + literalLen) | 0;
            if (endLit > inLen || (outPos + literalLen) > outLen) {
                throw new Error("LZ4: Output buffer too small or input malformed during literals");
            }

            // Simple loop is fastest for the mixture of small/medium literals common in LZ4
            while (inPos < endLit) {
                output[outPos++] = input[inPos++];
            }
        }

        if (inPos === inLen) break;

        // --- Match ---
        // Offset (16-bit Little Endian)
        if (inPos + 2 > inLen) throw new Error("LZ4: Unexpected end of input reading offset");
        var offset = (input[inPos] | (input[inPos + 1] << 8)) | 0;
        inPos = (inPos + 2) | 0;

        if (offset === 0) throw new Error("LZ4: Invalid offset 0");

        // Match Length
        var matchLen = (token & 0x0F) | 0;
        if (matchLen === 0x0F) {
            var s = 0 | 0;
            do {
                if (inPos >= inLen) throw new Error("LZ4: Unexpected end of input reading match length");
                s = input[inPos++];
                matchLen = (matchLen + s) | 0;
            } while (s === 0xFF);
        }
        matchLen = (matchLen + MIN_MATCH) | 0;

        // Bounds check
        if ((outPos + matchLen) > outLen) throw new Error("LZ4: Output buffer too small for match");

        // --- Match Copy Logic ---
        var copySrc = (outPos - offset) | 0;

        // 1. Dictionary Match (Negative index)
        if (copySrc < 0) {
            var dictIndex = (dictLen + copySrc) | 0;
            if (dictIndex < 0) throw new Error(`LZ4: Invalid match offset ${offset} exceeds dictionary window`);

            var bytesFromDict = (0 - copySrc) | 0;

            if (matchLen <= bytesFromDict) {
                // Entirely within dictionary
                // Unrolled loop for dictionary copy
                var endIndex = (dictIndex + matchLen) | 0;
                while (dictIndex < (endIndex - 3)) {
                    output[outPos++] = dictionary[dictIndex++];
                    output[outPos++] = dictionary[dictIndex++];
                    output[outPos++] = dictionary[dictIndex++];
                    output[outPos++] = dictionary[dictIndex++];
                }
                while (dictIndex < endIndex) output[outPos++] = dictionary[dictIndex++];
            } else {
                // Split Match: Dict part
                while (dictIndex < dictLen) output[outPos++] = dictionary[dictIndex++];

                // Split Match: Output part (Overlap logic)
                // Fallthrough to overlap copy manually
                var remaining = (matchLen - bytesFromDict) | 0;
                var endMatch = (outPos + remaining) | 0;
                var readPtr = (outPos - offset) | 0;
                while (outPos < endMatch) output[outPos++] = output[readPtr++];
            }
        }
        // 2. Internal Match
        else {
            // OPTIMIZATION 1: RLE -> memset
            if (offset === 1) {
                output.fill(output[copySrc], outPos, outPos + matchLen);
                outPos = (outPos + matchLen) | 0;
            }
                // OPTIMIZATION 2: Non-Overlapping -> memmove
                // FIX: Changed > to >=. If offset == matchLen, the regions are adjacent but distinct.
            // This captures the "Repeat String" pattern perfectly.
            else if (offset >= matchLen && matchLen > 16) {
                output.copyWithin(outPos, copySrc, copySrc + matchLen);
                outPos = (outPos + matchLen) | 0;
            }
            // General Copy (Unrolled if safe)
            else {
                var endMatch = (outPos + matchLen) | 0;
                var readPtr = copySrc;

                // Safe to unroll if overlap distance >= 4 bytes
                if (offset >= 4) {
                    while (outPos < (endMatch - 3)) {
                        output[outPos++] = output[readPtr++];
                        output[outPos++] = output[readPtr++];
                        output[outPos++] = output[readPtr++];
                        output[outPos++] = output[readPtr++];
                    }
                }
                // Fallback for tight overlaps or remainder
                while (outPos < endMatch) {
                    output[outPos++] = output[readPtr++];
                }
            }
        }
    }

    return outPos | 0;
}