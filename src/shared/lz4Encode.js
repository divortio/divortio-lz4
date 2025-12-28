/**
 * @fileoverview Stateful LZ4 Encoder for streaming compression.
 *
 * This module implements a buffering state machine that accepts data chunks of any size,
 * accumulates them until they reach the target block size (e.g., 64KB, 4MB), and then
 * compresses them. It manages the full lifecycle of an LZ4 Frame, including:
 * - Frame Headers
 * - Block Compression (with optional dependency)
 * - Content Checksums
 * - EndMarks
 *
 * @module shared/lz4Encode
 */

import {XXHash32Stream} from "../xxhash32/xxhash32.stream.js";
import {compressBlock} from "../block/blockCompress.js";
import {Lz4Base} from "./lz4Base.js";
import {BLOCK_MAX_SIZES} from "./constants.js";

/**
 * A stateful LZ4 Frame encoder.
 *
 * Designed for use in streams (Node.js TransformStreams or Web Streams), this class
 * buffers incoming data until enough is available to fill a standard LZ4 block.
 * It handles the complex logic of writing headers only once, maintaining dictionary
 * state (if block independence is disabled), and calculating rolling checksums.
 *
 * @extends Lz4Base
 */
export class LZ4Encoder extends Lz4Base {

    /**
     * Creates a new LZ4 Encoder instance.
     *
     * @param {Object} [options] - Configuration options.
     * @param {boolean} [options.blockIndependence=true] - If true, blocks are compressed independently.
     * Disabling this improves compression ratio but prevents parallel decompression.
     * @param {boolean} [options.contentChecksum=true] - If true, an xxHash32 checksum of the entire content is appended.
     * @param {number} [options.maxBlockSize=65536] - Target size for LZ4 blocks (defaults to 64KB).
     */
    constructor(options = {}) {
        super();
        /** @type {boolean} */
        this.blockIndependence = options.blockIndependence !== false;
        /** @type {boolean} */
        this.contentChecksum = options.contentChecksum !== false;

        // --- Configuration ---
        /** @type {number} Internal ID representing the max block size. */
        this.bdId = Lz4Base.getBlockId(options.maxBlockSize);
        /** @type {number} Actual max block size in bytes (e.g., 65536). */
        this.maxBlockSize = BLOCK_MAX_SIZES[this.bdId];

        // --- State ---
        /**
         * Internal buffer for accumulating incomplete blocks.
         * @type {Uint8Array}
         */
        this.buffer = new Uint8Array(0);

        /** @type {boolean} Flag to ensure the frame header is written exactly once. */
        this.hasWrittenHeader = false;

        // --- Resources ---
        /**
         * Hash table for Lempel-Ziv deduplication.
         * Allocated once and reused to reduce GC pressure.
         * @type {Uint16Array}
         */
        this.hashTable = new Uint16Array(16384);

        /**
         * Rolling checksum calculator for the full content stream.
         * @type {XXHash32Stream|null}
         */
        this.checksumStream = this.contentChecksum ? new XXHash32Stream(0) : null;

        // --- Scratch Buffer ---
        // Pre-allocate the worst-case size for a compressed block to avoid resizing.
        // Formula: MaxBlockSize + (MaxBlockSize/255) + 32 (safety margin)
        const worstCase = (this.maxBlockSize + (this.maxBlockSize / 255 | 0) + 32) | 0;
        /** @type {Uint8Array} Workspace for compressing a single block. */
        this.scratchBuffer = new Uint8Array(worstCase);
    }

    /**
     * Processes a chunk of raw data.
     *
     * This method buffers the data. If the internal buffer exceeds the `maxBlockSize`,
     * one or more compressed blocks are generated and returned.
     *
     * @param {Uint8Array} chunk - The raw binary input.
     * @returns {Uint8Array[]} An array of LZ4 frame parts (Header, Compressed Blocks).
     */
    update(chunk) {
        const output = [];

        // 1. Write Header (First call only)
        if (!this.hasWrittenHeader) {
            output.push(Lz4Base.createFrameHeader(this.blockIndependence, this.contentChecksum, this.bdId));
            this.hasWrittenHeader = true;
        }

        // 2. Update Content Checksum & Accumulate Buffer
        if (this.checksumStream) this.checksumStream.update(chunk);

        if (this.buffer.length > 0) {
            // Append to existing buffer
            const newBuf = new Uint8Array(this.buffer.length + chunk.length);
            newBuf.set(this.buffer);
            newBuf.set(chunk, this.buffer.length);
            this.buffer = newBuf;
        } else {
            this.buffer = chunk;
        }

        // 3. Process Full Blocks
        while (this.buffer.length >= this.maxBlockSize) {
            // Slice off a full block
            const rawBlock = this.buffer.subarray(0, this.maxBlockSize);
            this.buffer = this.buffer.slice(this.maxBlockSize);

            // Compress and push
            output.push(this._encodeBlock(rawBlock));

            // Reset dictionary if independent blocks are required
            if (this.blockIndependence) this.hashTable.fill(0xFFFF);
        }
        return output;
    }

    /**
     * Finalizes the LZ4 Frame.
     *
     * Flushes any remaining data in the buffer as a final block, appends the
     * EndMark (0x00000000), and appends the Content Checksum if enabled.
     *
     * @returns {Uint8Array[]} An array containing the final parts of the frame.
     */
    finish() {
        const output = [];

        // Edge case: Empty stream (finish called without update)
        if (!this.hasWrittenHeader) {
            output.push(Lz4Base.createFrameHeader(this.blockIndependence, this.contentChecksum, this.bdId));
            this.hasWrittenHeader = true;
        }

        // Flush remaining buffer
        if (this.buffer.length > 0) {
            output.push(this._encodeBlock(this.buffer));
            this.buffer = new Uint8Array(0);
        }

        // Append EndMark (4 bytes of zeros)
        const endMark = new Uint8Array(4);
        Lz4Base.writeU32(endMark, 0, 0);
        output.push(endMark);

        // Append Content Checksum
        if (this.checksumStream) {
            const buf = new Uint8Array(4);
            Lz4Base.writeU32(buf, this.checksumStream.finalize(), 0);
            output.push(buf);
        }
        return output;
    }

    /**
     * Internal helper to compress a single raw block.
     * Handles the decision to store the block Compressed vs Uncompressed.
     *
     * @param {Uint8Array} rawBlock - The raw data to compress.
     * @returns {Uint8Array} The formatted LZ4 Block (Size + Data).
     * @private
     */
    _encodeBlock(rawBlock) {
        // Use scratch buffer for compression to avoid allocation
        // Offset by 4 bytes to leave room for the Block Size integer
        const dest = this.scratchBuffer.subarray(4);
        const compSize = compressBlock(rawBlock, dest, this.hashTable);
        const blockSize = rawBlock.length | 0;

        // Decision: Is compression worth it?
        if (compSize > 0 && compSize < blockSize) {
            // Yes: Store Compressed
            const header = new Uint8Array(4);
            Lz4Base.writeU32(header, compSize, 0);

            const block = new Uint8Array(4 + compSize);
            block.set(header, 0);
            block.set(dest.subarray(0, compSize), 4);
            return block;
        } else {
            // No: Store Uncompressed (Raw)
            // Flag: High bit of size (0x80000000) indicates uncompressed
            const header = new Uint8Array(4);
            Lz4Base.writeU32(header, blockSize | 0x80000000, 0);

            const block = new Uint8Array(4 + blockSize);
            block.set(header, 0);
            block.set(rawBlock, 4);
            return block;
        }
    }
}