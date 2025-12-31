/**
 * src/block/blockDecompress.js
 * LZ4 Block Decompression Kernel.
 * Optimized for V8 with native intrinsics and "Double Copy" tail handling.
 */

const MIN_MATCH = 4 | 0;

export function decompressBlock(input, inputOffset, inputSize, output, outputOffset, dictionary) {
    // V8: Use vars for hot path performance
    var inPos = inputOffset | 0;
    var inEnd = (inputOffset + inputSize) | 0;
    var outPos = outputOffset | 0;
    var outLen = output.length | 0;
    var dictLen = dictionary ? dictionary.length | 0 : 0;

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

    // Temp vars for Double Copy
    var tailOut = 0 | 0;
    var tailSrc = 0 | 0;

    while (inPos < inEnd) {
        // --- 1. Read Token ---
        token = input[inPos++] | 0;

        // --- 2. Parse Literal Length ---
        literalLen = (token >>> 4) & 0x0F;
        if (literalLen === 15) {
            s = 0;
            do {
                s = input[inPos++] | 0;
                literalLen = (literalLen + s) | 0;
            } while (s === 255);
        }

        // --- 3. Copy Literals ---
        endLit = (outPos + literalLen) | 0;

        if (endLit > outLen) throw new Error("LZ4: Output Buffer Too Small");
        if ((inPos + literalLen) > inEnd) throw new Error("LZ4: Malformed Input");

        // OPTIMIZATION: Double Copy for Literals
        // If literals are >= 8 bytes, we unroll the body AND the tail.
        if (literalLen >= 8) {
            if (literalLen > 32) {
                // Large: Native memcpy
                output.set(input.subarray(inPos, inPos + literalLen), outPos);
                outPos = endLit;
                inPos = (inPos + literalLen) | 0;
            } else {
                // Medium (8-32): Unroll Body
                var litBody = (endLit - 8) | 0;
                while (outPos < litBody) {
                    output[outPos++] = input[inPos++];
                    output[outPos++] = input[inPos++];
                    output[outPos++] = input[inPos++];
                    output[outPos++] = input[inPos++];
                    output[outPos++] = input[inPos++];
                    output[outPos++] = input[inPos++];
                    output[outPos++] = input[inPos++];
                    output[outPos++] = input[inPos++];
                }
                // Double Copy Tail: Copy last 8 bytes unconditionally
                tailOut = (endLit - 8) | 0;
                tailSrc = (inPos + (endLit - outPos) - 8) | 0;

                output[tailOut] = input[tailSrc];
                output[tailOut + 1] = input[tailSrc + 1];
                output[tailOut + 2] = input[tailSrc + 2];
                output[tailOut + 3] = input[tailSrc + 3];
                output[tailOut + 4] = input[tailSrc + 4];
                output[tailOut + 5] = input[tailSrc + 5];
                output[tailOut + 6] = input[tailSrc + 6];
                output[tailOut + 7] = input[tailSrc + 7];

                // Finalize pointers
                inPos = (inPos + (endLit - outPos)) | 0;
                outPos = endLit;
            }
        } else {
            // Small (0-7): Byte loop (Fast enough for tiny copies)
            while (outPos < endLit) {
                output[outPos++] = input[inPos++];
            }
        }

        if (inPos >= inEnd) break;

        // --- 4. Parse Match Offset ---
        offset = (input[inPos] | (input[inPos + 1] << 8)) | 0;
        inPos = (inPos + 2) | 0;
        if (offset === 0) throw new Error("LZ4: Invalid Offset 0");

        // --- 5. Parse Match Length ---
        matchLen = token & 0x0F;
        if (matchLen === 15) {
            s = 0;
            do {
                s = input[inPos++] | 0;
                matchLen = (matchLen + s) | 0;
            } while (s === 255);
        }
        matchLen = (matchLen + MIN_MATCH) | 0;

        copySrc = (outPos - offset) | 0;

        // --- 6. Copy Match ---

        // A. Dictionary Match
        if (copySrc < 0) {
            bytesFromDict = -copySrc;
            copySrc = (dictLen + copySrc) | 0;
            if (bytesFromDict > matchLen) bytesFromDict = matchLen;
            if (copySrc < 0 || (copySrc + bytesFromDict) > dictLen) throw new Error("LZ4: Dictionary Offset Out of Bounds");

            dictIndex = copySrc;

            // OPTIMIZATION: Double Copy for Dictionary
            if (bytesFromDict >= 8) {
                var dictEnd = (dictIndex + bytesFromDict) | 0;
                var dictBody = (dictEnd - 8) | 0;

                while (dictIndex < dictBody) {
                    output[outPos++] = dictionary[dictIndex++];
                    output[outPos++] = dictionary[dictIndex++];
                    output[outPos++] = dictionary[dictIndex++];
                    output[outPos++] = dictionary[dictIndex++];
                    output[outPos++] = dictionary[dictIndex++];
                    output[outPos++] = dictionary[dictIndex++];
                    output[outPos++] = dictionary[dictIndex++];
                    output[outPos++] = dictionary[dictIndex++];
                }

                // Tail (Last 8 bytes)
                tailOut = outPos + (dictEnd - dictIndex) - 8;
                tailSrc = dictEnd - 8;

                output[tailOut] = dictionary[tailSrc];
                output[tailOut + 1] = dictionary[tailSrc + 1];
                output[tailOut + 2] = dictionary[tailSrc + 2];
                output[tailOut + 3] = dictionary[tailSrc + 3];
                output[tailOut + 4] = dictionary[tailSrc + 4];
                output[tailOut + 5] = dictionary[tailSrc + 5];
                output[tailOut + 6] = dictionary[tailSrc + 6];
                output[tailOut + 7] = dictionary[tailSrc + 7];

                outPos += (dictEnd - dictIndex);
            } else {
                while (bytesFromDict > 0) {
                    output[outPos++] = dictionary[dictIndex++];
                    bytesFromDict--;
                }
            }

            remaining = (matchLen - (outPos - (endLit + 0))) | 0;
            if (remaining > 0) {
                endMatch = (outPos + remaining) | 0;
                readPtr = (outPos - offset) | 0;
                while (outPos < endMatch) output[outPos++] = output[readPtr++];
            }
        }
        // B. Internal Match
        else {
            // RLE Optimization
            if (offset === 1) {
                output.fill(output[copySrc], outPos, outPos + matchLen);
                outPos = (outPos + matchLen) | 0;
            }
            // Non-Overlapping Optimization
            else if (offset >= matchLen && matchLen > 16) {
                output.copyWithin(outPos, copySrc, copySrc + matchLen);
                outPos = (outPos + matchLen) | 0;
            }
            // General Copy
            else {
                endMatch = (outPos + matchLen) | 0;
                readPtr = copySrc;

                // 8-Byte Unroll (Guarded)
                if (offset >= 8) {
                    var matchBody = (endMatch - 8) | 0;
                    while (outPos < matchBody) {
                        output[outPos++] = output[readPtr++];
                        output[outPos++] = output[readPtr++];
                        output[outPos++] = output[readPtr++];
                        output[outPos++] = output[readPtr++];
                        output[outPos++] = output[readPtr++];
                        output[outPos++] = output[readPtr++];
                        output[outPos++] = output[readPtr++];
                        output[outPos++] = output[readPtr++];
                    }

                    // Double Copy Tail
                    // Note: We can only do this if we haven't already finished
                    if (outPos < endMatch) {
                        tailOut = (endMatch - 8) | 0;
                        // Calculate readPtr for the last 8 bytes
                        // Current readPtr corresponds to current outPos
                        // We want to read corresponding to tailOut
                        var bytesRemaining = (endMatch - outPos) | 0;
                        tailSrc = (readPtr + bytesRemaining - 8) | 0;

                        output[tailOut] = output[tailSrc];
                        output[tailOut + 1] = output[tailSrc + 1];
                        output[tailOut + 2] = output[tailSrc + 2];
                        output[tailOut + 3] = output[tailSrc + 3];
                        output[tailOut + 4] = output[tailSrc + 4];
                        output[tailOut + 5] = output[tailSrc + 5];
                        output[tailOut + 6] = output[tailSrc + 6];
                        output[tailOut + 7] = output[tailSrc + 7];

                        outPos = endMatch;
                    }
                }
                else if (offset >= 4) {
                    while (outPos < (endMatch - 3)) {
                        output[outPos++] = output[readPtr++];
                        output[outPos++] = output[readPtr++];
                        output[outPos++] = output[readPtr++];
                        output[outPos++] = output[readPtr++];
                    }
                    while (outPos < endMatch) {
                        output[outPos++] = output[readPtr++];
                    }
                }
                else {
                    while (outPos < endMatch) {
                        output[outPos++] = output[readPtr++];
                    }
                }
            }
        }
    }

    return (outPos - outputOffset) | 0;
}