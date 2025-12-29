/**
 * src/shared/lz4Encode.js
 * Stateful LZ4 Encoder for streaming compression.
 * Optimized to match blockCompress.js hash logic.
 */

import { XXHash32 } from "../xxhash32/xxhash32Stateful.js";
import { compressBlock } from "../block/blockCompress.js";
import { Lz4Base } from "./lz4Base.js";
import {
    BLOCK_MAX_SIZES,
    HASH_TABLE_SIZE,
    MIN_MATCH,
    HASH_SHIFT
} from "./constants.js";

export class LZ4Encoder {
    /**
     * @param {Uint8Array|null} [dictionary=null]
     * @param {number} [maxBlockSize=4194304] - Default 4MB
     * @param {boolean} [blockIndependence=false]
     * @param {boolean} [contentChecksum=false]
     */
    constructor(dictionary = null, maxBlockSize = 4194304, blockIndependence = false, contentChecksum = false) {
        this.blockIndependence = blockIndependence;
        this.contentChecksum = contentChecksum;
        this.bdId = Lz4Base.getBlockId(maxBlockSize);
        this.blockSize = BLOCK_MAX_SIZES[this.bdId];

        this.maxWindowSize = 65536;
        this.bufferCapacity = this.maxWindowSize + this.blockSize + 4096;
        this.buffer = new Uint8Array(this.bufferCapacity);

        // OPTIMIZATION: Use Uint32Array to match blockCompress.js
        this.hashTable = new Uint32Array(HASH_TABLE_SIZE);

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

    _initDictionary(dict) {
        const d = Lz4Base.ensureBuffer(dict);

        // Calculate DictID (Standard xxHash32)
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
        // CRITICAL FIX: Must use the EXACT same hash algorithm as blockCompress.js
        const end = windowSize - MIN_MATCH;
        const base = this.buffer;
        const table = this.hashTable;
        const HASH_MASK = (HASH_TABLE_SIZE - 1) | 0;

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

            const hash = (h >>> HASH_SHIFT) & HASH_MASK;

            // 3. Store (1-based index)
            table[hash] = i + 1;
        }
    }

    update(chunk) {
        if (this.isClosed) throw new Error("LZ4: Encoder closed");
        const frames = [];

        if (!this.hasWrittenHeader) {
            frames.push(Lz4Base.createFrameHeader(
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

        if (compSize > 0 && compSize < sizeToCompress) {
            Lz4Base.writeU32(output, compSize, 0);
            resultBlock = output.subarray(0, 4 + compSize);
        } else {
            Lz4Base.writeU32(output, sizeToCompress | 0x80000000, 0);
            output.set(this.buffer.subarray(srcStart, srcStart + sizeToCompress), 4);
            resultBlock = output.subarray(0, 4 + sizeToCompress);
        }

        const bytesCompressed = sizeToCompress;
        const bytesEnd = srcStart + bytesCompressed;

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

            const table = this.hashTable;
            const shift = shiftSrc;

            // Adjust hash table indices
            // 1-based indexing: if (ref > shift) newRef = ref - shift;
            for (let i = 0; i < HASH_TABLE_SIZE; i++) {
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

    _createEndMark() {
        const b = new Uint8Array(4);
        Lz4Base.writeU32(b, 0, 0);
        return b;
    }

    finish() {
        if (this.isClosed) return [];
        this.isClosed = true;

        const frames = [];

        if (!this.hasWrittenHeader) {
            frames.push(Lz4Base.createFrameHeader(this.blockIndependence, this.contentChecksum, this.bdId, this.dictId));
        }

        while ((this.inputPos - this.dictSize) > 0) {
            frames.push(this._flushBlock(true));
        }

        frames.push(this._createEndMark());

        if (this.contentChecksum && this.hasher) {
            const digest = this.hasher.digest();
            const b = new Uint8Array(4);
            Lz4Base.writeU32(b, digest, 0);
            frames.push(b);
        }

        return frames;
    }
}