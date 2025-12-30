/**
 * tests/lz4TestUtils.js
 * Shared utilities and constants for the LZ4 Test Suite.
 * Acts as a "Reference Implementation" to verify the optimized source code.
 */

import { xxHash32 } from '../src/xxhash32/xxhash32.js';
import { ensureBuffer } from '../src/shared/lz4Util.js';

// --- Constants ---
export const MAGIC_NUMBER = 0x184D2204;
export const LZ4_VERSION = 1;

export const FLG_BLOCK_INDEPENDENCE_MASK = 0x20;
export const FLG_BLOCK_CHECKSUM_MASK = 0x10;
export const FLG_CONTENT_SIZE_MASK = 0x08;
export const FLG_CONTENT_CHECKSUM_MASK = 0x04;
export const FLG_DICT_ID_MASK = 0x01;

export const MIN_MATCH = 4;
export const LAST_LITERALS = 5;
export const MF_LIMIT = 12;

export const BLOCK_MAX_SIZES = {
    4: 65536,
    5: 262144,
    6: 1048576,
    7: 4194304
};

export const FLG_BLOCK_INDEP_MASK = FLG_BLOCK_INDEPENDENCE_MASK;
// --- Helpers ---

export const Lz4TestUtils = {
    ensureBuffer,

    readU32(b, n) {
        return (b[n] | (b[n + 1] << 8) | (b[n + 2] << 16) | (b[n + 3] << 24)) >>> 0;
    },

    readU16(b, n) {
        return (b[n] | (b[n + 1] << 8));
    },

    writeU32(b, i, n) {
        b[n] = i & 0xFF;
        b[n + 1] = (i >>> 8) & 0xFF;
        b[n + 2] = (i >>> 16) & 0xFF;
        b[n + 3] = (i >>> 24) & 0xFF;
    },


    writeU16(b, i, n) {
        b[n] = i & 0xFF;
        b[n + 1] = (i >>> 8) & 0xFF;
    },

    /**
     * Helper to calculate Block ID from size (for tests verification)
     */
    getBlockId(bytes) {
        if (!bytes || bytes <= 65536) return 4;
        if (bytes <= 262144) return 5;
        if (bytes <= 1048576) return 6;
        return 7;
    },

    /**
     * Generates a valid LZ4 Frame Header for testing.
     */
    createFrameHeader(blockIndependence, contentChecksum, blockId, dictId = null) {
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

        // Block Descriptor
        header[5] = (blockId & 0x07) << 4;

        let hcPos = 6;
        if (dictId !== null) {
            this.writeU32(header, dictId, 6);
            hcPos = 10;
        }

        // Header Checksum
        const headerHash = xxHash32(header.subarray(4, hcPos), 0);
        header[hcPos] = (headerHash >>> 8) & 0xFF;

        return header;
    }
};