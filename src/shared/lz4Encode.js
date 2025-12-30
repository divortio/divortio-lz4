/**
 * src/shared/lz4Encode.js
 * Stateful LZ4 Encoder for streaming compression.
 *
 * Architecture:
 * - Implements a Rolling Window buffer to support history across chunk boundaries.
 * - Manages dictionary warming and hash table updates for dependent blocks.
 * - Optimized for V8 JIT with localized constants to trigger aggressive constant folding.
 */

import { XXHash32 } from "../xxhash32/xxhash32Stateful.js";
import { compressBlock } from "../block/blockCompress.js";
import { ensureBuffer } from "../shared/lz4Util.js";

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

// --- Local Helpers ---

/**
 * Writes a 32-bit unsigned integer in Little Endian format.
 * Inlined to avoid function call overhead in hot paths.
 * @param {Uint8Array} b - Buffer
 * @param {number} i - Integer to write
 * @param {number} n - Offset
 */
function writeU32(b, i, n) {
    b[n] = i & 0xFF;
    b[n + 1] = (i >>> 8) & 0xFF;
    b[n + 2] = (i >>> 16) & 0xFF;
    b[n + 3] = (i >>> 24) & 0xFF;
}

/**
 * Maps byte size to LZ4 Block ID.
 * @param {number} bytes
 * @returns {number} 4, 5, 6, or 7
 */
function getBlockId(bytes) {
    if (!bytes || bytes <= 65536) return 4;
    if (bytes <= 262144) return 5;
    if (bytes <= 1048576) return 6;
    return 7;
}

/**
 * Generates the LZ4 Frame Header.
 * @param {boolean} blockIndependence
 * @param {boolean} contentChecksum
 * @param {number} blockId
 * @param {number|null} dictId
 * @returns {Uint8Array}
 */
function createFrameHeader(blockIndependence, contentChecksum, blockId, dictId = null) {
    const headerLen = dictId !== null ? 11 : 7;
    const header = new Uint8Array(headerLen);

    // Magic Number
    header[0] = 0x04; header[1] = 0x22; header[2] = 0x4D; header[3] = 0x18;

    // Flags
    let flg = (LZ4_VERSION << 6);
    if (blockIndependence) flg |= FLG_BLOCK_INDEPENDENCE_MASK;
    if (contentChecksum) flg |= FLG_CONTENT_CHECKSUM_MASK;
    if (dictId !== null) flg |= FLG_DICT_ID_MASK;
    header[4] = flg;

    // BD
    header[5] = (blockId & 0x07) << 4;

    let hcPos = 6;
    if (dictId !== null) {
        writeU32(header, dictId, 6);
        hcPos = 10;
    }

    // Header Checksum
    const hasher = new XXHash32(0);
    hasher.update(header.subarray(4, hcPos));
    const headerHash = hasher.digest();
    header[hcPos] = (headerHash >>> 8) & 0xFF;

    return header;
}

export class LZ4Encoder {
    /**
     * Creates a stateful LZ4 Encoder.
     * @param {Uint8Array|null} [dictionary=null] - Initial dictionary for compression (optional).
     * @param {number} [maxBlockSize=4194304] - Max block size (default 4MB).
     * @param {boolean} [blockIndependence=false] - If false, allows matches across blocks (better compression, slower seeking).
     * @param {boolean} [contentChecksum=false] - If true, appends XXHash32 checksum at the end of the stream.
     */
    constructor(dictionary = null, maxBlockSize = 4194304, blockIndependence = false, contentChecksum = false) {
        this.blockIndependence = blockIndependence;
        this.contentChecksum = contentChecksum;
        this.bdId = getBlockId(maxBlockSize);
        this.blockSize = BLOCK_MAX_SIZES[this.bdId];

        this.maxWindowSize = MAX_WINDOW_SIZE;
        this.bufferCapacity = this.maxWindowSize + this.blockSize + 4096;
        this.buffer = new Uint8Array(this.bufferCapacity);

        // OPTIMIZATION: Use Int32Array (SMI) for faster indexing in V8
        this.hashTable = new Int32Array(HASH_TABLE_SIZE);

        this.hasher = this.contentChecksum ? new XXHash32(0) : null;
        this.hasWrittenHeader = false;
        this.isClosed = false;

        this.inputPos = 0;
        this.dictSize = 0;
        this.dictId = null;

        if (dictionary && dictionary.length > 0) {
            this._initDictionary(dictionary);
        }
    }

