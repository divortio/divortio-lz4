/**
 * src/shared/lz4Encode.js
 * * Stateful LZ4 Encoder.
 * * This class manages the complexity of **Streaming Compression**. Unlike the buffer-to-buffer
 * compressor, this encoder handles data arriving in chunks (streams), managing:
 * - **Rolling Window**: Preserving the last 64KB of data to use as a dictionary for the next chunk.
 * - **Hash Table Persistence**: Keeping the match-finding table alive across chunks.
 * - **Dictionary Shifting**: Adjusting hash values when the window "rolls" to prevent stale references.
 * * It produces a valid LZ4 Frame stream compatible with the standard CLI and other decoders.
 * @module lz4Encode
 */

import { XXHash32 } from "../xxhash32/xxhash32Stateful.js";
import { compressBlock } from "../block/blockCompress.js";
import { ensureBuffer } from "./lz4Util.js";

// --- Localized Constants for V8 Optimization ---
// Defining these locally allows TurboFan to treat them as immediate operands.
const MIN_MATCH = 4 | 0;
const HASH_LOG = 14 | 0;
const HASH_TABLE_SIZE = 16384 | 0; // 1 << HASH_LOG
const HASH_SHIFT = 18 | 0;         // 32 - HASH_LOG
const HASH_MASK = 16383 | 0;       // HASH_TABLE_SIZE - 1
const MAX_WINDOW_SIZE = 65536 | 0;

const MAGIC_NUMBER = 0x184D2204;
const LZ4_VERSION = 1;
const FLG_BLOCK_INDEPENDENCE_MASK = 0x20;
const FLG_CONTENT_CHECKSUM_MASK = 0x04;
const FLG_DICT_ID_MASK = 0x01;

// Block Sizes Map (Inlined for speed)
const BLOCK_MAX_SIZES = {
    4: 65536,
    5: 262144,
    6: 1048576,
    7: 4194304
};

/**
 * Writes a 32-bit integer to a byte array in Little Endian format.
 * @param {Uint8Array} b - Destination buffer.
 * @param {number} i - Integer value.
 * @param {number} n - Offset.
 */
function writeU32(b, i, n) {
    b[n] = i & 0xFF;
    b[n + 1] = (i >>> 8) & 0xFF;
    b[n + 2] = (i >>> 16) & 0xFF;
    b[n + 3] = (i >>> 24) & 0xFF;
}

/**
 * Creates the LZ4 Frame Header.
 * @param {boolean} blockIndependence - If true, blocks effectively forget previous blocks.
 * @param {boolean} contentChecksum - If true, a checksum is appended at the EOF.
 * @param {number} bdId - Block Identifier (4-7).
 * @param {number|null} dictId - Optional Dictionary ID.
 * @returns {Uint8Array} The formatted header buffer.
 */
function createFrameHeader(blockIndependence, contentChecksum, bdId, dictId) {
    const buffer = new Uint8Array(15); // Max size
    let pos = 0;

    // Magic
    writeU32(buffer, MAGIC_NUMBER, pos);
    pos += 4;

    // FLG
    let flg = (LZ4_VERSION << 6);
    if (blockIndependence) flg |= FLG_BLOCK_INDEPENDENCE_MASK;
    if (contentChecksum) flg |= FLG_CONTENT_CHECKSUM_MASK;
    if (dictId) flg |= FLG_DICT_ID_MASK;
    buffer[pos++] = flg;

    // BD
    buffer[pos++] = (bdId & 0x07) << 4;

    // Dictionary ID
    if (dictId) {
        writeU32(buffer, dictId, pos);
        pos += 4;
    }

    // Header Checksum (xxHash32 of the header bytes)
    // Note: We use a temporary stateless hash here for simplicity in the header
    // In a full implementation, we might reuse the hasher class, but creating one is cheap.
    const hasher = new XXHash32(0);
    hasher.update(buffer.subarray(4, pos));
    const headerHash = hasher.digest();
    buffer[pos++] = (headerHash >>> 8) & 0xFF;

    return buffer.subarray(0, pos);
}

