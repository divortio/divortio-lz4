/**
 * @fileoverview Stateful LZ4 Decoder for streaming decompression.
 *
 * This module implements a finite state machine (FSM) to parse LZ4 Frames
 * chunk-by-chunk. It buffers incoming data only when necessary to complete
 * a frame section (Header, Block Size, or Block Body), ensuring minimal
 * memory overhead during streaming operations.
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
import {xxHash32} from "../xxhash32/xxhash32.js";
import {XXHash32Stream} from "../xxhash32/xxhash32.stream.js";
import {decompressBlock} from "../block/blockDecompress.js";
import {Lz4Base} from "./lz4Base.js";

/**
 * @typedef {'MAGIC' | 'HEADER' | 'BLOCK_SIZE' | 'BLOCK_BODY' | 'CHECKSUM'} DecoderState
 */

/**
 * A stateful LZ4 Frame decoder.
 *
 * Designed for use in streams (Node.js or Web Streams), this class maintains
 * internal buffers and state to handle fragmented input chunks. It automatically
 * validates Magic Numbers, Header Checksums, and optional Content Checksums.
 *
 * @extends Lz4Base
 */
export class LZ4Decoder extends Lz4Base {

    /**
     * Creates a new LZ4 Decoder instance.
     * @param {Object} [options] - Configuration options (currently unused, reserved for future extensions).
     */
    constructor(options = {}) {
        super();

        /**
         * Internal accumulation buffer for incoming data chunks.
         * @type {Uint8Array}
         */
        this.buffer = new Uint8Array(0);

        /**
         * Current state of the decoding Finite State Machine.
         * @type {DecoderState}
         */
        this.state = 'MAGIC';

        /**
         * Stream hasher for validating content checksums (if enabled in the frame).
         * @type {XXHash32Stream|null}
         */
        this.checksumStream = null;

        /**
         * Reusable workspace buffer for block decompression to prevent allocation thrashing.
         * Resized dynamically based on the Frame's Max Block Size.
         * @type {Uint8Array}
         */
        this.workspace = new Uint8Array(0);

        // --- Frame Configuration (Parsed from Header) ---

        /** @type {number} Maximum size of a single uncompressed block. */
        this.maxBlockSize = 65536;

        /** @type {boolean} Whether blocks have individual checksums. */
        this.hasBlockChecksum = false;

        /** @type {boolean} Whether the frame has a total content checksum. */
        this.hasContentChecksum = false;

        /** @type {number} The size of the current block being parsed. */
        this.currentBlockSize = 0;

        /** @type {boolean} Whether the current block is stored uncompressed. */
        this.isUncompressed = false;
    }

