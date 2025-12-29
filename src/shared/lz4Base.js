/**
 * @fileoverview Shared low-level utilities for LZ4 Frame processing.
 *
 * This module provides the foundational binary operations required by both
 * compression and decompression, including:
 * - Input normalization (Buffer casting).
 * - Little-Endian integer reading/writing.
 * - Frame Header generation.
 * - Block Size ID resolution.
 *
 * These helpers are stateless and used across buffer, stream, and async implementations.
 *
 * @module shared/lz4Base
 */

import {xxHash32} from "../xxhash32/xxhash32.js";
import {
    DEFAULT_BLOCK_ID,
    FLG_BLOCK_INDEP_MASK,
    FLG_CONTENT_CHECKSUM_MASK,
    LZ4_VERSION,
    MAGIC_NUMBER,
    MAX_SIZE_1MB,
    MAX_SIZE_256KB,
    MAX_SIZE_4MB,
    MAX_SIZE_64KB
} from "./constants.js";

/**
 * Base utility class for LZ4 operations.
 * Contains static helper methods for binary manipulation and header management.
 * @namespace
 */
export class Lz4Base {

    /**
     * Normalizes various input types into a standard Uint8Array.
     * @param {Uint8Array|ArrayBuffer|ArrayBufferView|string|Object} input
     * @returns {Uint8Array}
     */
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

    /**
     * Writes a 32-bit unsigned integer to a buffer (Little-Endian).
     * @param {Uint8Array} buffer
     * @param {number} value
     * @param {number} offset
     */
    static writeU32(buffer, value, offset) {
        buffer[offset] = value & 0xff;
        buffer[offset + 1] = (value >>> 8) & 0xff;
        buffer[offset + 2] = (value >>> 16) & 0xff;
        buffer[offset + 3] = (value >>> 24) & 0xff;
    }

    /**
     * Reads a 32-bit unsigned integer from a buffer (Little-Endian).
     * @param {Uint8Array} buffer
     * @param {number} offset
     * @returns {number}
     */
    static readU32(buffer, offset) {
        return (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24)) >>> 0;
    }

    /**
     * Writes a 16-bit unsigned integer to a buffer (Little-Endian).
     * @param {Uint8Array} buffer
     * @param {number} value
     * @param {number} offset
     */
    static writeU16(buffer, value, offset) {
        buffer[offset] = value & 0xff;
        buffer[offset + 1] = (value >>> 8) & 0xff;
    }

    /**
     * Reads a 16-bit unsigned integer from a buffer (Little-Endian).
     * @param {Uint8Array} buffer
     * @param {number} offset
     * @returns {number}
     */
    static readU16(buffer, offset) {
        return (buffer[offset] | (buffer[offset + 1] << 8)) | 0;
    }

    /**
     * Maps a requested block size (in bytes) to the corresponding LZ4 Block ID.
     * @param {number} [reqSize] - The requested block size in bytes.
     * @returns {number} The LZ4 Block ID (4, 5, 6, or 7).
     */
    static getBlockId(reqSize) {
        if (!reqSize) return DEFAULT_BLOCK_ID;
        if (reqSize >= 4194304) return MAX_SIZE_4MB;
        if (reqSize >= 1048576) return MAX_SIZE_1MB;
        if (reqSize >= 262144) return MAX_SIZE_256KB;
        return MAX_SIZE_64KB;
    }

    /**
     * Constructs the standard LZ4 Frame Header.
     * @param {boolean} blockIndep - If true, blocks are independent.
     * @param {boolean} contentChecksum - If true, append checksum at end.
     * @param {number} bdId - The Block Max Size ID (4-7).
     * @returns {Uint8Array} A 7-byte buffer containing the complete Frame Header.
     */
    static createFrameHeader(blockIndep, contentChecksum, bdId) {
        const header = new Uint8Array(7);
        Lz4Base.writeU32(header, MAGIC_NUMBER, 0);

        let flg = (LZ4_VERSION << 6);
        if (blockIndep) flg |= FLG_BLOCK_INDEP_MASK;
        if (contentChecksum) flg |= FLG_CONTENT_CHECKSUM_MASK;
        header[4] = flg;

        const bd = (bdId << 4) & 0x70;
        header[5] = bd;

        // Header Checksum: Second byte of xxHash32 of the header flags (bytes 4-5)
        // Spec: "The hash is computed over the FLG and BD bytes."
        const headerHash = xxHash32(header.subarray(4, 6), 0);
        header[6] = (headerHash >>> 8) & 0xFF;

        return header;
    }
}