export class LZ4Encoder {
    /**
     * Creates a new LZ4 Streaming Encoder.
     * @param {number} [maxBlockSize=4194304] - Max size of each compressed block (default 4MB).
     * @param {boolean} [blockIndependence=false] - If false (default), uses a rolling window for better compression.
     * @param {boolean} [contentChecksum=false] - If true, calculates a checksum for the entire stream.
     * @param {Uint8Array} [dictionary=null] - Initial dictionary buffer to warm up the compressor.
     */
    constructor(maxBlockSize = 4194304, blockIndependence = false, contentChecksum = false, dictionary = null) {
        this.blockIndependence = blockIndependence;
        this.contentChecksum = contentChecksum;
        this.blockSize = BLOCK_MAX_SIZES[getBlockId(maxBlockSize)] || 4194304;
        this.bdId = getBlockId(this.blockSize);

        // State
        this.buffer = new Uint8Array(0); // Input buffer (accumulates data)
        this.outputQueue = [];           // Queue of compressed blocks
        this.hasWrittenHeader = false;
        this.isClosed = false;

        // Rolling Window State
        // We need a persistent hash table for the "linked list" of matches
        this.hashTable = new Int32Array(HASH_TABLE_SIZE);
        this.dictSize = 0; // Bytes of history currently valid in the window

        // Checksum
        if (this.contentChecksum) {
            this.hasher = new XXHash32(0);
        }

        // Dictionary Support
        this.dictId = null;
        if (dictionary) {
            const dict = ensureBuffer(dictionary);
            this.dictId = new XXHash32(0).update(dict).digest();
            this._initDictionary(dict);
        }
    }

    /**
     * Warms up the hash table with the provided dictionary.
     * @private
     * @param {Uint8Array} dict - The dictionary buffer.
     */
    _initDictionary(dict) {
        // We only care about the last 64KB
        const windowSize = Math.min(dict.length, MAX_WINDOW_SIZE);
        const start = dict.length - windowSize;

        // Store as initial buffer
        this.buffer = dict.subarray(start);
        this.dictSize = windowSize;

        // Hash the dictionary into the table
        // This logic is simplified for the stream encoder to avoid code duplication
        // Ideally, this would share the exact hashing logic with compressBlock.
        const len = this.buffer.length;
        const limit = len - 4;

        for (let i = 0; i <= limit; i++) {
            const seq = (this.buffer[i] | (this.buffer[i + 1] << 8) | (this.buffer[i + 2] << 16) | (this.buffer[i + 3] << 24));
            // Jenkins Hash (Matched to blockCompress)
            let h = seq;
            h = (h + 2127912214 + (h << 12)) | 0;
            h = (h ^ -949894596 ^ (h >>> 19)) | 0;
            h = (h + 374761393 + (h << 5)) | 0;
            h = (h + -744332180 ^ (h << 9)) | 0;
            h = (h + -42973499 + (h << 3)) | 0;
            h = (h ^ -1252372727 ^ (h >>> 16)) | 0;
            const hash = (h >>> HASH_SHIFT) & HASH_MASK;
            this.hashTable[hash] = i + 1;
        }
    }

    /**
     * Adds data to the stream.
     * @param {Uint8Array|ArrayBuffer|Buffer} chunk - The data chunk.
     * @returns {Uint8Array[]} An array of compressed blocks generated from this chunk (may be empty if buffering).
     */
    add(chunk) {
        if (this.isClosed) throw new Error("Stream is closed");
        const data = ensureBuffer(chunk);
        if (data.length === 0) return [];

        if (this.contentChecksum) {
            this.hasher.update(data);
        }

        // Append to internal buffer
        // Note: For high performance, we should use a circular buffer or rope,
        // but for JS simplicity, we concat. Optimization: Benchmarking needed.
        const newBuffer = new Uint8Array(this.buffer.length + data.length);
        newBuffer.set(this.buffer);
        newBuffer.set(data, this.buffer.length);
        this.buffer = newBuffer;

        const results = [];

        // Write Header on first data
        if (!this.hasWrittenHeader) {
            results.push(createFrameHeader(this.blockIndependence, this.contentChecksum, this.bdId, this.dictId));
            this.hasWrittenHeader = true;
        }

        // Flush blocks if we have enough data
        // We keep 'dictSize' bytes + 'blockSize' bytes
        while (this.buffer.length >= (this.dictSize + this.blockSize)) {
            results.push(this._flushBlock(false));
        }

        return results;
    }

