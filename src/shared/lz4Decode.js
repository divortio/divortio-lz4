/**
 * @fileoverview Stateful LZ4 Decoder for streaming decompression.
 * Aligned with LZ4 Frame Format 1.6.1.
 * Optimized with Integer States and Window support.
 *
 * @module shared/lz4Decode
 */

import {
    BLOCK_MAX_SIZES,
    FLG_BLOCK_CHECKSUM_MASK,
    FLG_CONTENT_CHECKSUM_MASK,
    FLG_CONTENT_SIZE_MASK,
    FLG_DICT_ID_MASK,
    MAGIC_NUMBER
} from "./constants.js";
import { xxHash32 } from "../xxhash32/xxhash32.js";
import { XXHash32Stream } from "../xxhash32/xxhash32.stream.js";
import { decompressBlock } from "../block/blockDecompress.js";
import { Lz4Base } from "./lz4Base.js";

// --- Optimization: Integer States (vs String Literals) ---
const STATES = {
    MAGIC: 0,
    HEADER: 1,
    BLOCK_SIZE: 2,
    BLOCK_BODY: 3,
    CHECKSUM: 4
};

export class LZ4Decoder extends Lz4Base {

    /**
     * Creates a stateful LZ4 Decoder.
     *
     * @param {Uint8Array|null} [dictionary=null] - Initial history window (optional).
     * @param {boolean} [verifyChecksum=true] - If false, skips content checksum verification for speed.
     */
    constructor(dictionary = null, verifyChecksum = true) {
        super();
        this.buffer = new Uint8Array(0); // Input buffer
        this.state = STATES.MAGIC;       // Current State
        this.checksumStream = null;

        // Configuration
        this.verifyChecksum = verifyChecksum;

        // --- History Window / Dictionary ---
        // We store the initial dictionary to reset the window correctly
        // if the stream contains concatenated frames.
        this.initialDictionary = dictionary instanceof Uint8Array ? dictionary : new Uint8Array(0);

        // Active Window (starts as a copy of the dictionary)
        this.window = this.initialDictionary.slice(0);
        this.maxWindowSize = 65536; // 64KB Standard LZ4 Window

        // Frame Config (Parsed from Header)
        this.maxBlockSize = 65536;
        this.hasBlockChecksum = false;
        this.hasContentChecksum = false;
        this.dictId = null;

        // Current Block Vars
        this.currentBlockSize = 0;
        this.isUncompressed = false;

        // Pre-allocate Workspace
        this.workspace = new Uint8Array(0);
    }

    /**
     * Helper to append data to the sliding window (History).
     * Keeps the window size capped at 64KB.
     * @param {Uint8Array} data
     */
    _updateWindow(data) {
        // If data itself is larger than window, we only need the tail
        if (data.length >= this.maxWindowSize) {
            this.window = data.subarray(data.length - this.maxWindowSize);
            return;
        }

        const combinedLen = this.window.length + data.length;
        if (combinedLen <= this.maxWindowSize) {
            // Fast path: just append
            const newWin = new Uint8Array(combinedLen);
            newWin.set(this.window);
            newWin.set(data, this.window.length);
            this.window = newWin;
        } else {
            // Trim: Keep tail of (Window + Data)
            const keepFromOld = this.maxWindowSize - data.length;
            const newWin = new Uint8Array(this.maxWindowSize);
            newWin.set(this.window.subarray(this.window.length - keepFromOld), 0);
            newWin.set(data, keepFromOld);
            this.window = newWin;
        }
    }

