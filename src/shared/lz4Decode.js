/**
 * src/shared/lz4Decode.js
 * Stateful LZ4 Decoder for streaming decompression.
 * Aligned with LZ4 Frame Format 1.6.1.
 * Optimized with Integer States and Window support.
 *
 * @module shared/lz4Decode
 */

import {
    FLG_BLOCK_INDEP_MASK,
    FLG_BLOCK_CHECKSUM_MASK,
    FLG_CONTENT_SIZE_MASK,
    FLG_CONTENT_CHECKSUM_MASK,
    FLG_DICT_ID_MASK,
    MAGIC_NUMBER
} from "./constants.js";
import { XXHash32 } from "../xxhash32/xxhash32Stateful.js";
import { decompressBlock } from "../block/blockDecompress.js";
import { Lz4Base } from "./lz4Base.js";

// --- State Machine ---
const STATES = {
    MAGIC: 0,
    HEADER: 1,
    BLOCK_SIZE: 2,
    BLOCK_BODY: 3,
    CHECKSUM: 4
};

export class LZ4Decoder {

    /**
     * Creates a stateful LZ4 Decoder.
     * @param {Uint8Array|null} [dictionary=null] - Initial history window (optional).
     * @param {boolean} [verifyChecksum=true] - If false, skips content checksum verification for speed.
     */
    constructor(dictionary = null, verifyChecksum = true) {
        this.state = STATES.MAGIC;

        // User Options
        this.dictionary = dictionary ? Lz4Base.ensureBuffer(dictionary) : null;
        this.verifyChecksum = verifyChecksum;

        // Frame Flags
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
        // We use a "Sliding Window" buffer that shifts data to the left when full.
        this.windowSize = 65536;
        this.window = new Uint8Array(this.windowSize);
        this.windowPos = 0; // Current write position (also indicates valid history length)

        // Initialize Window with Dictionary if provided
        // (Note: This may be validated against DictID in the header later)
        if (this.dictionary) {
            this._initWindow(this.dictionary);
        }

        // Workspace for block decompression (Max 4MB Block)
        // Pre-allocated to prevent Garbage Collection thrashing during streams
        this.workspace = new Uint8Array(4 * 1024 * 1024);
    }

    _initWindow(dict) {
        const len = dict.length;
        const size = Math.min(len, this.windowSize);
        // Load the last 64KB of the dictionary into the window
        this.window.set(dict.subarray(len - size), 0);
        this.windowPos = size;
    }

    /**
     * Adds data to the decoder.
     * @param {Uint8Array} chunk
     * @returns {Uint8Array[]} Decoded chunks
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

            // --- STATE: MAGIC NUMBER (4 bytes) ---
            if (this.state === STATES.MAGIC) {
                if (this.buffer.length < 4) break;

                if (Lz4Base.readU32(this.buffer, 0) !== MAGIC_NUMBER) {
                    throw new Error("LZ4: Invalid Magic Number");
                }

                this.buffer = this.buffer.subarray(4);
                this.state = STATES.HEADER;

                // Reset per-frame state
                this.hasher = this.verifyChecksum ? new XXHash32(0) : null;
            }

            // --- STATE: FRAME HEADER (2-15 bytes) ---
            if (this.state === STATES.HEADER) {
                // Need at least 2 bytes for Flags (FLG) and Block Descriptor (BD)
                if (this.buffer.length < 2) break;

                const flg = this.buffer[0];

                // Parse Flags
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
                    const expectedDictId = Lz4Base.readU32(this.buffer, cursor);
                    cursor += 4;

                    // Spec: If DictID is present, we must verify the provided dictionary matches.
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

                // Note: We skip Header Checksum verification for performance,
                // but the byte is at `this.buffer[requiredLen - 1]`.

                this.buffer = this.buffer.subarray(requiredLen);
                this.state = STATES.BLOCK_SIZE;
            }

            // --- STATE: BLOCK SIZE (4 bytes) ---
            if (this.state === STATES.BLOCK_SIZE) {
                if (this.buffer.length < 4) break;

                const val = Lz4Base.readU32(this.buffer, 0);
                this.buffer = this.buffer.subarray(4);

                // Check for EndMark (0x00000000)
                if (val === 0) {
                    this.state = STATES.CHECKSUM;
                    continue;
                }

                // Parse Size & Compressed/Uncompressed Flag
                this.isUncompressed = (val & 0x80000000) !== 0;
                this.currentBlockSize = val & 0x7FFFFFFF;

                this.state = STATES.BLOCK_BODY;
            }

            // --- STATE: BLOCK BODY (Size + Optional BlockChecksum) ---
            if (this.state === STATES.BLOCK_BODY) {
                let requiredLen = this.currentBlockSize;
                if (this.hasBlockChecksum) requiredLen += 4;

                if (this.buffer.length < requiredLen) break;

                const blockData = this.buffer.subarray(0, this.currentBlockSize);

                // Advance buffer (Skip Data + Block Checksum)
                this.buffer = this.buffer.subarray(requiredLen);

                let decodedChunk;

                if (this.isUncompressed) {
                    decodedChunk = blockData.slice(); // Copy safe
                } else {
                    // Prepare History for Decompression
                    // If Independent, dict is null.
                    // If Dependent, we pass the active window history.
                    let dict = null;
                    if (!this.blockIndependence) {
                        // If window is full (64KB), pass whole window.
                        // If partially full (start of stream), pass valid slice.
                        dict = (this.windowPos === this.windowSize)
                            ? this.window
                            : this.window.subarray(0, this.windowPos);
                    }

                    // Decompress into workspace
                    // decompressBlock signature: (input, output, dictionary)
                    const bytesWritten = decompressBlock(blockData, this.workspace, dict);
                    decodedChunk = this.workspace.slice(0, bytesWritten);
                }

                output.push(decodedChunk);

                // Update Content Checksum
                if (this.hasher) this.hasher.update(decodedChunk);

                // Update Window (History)
                if (!this.blockIndependence) {
                    this._updateWindow(decodedChunk);
                }

                this.state = STATES.BLOCK_SIZE;
            }

            // --- STATE: CONTENT CHECKSUM (4 bytes) ---
            if (this.state === STATES.CHECKSUM) {
                if (this.hasContentChecksum) {
                    if (this.buffer.length < 4) break;

                    if (this.verifyChecksum && this.hasher) {
                        const stored = Lz4Base.readU32(this.buffer, 0);
                        const actual = this.hasher.digest();
                        if (stored !== actual) {
                            throw new Error("LZ4: Content Checksum Error");
                        }
                    }
                    this.buffer = this.buffer.subarray(4);
                }

                // Frame Completed.
                // Reset to MAGIC to support concatenated LZ4 frames (e.g. Linux kernel style)
                this.state = STATES.MAGIC;
                this.hasher = null;

                // If buffer is empty, we are truly done
                if (this.buffer.length === 0) break;
            }
        }

        return output;
    }

    /**
     * Shifts the window buffer to maintain the last 64KB of history.
     * @param {Uint8Array} chunk - The newly decompressed data.
     * @private
     */
    _updateWindow(chunk) {
        const winLen = this.windowSize;
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

        // Case 3: Overflow - Shift history to make room
        // We keep (winLen - chunkLen) bytes from the END of the current valid window.
        const keep = winLen - chunkLen;
        const srcOffset = this.windowPos - keep;

        // Shift valid history to index 0
        this.window.copyWithin(0, srcOffset, this.windowPos);

        // Append new chunk
        this.window.set(chunk, keep);
        this.windowPos = winLen;
    }
}