    /**
     * Processes a new chunk of compressed data.
     *
     * This method appends the chunk to the internal buffer and advances the
     * state machine as far as possible. It returns any fully decompressed
     * data blocks generated during this step.
     *
     * @param {Uint8Array} chunk - The incoming binary data chunk.
     * @returns {Uint8Array[]} An array of decompressed data blocks (if any completed).
     * @throws {Error} If the Magic Number, Header Checksum, or Content Checksum is invalid.
     */
    update(chunk) {
        if (!chunk || chunk.length === 0) return [];

        // 1. Append new data to the internal buffer
        if (this.buffer.length === 0) {
            this.buffer = chunk;
        } else {
            const newBuf = new Uint8Array(this.buffer.length + chunk.length);
            newBuf.set(this.buffer);
            newBuf.set(chunk, this.buffer.length);
            this.buffer = newBuf;
        }

        const output = [];

        // 2. Drive the State Machine
        while (true) {
            // --- State: MAGIC NUMBER (4 bytes) ---
            if (this.state === 'MAGIC') {
                if (this.buffer.length < 4) break; // Need more data
                if (Lz4Base.readU32(this.buffer, 0) !== MAGIC_NUMBER) {
                    throw new Error("LZ4: Invalid Magic Number. Not an LZ4 Frame.");
                }
                this.buffer = this.buffer.slice(4);
                this.state = 'HEADER';
            }

            // --- State: FRAME HEADER (Var size: 3-15 bytes) ---
            if (this.state === 'HEADER') {
                if (this.buffer.length < 3) break; // Minimum header size
                const flg = this.buffer[0];
                const bd = this.buffer[1];

                // Calculate variable header size
                let headerSize = 3;
                if (flg & FLG_CONTENT_SIZE_MASK) headerSize += 8;
                if (flg & FLG_DICT_ID_MASK) headerSize += 4;

                if (this.buffer.length < headerSize) break; // Wait for full header

                // Validate Header Checksum
                const storedHc = this.buffer[headerSize - 1];
                const computedHc = (xxHash32(this.buffer.subarray(0, headerSize - 1), 0) >>> 8) & 0xFF;
                if (storedHc !== computedHc) throw new Error("LZ4: Header Checksum Error");

                // Parse Configuration
                this.hasContentChecksum = (flg & FLG_CONTENT_CHECKSUM_MASK) !== 0;
                this.hasBlockChecksum = (flg & FLG_BLOCK_CHECKSUM_MASK) !== 0;
                this.maxBlockSize = BLOCK_MAX_SIZES[(bd & 0x70) >> 4] || 65536;

                // Initialize Helpers
                if (this.hasContentChecksum) this.checksumStream = new XXHash32Stream(0);
                if (this.workspace.length < this.maxBlockSize) this.workspace = new Uint8Array(this.maxBlockSize);

                this.buffer = this.buffer.slice(headerSize);
                this.state = 'BLOCK_SIZE';
            }

            // --- State: BLOCK SIZE (4 bytes) ---
            if (this.state === 'BLOCK_SIZE') {
                if (this.buffer.length < 4) break;
                const field = Lz4Base.readU32(this.buffer, 0);
                this.buffer = this.buffer.slice(4);

                // Check for EndMark (0x00000000)
                if (field === 0) {
                    this.state = 'CHECKSUM';
                    continue;
                }

                // Parse Size & Compression Flag
                this.currentBlockSize = field & 0x7FFFFFFF;
                this.isUncompressed = (field & 0x80000000) !== 0;
                this.state = 'BLOCK_BODY';
            }

            // --- State: BLOCK BODY (Var size) ---
            if (this.state === 'BLOCK_BODY') {
                let needed = this.currentBlockSize;
                if (this.hasBlockChecksum) needed += 4;

                if (this.buffer.length < needed) break; // Wait for full block

                const blockData = this.buffer.subarray(0, this.currentBlockSize);
                this.buffer = this.buffer.slice(needed); // Consume block + checksum (if any)

                let decodedChunk;
                if (this.isUncompressed) {
                    decodedChunk = blockData.slice(0); // Copy to ensure safety
                } else {
                    const written = decompressBlock(blockData, this.workspace);
                    decodedChunk = this.workspace.slice(0, written);
                }

                if (this.checksumStream) this.checksumStream.update(decodedChunk);
                output.push(decodedChunk);
                this.state = 'BLOCK_SIZE';
            }

            // --- State: CONTENT CHECKSUM (4 bytes) ---
            if (this.state === 'CHECKSUM') {
                if (this.hasContentChecksum) {
                    if (this.buffer.length < 4) break;
                    const stored = Lz4Base.readU32(this.buffer, 0);
                    // @ts-ignore - Checksum stream is guaranteed initialized if hasContentChecksum is true
                    if (stored !== this.checksumStream.finalize()) {
                        throw new Error("LZ4: Content Checksum Error");
                    }
                    this.buffer = this.buffer.slice(4);
                }
                // Frame complete. The buffer might contain the start of a concatenated frame.
                // We stop here; a higher-level consumer can re-call update if supporting concatenated frames.
                break;
            }
        }
        return output;
    }
}