    /**
     * @param {Uint8Array} chunk
     * @returns {Uint8Array[]} Array of decompressed blocks
     */
    update(chunk) {
        if (!chunk || chunk.length === 0) return [];

        // Efficient Buffer Appending (Input Queue)
        if (this.buffer.length === 0) {
            this.buffer = chunk;
        } else {
            const newBuf = new Uint8Array(this.buffer.length + chunk.length);
            newBuf.set(this.buffer);
            newBuf.set(chunk, this.buffer.length);
            this.buffer = newBuf;
        }

        const output = [];

        while (true) {
            // --- 1. MAGIC NUMBER ---
            if (this.state === STATES.MAGIC) {
                if (this.buffer.length < 4) break;
                if (Lz4Base.readU32(this.buffer, 0) !== MAGIC_NUMBER) {
                    throw new Error("LZ4: Invalid Magic Number.");
                }
                this.buffer = this.buffer.subarray(4);
                this.state = STATES.HEADER;
            }

            // --- 2. FRAME HEADER ---
            if (this.state === STATES.HEADER) {
                // Min header: FLG(1) + BD(1) + HC(1) = 3 bytes
                if (this.buffer.length < 3) break;

                const flg = this.buffer[0];
                const bd = this.buffer[1];

                // Calculate variable size
                let headerSize = 3;
                if (flg & FLG_CONTENT_SIZE_MASK) headerSize += 8;
                if (flg & FLG_DICT_ID_MASK) headerSize += 4;

                if (this.buffer.length < headerSize) break;

                // Validate Header Checksum
                const storedHc = this.buffer[headerSize - 1];
                const computedHc = (xxHash32(this.buffer.subarray(0, headerSize - 1), 0) >>> 8) & 0xFF;
                if (storedHc !== computedHc) throw new Error("LZ4: Header Checksum Error");

                // Parse
                this.hasContentChecksum = (flg & FLG_CONTENT_CHECKSUM_MASK) !== 0;
                this.hasBlockChecksum = (flg & FLG_BLOCK_CHECKSUM_MASK) !== 0;
                this.maxBlockSize = BLOCK_MAX_SIZES[(bd & 0x70) >> 4] || 65536;

                // Read Dict ID
                if (flg & FLG_DICT_ID_MASK) {
                    const offset = (flg & FLG_CONTENT_SIZE_MASK) ? 10 : 2;
                    this.dictId = Lz4Base.readU32(this.buffer, offset);
                }

                // Initialize Streams
                if (this.hasContentChecksum && this.verifyChecksum) {
                    this.checksumStream = new XXHash32Stream(0);
                } else {
                    this.checksumStream = null;
                }

                // Ensure workspace handles max block size
                if (this.workspace.length < this.maxBlockSize) {
                    this.workspace = new Uint8Array(this.maxBlockSize);
                }

                // Reset Window for new frame (Reload Dictionary if present)
                this.window = this.initialDictionary.slice(0);

                this.buffer = this.buffer.subarray(headerSize);
                this.state = STATES.BLOCK_SIZE;
            }

            // --- 3. BLOCK SIZE ---
            if (this.state === STATES.BLOCK_SIZE) {
                if (this.buffer.length < 4) break;
                const field = Lz4Base.readU32(this.buffer, 0);
                this.buffer = this.buffer.subarray(4);

                // EndMark
                if (field === 0) {
                    this.state = STATES.CHECKSUM;
                    continue;
                }

                this.currentBlockSize = field & 0x7FFFFFFF;
                this.isUncompressed = (field & 0x80000000) !== 0;

                if (this.isUncompressed && this.currentBlockSize > this.maxBlockSize) {
                    throw new Error(`LZ4: Uncompressed block size ${this.currentBlockSize} exceeds max ${this.maxBlockSize}`);
                }

                this.state = STATES.BLOCK_BODY;
            }

            // --- 4. BLOCK BODY ---
            if (this.state === STATES.BLOCK_BODY) {
                let needed = this.currentBlockSize;
                if (this.hasBlockChecksum) needed += 4;

                if (this.buffer.length < needed) break;

                const blockData = this.buffer.subarray(0, this.currentBlockSize);

                // Ignore Block Checksum bytes if present (skipping validation for speed in this implementation)
                // const checksumData = this.hasBlockChecksum ? this.buffer.subarray(this.currentBlockSize, needed) : null;

                this.buffer = this.buffer.subarray(needed);

                let decodedChunk;
                if (this.isUncompressed) {
                    decodedChunk = blockData.slice(0); // Copy to ensure safety
                } else {
                    // Pass THIS.WINDOW as the 'dictionary' for dependent blocks
                    const written = decompressBlock(blockData, this.workspace, this.window);
                    decodedChunk = this.workspace.slice(0, written);
                }

                // Update Content Checksum (if active)
                if (this.checksumStream) this.checksumStream.update(decodedChunk);

                // Update History Window (Crucial for next block)
                this._updateWindow(decodedChunk);

                output.push(decodedChunk);
                this.state = STATES.BLOCK_SIZE;
            }

            // --- 5. FRAME CHECKSUM ---
            if (this.state === STATES.CHECKSUM) {
                if (this.hasContentChecksum) {
                    if (this.buffer.length < 4) break;
                    const stored = Lz4Base.readU32(this.buffer, 0);

                    if (this.verifyChecksum && this.checksumStream) {
                        if (stored !== this.checksumStream.finalize()) {
                            throw new Error("LZ4: Content Checksum Error");
                        }
                    }
                    this.buffer = this.buffer.subarray(4);
                }

                // Frame complete.
                this.state = STATES.MAGIC;
                this.checksumStream = null;
                // Note: We don't clear window here; we reset it at the start of the next HEADER phase.

                if (this.buffer.length === 0) break;
            }
        }
        return output;
    }
}