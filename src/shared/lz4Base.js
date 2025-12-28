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
    DEFAULT_BLOCK_ID, FLG_BLOCK_INDEP_MASK, FLG_CONTENT_CHECKSUM_MASK, LZ4_VERSION,
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
     *
     * This method acts as a "guard" to ensure all internal LZ4 logic operates
     * strictly on binary buffers. It handles views, buffers, strings, and objects.
     *
     * @param {Uint8Array|ArrayBuffer|ArrayBufferView|string|Object} input - The raw input data.
     * @returns {Uint8Array} A Uint8Array view of the input data.
     * @throws {Error} If the input type is unsupported or if JSON serialization fails.
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
     * Writes a 32-bit unsigned integer to a buffer in Little-Endian format.
     *
     * @param {Uint8Array} buffer - The destination buffer.
     * @param {number} value - The integer value to write.
     * @param {number} offset - The index in the buffer to start writing at.
     * @returns {void}
     */
    static writeU32(buffer, value, offset) {
        buffer[offset] = value & 0xff;
        buffer[offset + 1] = (value >>> 8) & 0xff;
        buffer[offset + 2] = (value >>> 16) & 0xff;
        buffer[offset + 3] = (value >>> 24) & 0xff;
    }

    /**
     * Reads a 32-bit unsigned integer from a buffer in Little-Endian format.
     *
     * @param {Uint8Array} buffer - The source buffer.
     * @param {number} offset - The index to start reading from.
     * @returns {number} The unsigned 32-bit integer value.
     */
    static readU32(buffer, offset) {
        return (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24)) >>> 0;
    }

    /**
     * Writes a 16-bit unsigned integer to a buffer in Little-Endian format.
     *
     * @param {Uint8Array} buffer - The destination buffer.
     * @param {number} value - The integer value to write.
     * @param {number} offset - The index in the buffer to start writing at.
     * @returns {void}
     */
    static writeU16(buffer, value, offset) {
        buffer[offset] = value & 0xff;
        buffer[offset + 1] = (value >>> 8) & 0xff;
    }

    /**
     * Reads a 16-bit unsigned integer from a buffer in Little-Endian format.
     *
     * @param {Uint8Array} buffer - The source buffer.
     * @param {number} offset - The index to start reading from.
     * @returns {number} The unsigned 16-bit integer value.
     */
    static readU16(buffer, offset) {
        return (buffer[offset] | (buffer[offset + 1] << 8)) | 0;
    }

    /**
     * Maps a requested block size (in bytes) to the corresponding LZ4 Block ID.
     *
     * LZ4 supports specific block sizes: 64KB (4), 256KB (5), 1MB (6), and 4MB (7).
     * This method finds the smallest ID that fits the requested size.
     *
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
     *
     * The header consists of:
     * - Magic Number (4 bytes)
     * - FLG Byte (Version, Block Independence, Content Checksum)
     * - BD Byte (Block Max Size)
     * - Header Checksum (1 byte, xxHash32)
     *
     * @param {boolean} blockIndep - If true, blocks are independent (no dictionary dependencies).
     * @param {boolean} contentChecksum - If true, a checksum for the entire content is expected at the end.
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

        const headerHash = xxHash32(header.subarray(4, 6), 0);
        header[6] = (headerHash >>> 8) & 0xFF;

        return header;
    }
}