/**
 * src/shared/lz4Decode.js
 * Stateful LZ4 Decoder for streaming decompression.
 *
 * Architecture:
 * - Implements a Flattened State Machine to parse LZ4 Frames byte-by-byte.
 * - Handles split-frames, multi-chunk blocks, and rolling history windows.
 * - Optimized for V8 JIT with localized constants and zero-copy slicing where possible.
 */

import { XXHash32 } from "../xxhash32/xxhash32Stateful.js";
import { decompressBlock } from "../block/blockDecompress.js";
import { ensureBuffer } from "../shared/lz4Util.js";

// --- Localized Constants for V8 Optimization ---
// Defining these locally allows TurboFan to treat them as immediate operands.
const MAGIC_NUMBER = 0x184D2204;

// Frame Descriptor Flags
const FLG_BLOCK_INDEP_MASK = 0x20;      // (1 << 5)
const FLG_BLOCK_CHECKSUM_MASK = 0x10;   // (1 << 4)
const FLG_CONTENT_SIZE_MASK = 0x08;     // (1 << 3)
const FLG_CONTENT_CHECKSUM_MASK = 0x04; // (1 << 2)
const FLG_DICT_ID_MASK = 0x01;          // (1 << 0)

// Flattened State Machine (Integers are faster than Object property lookups)
const STATE_MAGIC = 0;
const STATE_HEADER = 1;
const STATE_BLOCK_SIZE = 2;
const STATE_BLOCK_BODY = 3;
const STATE_CHECKSUM = 4;

// Memory Constants
const WINDOW_SIZE = 65536;      // 64KB History Window
const WORKSPACE_SIZE = 4194304; // 4MB Max Block Size

/**
 * Local helper to read a Little Endian U32.
 * Inlined to remove dependency on external modules for the hot path.
 * @param {Uint8Array} b - Buffer
 * @param {number} n - Offset
 * @returns {number}
 */
function readU32(b, n) {
    return (b[n] | (b[n + 1] << 8) | (b[n + 2] << 16) | (b[n + 3] << 24)) >>> 0;
}

export class LZ4Decoder {

    /**
     * Creates a stateful LZ4 Decoder.
     * @param {Uint8Array|null} [dictionary=null] - Initial history window (optional).
     * @param {boolean} [verifyChecksum=true] - If false, skips content checksum verification for speed.
     */
    constructor(dictionary = null, verifyChecksum = true) {
        this.state = STATE_MAGIC;

        // User Options
        this.dictionary = dictionary ? ensureBuffer(dictionary) : null;
        this.verifyChecksum = verifyChecksum;

        // Frame Flags (Parsed from Header)
        this.blockIndependence = true;
        this.hasBlockChecksum = false;
        this.hasContentChecksum = false;
        this.hasContentSize = false;
        this.hasDictId = false;

        // Runtime State
        this.buffer = new Uint8Array(0); // Accumulator for incoming chunks
        this.hasher = null;              // Content Checksum Calculator
        this.currentBlockSize = 0;
        this.isUncompressed = false;

        // Window (History) - Max 64KB
        this.windowSize = WINDOW_SIZE;
        this.window = new Uint8Array(WINDOW_SIZE);
        this.windowPos = 0;

        // Initialize Window with Dictionary if provided
        if (this.dictionary) {
            this._initWindow(this.dictionary);
        }

        // Workspace for block decompression
        // Pre-allocated to prevent Garbage Collection thrashing
        this.workspace = new Uint8Array(WORKSPACE_SIZE);
    }

    /**
     * Populates the history window with the provided dictionary.
     * @param {Uint8Array} dict
     * @private
     */
    _initWindow(dict) {
        const len = dict.length;
        const size = Math.min(len, WINDOW_SIZE);
        // Load the last 64KB of the dictionary into the window
        this.window.set(dict.subarray(len - size), 0);
        this.windowPos = size;
    }

