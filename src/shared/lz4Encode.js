
import {XXHash32Stream} from "../xxhash32/xxhash32.stream.js";
import {compressBlock} from "../block/blockCompress.js";
import {Lz4Base} from "./lz4Base.js";
import {BLOCK_MAX_SIZES} from "./constants.js";

/**
 * Stateful LZ4 Encoder Class.
 */
export class LZ4Encoder extends Lz4Base {
    constructor(options = {}) {
        super();
        this.blockIndependence = options.blockIndependence !== false;
        this.contentChecksum = options.contentChecksum !== false;

        // Config
        this.bdId = Lz4Base.getBlockId(options.maxBlockSize);
        this.maxBlockSize = BLOCK_MAX_SIZES[this.bdId];

        // State
        this.buffer = new Uint8Array(0);
        this.hasWrittenHeader = false;

        // Resources
        this.hashTable = new Uint16Array(16384);
        this.checksumStream = this.contentChecksum ? new XXHash32Stream(0) : null;

        // Scratch Buffer
        const worstCase = (this.maxBlockSize + (this.maxBlockSize / 255 | 0) + 32) | 0;
        this.scratchBuffer = new Uint8Array(worstCase);
    }

    update(chunk) {
        const output = [];

        // 1. Write Header
        if (!this.hasWrittenHeader) {
            output.push(Lz4Base.createFrameHeader(this.blockIndependence, this.contentChecksum, this.bdId));
            this.hasWrittenHeader = true;
        }

        // 2. Checksum & Buffering
        if (this.checksumStream) this.checksumStream.update(chunk);

        if (this.buffer.length > 0) {
            const newBuf = new Uint8Array(this.buffer.length + chunk.length);
            newBuf.set(this.buffer);
            newBuf.set(chunk, this.buffer.length);
            this.buffer = newBuf;
        } else {
            this.buffer = chunk;
        }

        // 3. Process Blocks
        while (this.buffer.length >= this.maxBlockSize) {
            const rawBlock = this.buffer.subarray(0, this.maxBlockSize);
            this.buffer = this.buffer.slice(this.maxBlockSize);

            output.push(this._encodeBlock(rawBlock));

            if (this.blockIndependence) this.hashTable.fill(0xFFFF);
        }
        return output;
    }

    finish() {
        const output = [];
        if (!this.hasWrittenHeader) {
            output.push(Lz4Base.createFrameHeader(this.blockIndependence, this.contentChecksum, this.bdId));
            this.hasWrittenHeader = true;
        }

        if (this.buffer.length > 0) {
            output.push(this._encodeBlock(this.buffer));
            this.buffer = new Uint8Array(0);
        }

        // EndMark
        const endMark = new Uint8Array(4);
        Lz4Base.writeU32(endMark, 0, 0);
        output.push(endMark);

        // Content Checksum
        if (this.checksumStream) {
            const buf = new Uint8Array(4);
            Lz4Base.writeU32(buf, this.checksumStream.finalize(), 0);
            output.push(buf);
        }
        return output;
    }

    _encodeBlock(rawBlock) {
        const dest = this.scratchBuffer.subarray(4);
        const compSize = compressBlock(rawBlock, dest, this.hashTable);
        const blockSize = rawBlock.length | 0;

        if (compSize > 0 && compSize < blockSize) {
            const header = new Uint8Array(4);
            Lz4Base.writeU32(header, compSize, 0);
            const block = new Uint8Array(4 + compSize);
            block.set(header, 0);
            block.set(dest.subarray(0, compSize), 4);
            return block;
        } else {
            const header = new Uint8Array(4);
            Lz4Base.writeU32(header, blockSize | 0x80000000, 0);
            const block = new Uint8Array(4 + blockSize);
            block.set(header, 0);
            block.set(rawBlock, 4);
            return block;
        }
    }
}
