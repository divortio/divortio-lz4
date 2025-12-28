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
 * Stateful LZ4 Decoder.
 */
export class LZ4Decoder extends Lz4Base {
    constructor(options = {}) {
        super();
        this.buffer = new Uint8Array(0);
        this.state = 'MAGIC';
        this.checksumStream = null;
        this.workspace = new Uint8Array(0);

        // Header Flags
        this.maxBlockSize = 65536;
        this.hasBlockChecksum = false;
        this.hasContentChecksum = false;
        this.currentBlockSize = 0;
        this.isUncompressed = false;
    }

    update(chunk) {
        if (!chunk || chunk.length === 0) return [];

        // Append to buffer
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
            if (this.state === 'MAGIC') {
                if (this.buffer.length < 4) break;
                if (Lz4Base.readU32(this.buffer, 0) !== MAGIC_NUMBER) throw new Error("LZ4: Invalid Magic");
                this.buffer = this.buffer.slice(4);
                this.state = 'HEADER';
            }

            if (this.state === 'HEADER') {
                if (this.buffer.length < 3) break;
                const flg = this.buffer[0];
                const bd = this.buffer[1];

                let headerSize = 3;
                if (flg & FLG_CONTENT_SIZE_MASK) headerSize += 8;
                if (flg & FLG_DICT_ID_MASK) headerSize += 4;

                if (this.buffer.length < headerSize) break;

                // Verify Header Hash
                const storedHc = this.buffer[headerSize - 1];
                const computedHc = (xxHash32(this.buffer.subarray(0, headerSize - 1), 0) >>> 8) & 0xFF;
                if (storedHc !== computedHc) throw new Error("LZ4: Header Checksum Error");

                // Config
                this.hasContentChecksum = (flg & FLG_CONTENT_CHECKSUM_MASK) !== 0;
                this.hasBlockChecksum = (flg & FLG_BLOCK_CHECKSUM_MASK) !== 0;
                this.maxBlockSize = BLOCK_MAX_SIZES[(bd & 0x70) >> 4] || 65536;

                if (this.hasContentChecksum) this.checksumStream = new XXHash32Stream(0);
                if (this.workspace.length < this.maxBlockSize) this.workspace = new Uint8Array(this.maxBlockSize);

                this.buffer = this.buffer.slice(headerSize);
                this.state = 'BLOCK_SIZE';
            }

            if (this.state === 'BLOCK_SIZE') {
                if (this.buffer.length < 4) break;
                const field = Lz4Base.readU32(this.buffer, 0);
                this.buffer = this.buffer.slice(4);

                if (field === 0) {
                    this.state = 'CHECKSUM';
                    continue;
                }
                this.currentBlockSize = field & 0x7FFFFFFF;
                this.isUncompressed = (field & 0x80000000) !== 0;
                this.state = 'BLOCK_BODY';
            }

            if (this.state === 'BLOCK_BODY') {
                let needed = this.currentBlockSize;
                if (this.hasBlockChecksum) needed += 4;

                if (this.buffer.length < needed) break;

                const blockData = this.buffer.subarray(0, this.currentBlockSize);
                this.buffer = this.buffer.slice(needed);

                let decodedChunk;
                if (this.isUncompressed) {
                    decodedChunk = blockData.slice(0);
                } else {
                    const written = decompressBlock(blockData, this.workspace);
                    decodedChunk = this.workspace.slice(0, written);
                }

                if (this.checksumStream) this.checksumStream.update(decodedChunk);
                output.push(decodedChunk);
                this.state = 'BLOCK_SIZE';
            }

            if (this.state === 'CHECKSUM') {
                if (this.hasContentChecksum) {
                    if (this.buffer.length < 4) break;
                    const stored = Lz4Base.readU32(this.buffer, 0);
                    // @ts-ignore
                    if (stored !== this.checksumStream.finalize()) throw new Error("LZ4: Content Checksum Error");
                    this.buffer = this.buffer.slice(4);
                }
                break;
            }
        }
        return output;
    }
}
