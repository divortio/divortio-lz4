/**
 * @fileoverview Stateful LZ4 Encoder for streaming compression.
 * Optimized for Sliding Window (Lookback) and External Dictionaries.
 *
 * @module shared/lz4Encode
 */

import { XXHash32Stream } from "../xxhash32/xxhash32.stream.js";
import { compressBlock } from "../block/blockCompress.js";
import { Lz4Base } from "./lz4Base.js";
import {
    BLOCK_MAX_SIZES,
    DICT_SIZE,
    HASH_TABLE_SIZE,
    MIN_MATCH
} from "./constants.js";
export class LZ4Encoder extends Lz4Base {

    /**
     * @param {Uint8Array|null} [dictionary=null] - Initial dictionary/history context.
     * @param {number} [maxBlockSize=65536] - Target block size.
     * @param {boolean} [blockIndependence=false] - If false, matches can cross block boundaries.
     * @param {boolean} [contentChecksum=false] - If true, appends xxHash32 of original content.
     */
    constructor(dictionary = null, maxBlockSize = 65536, blockIndependence = false, contentChecksum = false) {
        super();
        this.blockIndependence = blockIndependence;
        this.contentChecksum = contentChecksum;
        this.bdId = Lz4Base.getBlockId(maxBlockSize);
        this.maxBlockSize = BLOCK_MAX_SIZES[this.bdId];

        // --- Memory Management ---
        // Window = [Dictionary Space (64KB)] + [Current Block Space (MaxBlockSize)]
        this.dictSize = DICT_SIZE; // 64KB
        this.windowSize = this.dictSize + this.maxBlockSize;
        this.window = new Uint8Array(this.windowSize);

        // --- Resources ---
        // Hash Table for match finding (16KB size for 64KB window)
        this.hashTable = new Int32Array(HASH_TABLE_SIZE);
        this.hashTable.fill(-1);

        this.checksumStream = this.contentChecksum ? new XXHash32Stream(0) : null;
        this.hasWrittenHeader = false;

        // --- Dictionary Initialization ---
        // We start writing new data at `dictSize`.
        this.inputStart = this.dictSize;
        this.inputEnd = this.dictSize;

        if (options.dictionary && options.dictionary.length > 0) {
            this._initDictionary(options.dictionary);
        }

        // Output Scratch Buffer (Worst case expansion)
        const worstCase = (this.maxBlockSize + (this.maxBlockSize / 255 | 0) + 32) | 0;
        this.outputBuffer = new Uint8Array(worstCase);
    }

    /**
     * Loads the dictionary into the window and "warms up" the hash table.
     * @private
     */
    _initDictionary(dict) {
        // We only care about the last 64KB of the dictionary
        let len = dict.length;
        let offset = 0;

        if (len > this.dictSize) {
            offset = len - this.dictSize;
            len = this.dictSize;
        }

        // 1. Copy into the "Dictionary Space" of the window (0..64KB)
        // We place it at the *end* of the dictionary space so it matches
        // the sliding window logic (data is always immediately before inputStart).
        const destStart = this.dictSize - len;
        this.window.set(dict.subarray(offset, offset + len), destStart);

        // 2. Warm up the Hash Table
        // We must hash these bytes so the compressor can find matches within them.
        // We treat the positions as negative relative to the start of the NEW data,
        // or absolute within the window. `compressBlock` expects absolute window indices.
        const end = this.dictSize - MIN_MATCH;
        const base = this.window;
        const table = this.hashTable;

        // Rolling hash insert
        for (let i = destStart; i <= end; i++) {
            // Hash the 4 bytes at i
            const seq = (base[i] << 24) | (base[i + 1] << 16) | (base[i + 2] << 8) | base[i + 3];
            // Multiplicative hash (LZ4 standard)
            const hash = (Math.imul(seq, 0x9E3779B1) >>> (32 - 14)) & (HASH_TABLE_SIZE - 1);
            table[hash] = i;
        }
    }