    /**
     * Warms the dictionary and populates the initial hash table.
     * @param {Uint8Array} dict
     * @private
     */
    _initDictionary(dict) {
        const d = ensureBuffer(dict);

        // Calculate DictID
        const dictHasher = new XXHash32(0);
        dictHasher.update(d);
        this.dictId = dictHasher.digest();

        const len = d.length;
        const windowSize = Math.min(len, this.maxWindowSize);
        const offset = len - windowSize;

        // Copy into buffer
        this.buffer.set(d.subarray(offset, len), 0);
        this.inputPos = windowSize;
        this.dictSize = windowSize;

        // Warm hash table
        const end = windowSize - MIN_MATCH;
        const base = this.buffer;
        const table = this.hashTable;

        const mask = HASH_MASK;
        const shift = HASH_SHIFT;

        for (let i = 0; i <= end; i++) {
            // 1. Read Sequence
            const seq = (base[i] | (base[i + 1] << 8) | (base[i + 2] << 16) | (base[i + 3] << 24));

            // 2. Hash (Bob Jenkins / lz4js variant inline)
            var h = seq;
            h = (h + 2127912214 + (h << 12)) | 0;
            h = (h ^ -949894596 ^ (h >>> 19)) | 0;
            h = (h + 374761393 + (h << 5)) | 0;
            h = (h + -744332180 ^ (h << 9)) | 0;
            h = (h + -42973499 + (h << 3)) | 0;
            h = (h ^ -1252372727 ^ (h >>> 16)) | 0;

            const hash = (h >>> shift) & mask;
            table[hash] = i + 1;
        }
    }

    /**
     * Adds data to the encoder stream.
     * @param {Uint8Array} chunk - Data to compress.
     * @returns {Uint8Array[]} Array of compressed LZ4 blocks.
     */
    update(chunk) {
        if (this.isClosed) throw new Error("LZ4: Encoder closed");
        const frames = [];

        if (!this.hasWrittenHeader) {
            frames.push(createFrameHeader(
                this.blockIndependence,
                this.contentChecksum,
                this.bdId,
                this.dictId
            ));
            this.hasWrittenHeader = true;
        }

        if (this.hasher) this.hasher.update(chunk);

        let srcIdx = 0;
        const srcLen = chunk.byteLength;

        while (srcIdx < srcLen) {
            const spaceAvailable = this.bufferCapacity - this.inputPos;
            const copyLen = Math.min(spaceAvailable, srcLen - srcIdx);

            this.buffer.set(chunk.subarray(srcIdx, srcIdx + copyLen), this.inputPos);
            this.inputPos += copyLen;
            srcIdx += copyLen;

            const newDataLen = this.inputPos - this.dictSize;
            if (newDataLen >= this.blockSize) {
                frames.push(this._flushBlock(false));
            }
        }

        return frames;
    }

    /**
     * Compresses the current buffer content into a block.
     * @param {boolean} isFinal - True if this is the last block of the stream.
     * @returns {Uint8Array} Compressed block or EndMark.
     * @private
     */
    _flushBlock(isFinal) {
        const srcStart = this.dictSize;
        const totalLen = this.inputPos;
        const dataLen = totalLen - srcStart;

        if (dataLen === 0 && !isFinal) return new Uint8Array(0);
        if (dataLen === 0 && isFinal) return this._createEndMark();

        const sizeToCompress = isFinal ? dataLen : this.blockSize;

        const worstCase = sizeToCompress + (sizeToCompress / 255 | 0) + 64;
        const output = new Uint8Array(4 + worstCase);

        const compSize = compressBlock(
            this.buffer,
            output.subarray(4),
            srcStart,
            sizeToCompress,
            this.hashTable
        );

        let resultBlock;

        // Decide between Compressed or Uncompressed block
        if (compSize > 0 && compSize < sizeToCompress) {
            writeU32(output, compSize, 0);
            resultBlock = output.subarray(0, 4 + compSize);
        } else {
            // Uncompressed flag: High bit set
            writeU32(output, sizeToCompress | 0x80000000, 0);
            output.set(this.buffer.subarray(srcStart, srcStart + sizeToCompress), 4);
            resultBlock = output.subarray(0, 4 + sizeToCompress);
        }

        const bytesCompressed = sizeToCompress;
        const bytesEnd = srcStart + bytesCompressed;

        // Window Management
        if (this.blockIndependence) {
            const leftovers = this.inputPos - bytesEnd;
            if (leftovers > 0) {
                this.buffer.copyWithin(0, bytesEnd, this.inputPos);
                this.inputPos = leftovers;
            } else {
                this.inputPos = 0;
            }
            this.dictSize = 0;
            this.hashTable.fill(0);
        } else {
            // Dependent Blocks: Shift window and adjust hash table
            const preserveLen = Math.min(this.maxWindowSize, bytesEnd);
            const shiftSrc = bytesEnd - preserveLen;
            const lenToMove = this.inputPos - shiftSrc;

            this.buffer.copyWithin(0, shiftSrc, this.inputPos);

            this.inputPos = lenToMove;
            this.dictSize = preserveLen;

            // Shift Hash Table indices
            const table = this.hashTable;
            const shift = shiftSrc;
            const tableSize = HASH_TABLE_SIZE;

            for (let i = 0; i < tableSize; i++) {
                const ref = table[i];
                if (ref > shift) {
                    table[i] = ref - shift;
                } else {
                    table[i] = 0;
                }
            }
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

        while ((this.inputPos - this.dictSize) > 0) {
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