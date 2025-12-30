/**
 * src/block/blockDecompress.js
 * LZ4 Block Decompression Kernel.
 * Optimized for V8 with native intrinsics, constant folding, and loop unrolling.
 */

// --- Localized Constants for V8 Optimization ---
const MIN_MATCH = 4 | 0;

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

    // Hoisted variables to prevent stack thrashing in hot loop
    var token = 0 | 0;
    var literalLen = 0 | 0;
    var matchLen = 0 | 0;
    var offset = 0 | 0;
    var endLit = 0 | 0;
    var s = 0 | 0;
    var copySrc = 0 | 0;
    var dictIndex = 0 | 0;
    var bytesFromDict = 0 | 0;
    var remaining = 0 | 0;
    var endMatch = 0 | 0;
    var readPtr = 0 | 0;

    while (inPos < inLen) {
        // 1. Read Token
        token = input[inPos++];

        // --- Literals ---
        literalLen = (token >>> 4) | 0;

        if (literalLen === 0x0F) {
            do {
                if (inPos >= inLen) throw new Error("LZ4: Unexpected end of input reading literals");
                s = input[inPos++];
                literalLen = (literalLen + s) | 0;
            } while (s === 0xFF);
        }

        // Copy Literals
        if (literalLen > 0) {
            endLit = (inPos + literalLen) | 0;
            if (endLit > inLen || (outPos + literalLen) > outLen) {
                throw new Error("LZ4: Output buffer too small or input malformed during literals");
            }

            // OPTIMIZATION: Unrolled Loop (4 bytes per step)
            // Reduces CPU branch prediction overhead for string/data runs
            while (inPos < (endLit - 3)) {
                output[outPos++] = input[inPos++];
                output[outPos++] = input[inPos++];
                output[outPos++] = input[inPos++];
                output[outPos++] = input[inPos++];
            }
            while (inPos < endLit) {
                output[outPos++] = input[inPos++];
            }
        }

        if (inPos === inLen) break;

        // --- Match ---
        // Offset (16-bit Little Endian)
        if (inPos + 2 > inLen) throw new Error("LZ4: Unexpected end of input reading offset");
        offset = (input[inPos] | (input[inPos + 1] << 8)) | 0;
        inPos = (inPos + 2) | 0;

        if (offset === 0) throw new Error("LZ4: Invalid offset 0");

        // Match Length
        matchLen = (token & 0x0F) | 0;
        if (matchLen === 0x0F) {
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
        copySrc = (outPos - offset) | 0;

        // 1. Dictionary Match (Negative index)
        if (copySrc < 0) {
            dictIndex = (dictLen + copySrc) | 0;
            if (dictIndex < 0) throw new Error(`LZ4: Invalid match offset ${offset} exceeds dictionary window`);

            bytesFromDict = (0 - copySrc) | 0;

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
                remaining = (matchLen - bytesFromDict) | 0;
                endMatch = (outPos + remaining) | 0;
                readPtr = (outPos - offset) | 0;
                while (outPos < endMatch) output[outPos++] = output[readPtr++];
            }
        }
        // 2. Internal Match
        else {
            // OPTIMIZATION 1: RLE -> memset (Fastest for single-byte repeats)
            if (offset === 1) {
                output.fill(output[copySrc], outPos, outPos + matchLen);
                outPos = (outPos + matchLen) | 0;
            }
                // OPTIMIZATION 2: Non-Overlapping -> memmove (Fastest for bulk copies)
            // Use copyWithin when regions don't overlap or match is "long enough" to justify overhead
            else if (offset >= matchLen && matchLen > 16) {
                output.copyWithin(outPos, copySrc, copySrc + matchLen);
                outPos = (outPos + matchLen) | 0;
            }
            // General Copy (Unrolled if safe)
            else {
                endMatch = (outPos + matchLen) | 0;
                readPtr = copySrc;

                // Safe to unroll if overlap distance >= 4 bytes
                if (offset >= 4) {
                    while (outPos < (endMatch - 3)) {
                        output[outPos++] = output[readPtr++];
                        output[outPos++] = output[readPtr++];
                        output[outPos++] = output[readPtr++];
                        output[outPos++] = output[readPtr++];
                    }
                }
                // Fallback for tight overlaps (offset < 4) or remainder
                while (outPos < endMatch) {
                    output[outPos++] = output[readPtr++];
                }
            }
        }
    }

    return outPos | 0;
}