    /**
     * Adds compressed data to the decoder.
     * @param {Uint8Array} chunk - A chunk of the LZ4 stream.
     * @returns {Uint8Array[]} An array of decompressed data chunks.
     */
    update(chunk) {
        // 1. Accumulate Input
        if (this.buffer.length > 0) {
            const newBuf = new Uint8Array(this.buffer.length + chunk.length);
            newBuf.set(this.buffer);
            newBuf.set(chunk, this.buffer.length);
            this.buffer = newBuf;
        } else {
            this.buffer = chunk;
        }

        const output = [];

        // 2. State Machine Loop
        while (true) {

            // --- STATE: MAGIC NUMBER ---
            if (this.state === STATE_MAGIC) {
                if (this.buffer.length < 4) break;

                if (readU32(this.buffer, 0) !== MAGIC_NUMBER) {
                    throw new Error("LZ4: Invalid Magic Number");
                }

                this.buffer = this.buffer.subarray(4);
                this.state = STATE_HEADER;

                // Reset per-frame state
                this.hasher = this.verifyChecksum ? new XXHash32(0) : null;
            }

            // --- STATE: FRAME HEADER ---
            if (this.state === STATE_HEADER) {
                // Need at least 2 bytes for Flags (FLG) and Block Descriptor (BD)
                if (this.buffer.length < 2) break;

                const flg = this.buffer[0];

                // Parse Flags (Using local constants)
                this.blockIndependence = (flg & FLG_BLOCK_INDEP_MASK) !== 0;
                this.hasBlockChecksum = (flg & FLG_BLOCK_CHECKSUM_MASK) !== 0;
                this.hasContentSize = (flg & FLG_CONTENT_SIZE_MASK) !== 0;
                this.hasContentChecksum = (flg & FLG_CONTENT_CHECKSUM_MASK) !== 0;
                this.hasDictId = (flg & FLG_DICT_ID_MASK) !== 0;

                // Calculate variable header length
                let requiredLen = 2;
                if (this.hasContentSize) requiredLen += 8;
                if (this.hasDictId) requiredLen += 4;
                requiredLen += 1; // Header Checksum

                if (this.buffer.length < requiredLen) break;

                // Parsing Dictionary ID (if present)
                let cursor = 2;
                if (this.hasContentSize) cursor += 8;

                if (this.hasDictId) {
                    const expectedDictId = readU32(this.buffer, cursor);
                    cursor += 4;

                    if (this.dictionary) {
                        const dictHasher = new XXHash32(0);
                        dictHasher.update(this.dictionary);
                        const actualId = dictHasher.digest();

                        if (actualId !== expectedDictId) {
                            throw new Error(`LZ4: Dictionary ID Mismatch. Header: 0x${expectedDictId.toString(16)}, Provided: 0x${actualId.toString(16)}`);
                        }
                    } else {
                        throw new Error("LZ4: Archive requires a Dictionary, but none was provided.");
                    }
                }

                this.buffer = this.buffer.subarray(requiredLen);
                this.state = STATE_BLOCK_SIZE;
            }

            // --- STATE: BLOCK SIZE ---
            if (this.state === STATE_BLOCK_SIZE) {
                if (this.buffer.length < 4) break;

                const val = readU32(this.buffer, 0);
                this.buffer = this.buffer.subarray(4);

                // Check for EndMark
                if (val === 0) {
                    this.state = STATE_CHECKSUM;
                    continue;
                }

                // Parse Size & Compressed/Uncompressed Flag
                this.isUncompressed = (val & 0x80000000) !== 0;
                this.currentBlockSize = val & 0x7FFFFFFF;

                this.state = STATE_BLOCK_BODY;
            }

            // --- STATE: BLOCK BODY ---
            if (this.state === STATE_BLOCK_BODY) {
                let requiredLen = this.currentBlockSize;
                if (this.hasBlockChecksum) requiredLen += 4;

                if (this.buffer.length < requiredLen) break;

                const blockData = this.buffer.subarray(0, this.currentBlockSize);

                // Advance buffer (Skip Data + Block Checksum)
                this.buffer = this.buffer.subarray(requiredLen);

                let decodedChunk;

                if (this.isUncompressed) {
                    decodedChunk = blockData.slice();
                } else {
                    // Prepare History for Decompression
                    let dict = null;
                    if (!this.blockIndependence) {
                        // Use local constant WINDOW_SIZE for check
                        dict = (this.windowPos === WINDOW_SIZE)
                            ? this.window
                            : this.window.subarray(0, this.windowPos);
                    }

                    const bytesWritten = decompressBlock(blockData, this.workspace, dict);
                    decodedChunk = this.workspace.slice(0, bytesWritten);
                }

                output.push(decodedChunk);

                if (this.hasher) this.hasher.update(decodedChunk);

                if (!this.blockIndependence) {
                    this._updateWindow(decodedChunk);
                }

                this.state = STATE_BLOCK_SIZE;
            }

            // --- STATE: CONTENT CHECKSUM ---
            if (this.state === STATE_CHECKSUM) {
                if (this.hasContentChecksum) {
                    if (this.buffer.length < 4) break;

                    if (this.verifyChecksum && this.hasher) {
                        const stored = readU32(this.buffer, 0);
                        const actual = this.hasher.digest();
                        if (stored !== actual) {
                            throw new Error("LZ4: Content Checksum Error");
                        }
                    }
                    this.buffer = this.buffer.subarray(4);
                }

                // Frame Complete. Reset state for next concatenated frame (if any).
                this.state = STATE_MAGIC;
                this.hasher = null;

                if (this.buffer.length === 0) break;
            }
        }

        return output;
    }

    /**
     * Shifts the window buffer to maintain the last 64KB of history.
     * Critical for dependent block decompression.
     * @param {Uint8Array} chunk
     * @private
     */
    _updateWindow(chunk) {
        // Use local constant for speed
        const winLen = WINDOW_SIZE;
        const chunkLen = chunk.length;

        // Case 1: Huge chunk replaces entire window
        if (chunkLen >= winLen) {
            this.window.set(chunk.subarray(chunkLen - winLen), 0);
            this.windowPos = winLen;
            return;
        }

        // Case 2: Chunk fits in remaining space
        if (this.windowPos + chunkLen <= winLen) {
            this.window.set(chunk, this.windowPos);
            this.windowPos += chunkLen;
            return;
        }

        // Case 3: Overflow - Shift history
        const keep = winLen - chunkLen;
        const srcOffset = this.windowPos - keep;

        this.window.copyWithin(0, srcOffset, this.windowPos);

        this.window.set(chunk, keep);
        this.windowPos = winLen;
    }
}