
// --- Shared Helpers ---
import {xxHash32} from "../xxhash32/xxhash32.js";
import {
    DEFAULT_BLOCK_ID, FLG_BLOCK_INDEP_MASK, FLG_CONTENT_CHECKSUM_MASK, LZ4_VERSION,
    MAGIC_NUMBER,
    MAX_SIZE_1MB,
    MAX_SIZE_256KB,
    MAX_SIZE_4MB,
    MAX_SIZE_64KB
} from "./constants.js";

export class Lz4Base {
    /** Normalizes input to Uint8Array. */
    static ensureBuffer(input) {
        if (input instanceof Uint8Array) return input;
        if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
        if (input instanceof ArrayBuffer) return new Uint8Array(input);
        if (typeof input === 'string') return new TextEncoder().encode(input);
        if (typeof input === 'object' && input !== null) {
            try { return new TextEncoder().encode(JSON.stringify(input)); }
            catch (e) { throw new Error("LZ4: Failed to serialize Object input to JSON."); }
        }
        throw new Error(`LZ4: Unsupported input type: ${typeof input}`);
    }

    /** Writes uint32 LE */
    static writeU32(buffer, value, offset) {
        buffer[offset] = value & 0xff;
        buffer[offset + 1] = (value >>> 8) & 0xff;
        buffer[offset + 2] = (value >>> 16) & 0xff;
        buffer[offset + 3] = (value >>> 24) & 0xff;
    }

    /** Reads uint32 LE */
    static readU32(buffer, offset) {
        return (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24)) >>> 0;
    }

    /** Writes uint16 LE */
    static writeU16(buffer, value, offset) {
        buffer[offset] = value & 0xff;
        buffer[offset + 1] = (value >>> 8) & 0xff;
    }

    /** Reads uint16 LE */
    static readU16(buffer, offset) {
        return (buffer[offset] | (buffer[offset + 1] << 8)) | 0;
    }

    /** Resolves Block Size ID */
    static getBlockId(reqSize) {
        if (!reqSize) return DEFAULT_BLOCK_ID;
        if (reqSize >= 4194304) return MAX_SIZE_4MB;
        if (reqSize >= 1048576) return MAX_SIZE_1MB;
        if (reqSize >= 262144) return MAX_SIZE_256KB;
        return MAX_SIZE_64KB;
    }

    /** Generates Frame Header */
    static createFrameHeader(blockIndep, contentChecksum, bdId) {
        const header = new Uint8Array(7);
        Lz4Base.writeU32(header, MAGIC_NUMBER, 0);

        let flg = (LZ4_VERSION << 6);
        if (blockIndep) flg |= FLG_BLOCK_INDEP_MASK;
        if (contentChecksum) flg |= FLG_CONTENT_CHECKSUM_MASK;
        header[4] = flg;

        const bd = (bdId << 4) & 0x70;
        header[5] = bd;

        const headerHash = xxHash32(header.subarray(4, 6), 0);
        header[6] = (headerHash >>> 8) & 0xFF;

        return header;
    }
}