    /**
     * Compresses the pending data in the buffer into a block.
     * @private
     * @param {boolean} final - True if this is the last block (flush everything).
     * @returns {Uint8Array} The formatted compressed block (Size + Data).
     */
    _flushBlock(final) {
        // Calculate what to compress
        const available = this.buffer.length - this.dictSize;
        if (available === 0 && !final) return new Uint8Array(0);

        let blockSize = this.blockSize;
        if (available < blockSize) {
            if (final) blockSize = available;
            else return new Uint8Array(0);
        }

        const srcStart = this.dictSize;
        // We allow the compressor to read back into the dictionary (this.buffer includes it)
        // src is the whole buffer (History + Current Block)

        // Prepare Output
        // Worst case: Block Size + Header/Footer overhead
        const maxOutputSize = blockSize + 1024;
        const output = new Uint8Array(maxOutputSize + 4); // +4 for size header

        let compSize = 0;

        // Call the optimized Kernel with correct signature
        // compressBlock(src, output, srcStart, srcLen, hashTable, outputOffset)
        // Output Offset is 4 to leave room for the block size header
        if (this.blockIndependence) {
            this.hashTable.fill(0);
            compSize = compressBlock(this.buffer, output, srcStart, blockSize, this.hashTable, 4);
        } else {
            // Stateful compression
            compSize = compressBlock(this.buffer, output, srcStart, blockSize, this.hashTable, 4);
        }

        let resultBlock;

        // Check if compression was worth it
        if (compSize > 0 && compSize < blockSize) {
            // Compressed: Write size
            writeU32(output, compSize, 0);
            resultBlock = output.subarray(0, compSize + 4);
        } else {
            // Uncompressed: Write uncompressed size + flag bit
            writeU32(output, blockSize | 0x80000000, 0);
            output.set(this.buffer.subarray(srcStart, srcStart + blockSize), 4);
            resultBlock = output.subarray(0, blockSize + 4);
        }

        // Slide Window
        // We keep the last 64KB of the data we just compressed as the new dictionary
        if (!this.blockIndependence) {
            const consumedEnd = srcStart + blockSize;
            const preserveLen = Math.min(consumedEnd, MAX_WINDOW_SIZE);
            const start = consumedEnd - preserveLen;

            // Create new buffer with just the history
            this.buffer = this.buffer.subarray(start);

            // Adjust dictSize logic
            const shiftSrc = consumedEnd - preserveLen; // How much we shifted absolute positions
            this.dictSize = preserveLen;

            // Shift Hash Table indices
            // Because our hash table stores absolute indices relative to the start of the *previous* buffer,
            // we must subtract the amount we shifted to keep them valid relative to the *new* buffer start.
            const table = this.hashTable;
            const shift = shiftSrc;
            const tableSize = HASH_TABLE_SIZE;

            for (let i = 0; i < tableSize; i++) {
                const ref = table[i];
                if (ref > shift) {
                    table[i] = ref - shift;
                } else {
                    table[i] = 0; // Forgotten (too old)
                }
            }
        } else {
            // Independent blocks: just consume data
            this.buffer = this.buffer.subarray(this.dictSize + blockSize);
            this.dictSize = 0;
        }

        return resultBlock;
    }

    /**
     * Creates the 4-byte End Mark (0x00000000).
     * @private
     */
    _createEndMark() {
        const b = new Uint8Array(4);
        writeU32(b, 0, 0);
        return b;
    }

    /**
     * Finalizes the stream.
     * @returns {Uint8Array[]} Final blocks including EndMark and Checksum.
     */
    finish() {
        if (this.isClosed) return [];
        this.isClosed = true;

        const frames = [];

        if (!this.hasWrittenHeader) {
            frames.push(createFrameHeader(this.blockIndependence, this.contentChecksum, this.bdId, this.dictId));
        }

        // Flush remaining data
        while ((this.buffer.length - this.dictSize) > 0) {
            frames.push(this._flushBlock(true));
        }

        frames.push(this._createEndMark());

        if (this.contentChecksum && this.hasher) {
            const digest = this.hasher.digest();
            const b = new Uint8Array(4);
            writeU32(b, digest, 0);
            frames.push(b);
        }

        return frames;
    }
}

/**
 * Helper to determine Block ID from size.
 */
function getBlockId(bytes) {
    if (!bytes || bytes <= 65536) return 4;
    if (bytes <= 262144) return 5;
    if (bytes <= 1048576) return 6;
    return 7;
}