    /**
     * Processes a chunk of raw data.
     * @param {Uint8Array} chunk
     * @returns {Uint8Array[]}
     */
    update(chunk) {
        const output = [];

        if (!this.hasWrittenHeader) {
            output.push(Lz4Base.createFrameHeader(this.blockIndependence, this.contentChecksum, this.bdId));
            this.hasWrittenHeader = true;
        }

        if (this.checksumStream) this.checksumStream.update(chunk);

        let chunkOffset = 0;
        let chunkRemaining = chunk.length;

        while (chunkRemaining > 0) {
            // Space remaining in the "Current Block" section of the window
            const spaceInBlock = (this.windowSize - this.inputEnd) | 0;

            const toCopy = (chunkRemaining < spaceInBlock) ? chunkRemaining : spaceInBlock;

            this.window.set(chunk.subarray(chunkOffset, chunkOffset + toCopy), this.inputEnd);

            this.inputEnd += toCopy;
            chunkOffset += toCopy;
            chunkRemaining -= toCopy;

            if (this.inputEnd === this.windowSize) {
                output.push(this._flushBlock());
            }
        }
        return output;
    }

    finish() {
        const output = [];
        if (!this.hasWrittenHeader) {
            output.push(Lz4Base.createFrameHeader(this.blockIndependence, this.contentChecksum, this.bdId));
            this.hasWrittenHeader = true;
        }

        if (this.inputEnd > this.inputStart) {
            output.push(this._flushBlock());
        }

        // EndMark
        const endMark = new Uint8Array(4);
        output.push(endMark);

        // Content Checksum
        if (this.checksumStream) {
            const buf = new Uint8Array(4);
            Lz4Base.writeU32(buf, this.checksumStream.finalize(), 0);
            output.push(buf);
        }
        return output;
    }

    _flushBlock() {
        const srcLen = (this.inputEnd - this.inputStart) | 0;

        // 1. Compress
        // inputStart is where the *new* data began (usually 65536).
        // The compressor looks at window[0...inputStart] as valid dictionary history.
        const dest = this.outputBuffer.subarray(4);
        const compSize = compressBlock(this.window, dest, this.inputStart, srcLen, this.hashTable);

        let resultBlock;

        // 2. Decision: Compressed vs Uncompressed
        if (compSize > 0 && compSize < srcLen) {
            const header = new Uint8Array(4);
            Lz4Base.writeU32(header, compSize, 0);
            resultBlock = new Uint8Array(4 + compSize);
            resultBlock.set(header, 0);
            resultBlock.set(dest.subarray(0, compSize), 4);
        } else {
            const header = new Uint8Array(4);
            Lz4Base.writeU32(header, srcLen | 0x80000000, 0);
            resultBlock = new Uint8Array(4 + srcLen);
            resultBlock.set(header, 0);
            resultBlock.set(this.window.subarray(this.inputStart, this.inputEnd), 4);
        }

        // 3. Slide Window
        if (this.blockIndependence) {
            this.inputEnd = this.inputStart;
            this.hashTable.fill(-1);
            // Re-initialize pointers for a fresh block (optional but cleaner)
            this.inputStart = this.dictSize;
            this.inputEnd = this.dictSize;
        } else {
            // Dependent Blocks: Shift data back to keep history
            if (this.inputEnd > this.dictSize) {
                const shift = (this.inputEnd - this.dictSize) | 0;

                // Shift window content
                this.window.copyWithin(0, shift, this.inputEnd);

                // Adjust Pointers
                this.inputStart = this.dictSize;
                this.inputEnd = this.dictSize;

                // Adjust Hash Table Indices
                const table = this.hashTable;
                const len = table.length;
                for (let i = 0; i < len; i = (i + 1) | 0) {
                    const ref = table[i] | 0;
                    if (ref >= shift) {
                        table[i] = (ref - shift) | 0;
                    } else {
                        table[i] = -1;
                    }
                }
            } else {
                // If we flushed early (e.g. finish()) and didn't fill the block,
                // we just move the start pointer forward for the next potential write.
                this.inputStart = this.inputEnd;
            }
        }

        return resultBlock;
    }
}