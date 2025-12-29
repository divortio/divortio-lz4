/**
 * src/shared/lz4Base.js
 * Low-level binary utilities and Frame Format helpers for LZ4.
 */

import {
    MAGIC_NUMBER, LZ4_VERSION,
    FLG_BLOCK_INDEPENDENCE_MASK, FLG_CONTENT_CHECKSUM_MASK,
    FLG_DICT_ID_MASK,
    BLOCK_MAX_SIZES
} from './constants.js';

import { xxHash32 } from '../xxhash32/xxhash32.js';

export const Lz4Base = {

    /**
     * Ensures the input is a Uint8Array.
     * Automatically coerces Strings, Arrays, and JSON-serializable Objects.
     * * @param {string|ArrayBuffer|ArrayBufferView|Array<number>|Object} input
     * @returns {Uint8Array}
     */
    ensureBuffer(input) {
        if (input instanceof Uint8Array) return input;
        if (typeof input === 'string') return new TextEncoder().encode(input);
        if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
        if (input instanceof ArrayBuffer) return new Uint8Array(input);
        if (Array.isArray(input)) return new Uint8Array(input);

        // FIX: Handle Plain Objects (JSON) to satisfy "Universal" API expectations
        if (typeof input === 'object' && input !== null) {
            try {
                const json = JSON.stringify(input);
                if (json !== undefined) {
                    return new TextEncoder().encode(json);
                }
            } catch (e) {
                // If serialization fails, fall through to TypeError
            }
        }

        throw new TypeError("LZ4: Input must be a String, ArrayBuffer, View, Array, or Serializable Object");
    },

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

    getBlockId(bytes) {
        if (!bytes || bytes <= 65536) return 4;
        if (bytes <= 262144) return 5;
        if (bytes <= 1048576) return 6;
        return 7;
    },

    createFrameHeader(blockIndependence, contentChecksum, blockId, dictId = null) {
        const headerLen = dictId !== null ? 11 : 7;
        const header = new Uint8Array(headerLen);

        header[0] = 0x04; header[1] = 0x22; header[2] = 0x4D; header[3] = 0x18;

        let flg = (LZ4_VERSION << 6);
        if (blockIndependence) flg |= FLG_BLOCK_INDEPENDENCE_MASK;
        if (contentChecksum) flg |= FLG_CONTENT_CHECKSUM_MASK;
        if (dictId !== null) flg |= FLG_DICT_ID_MASK;
        header[4] = flg;

        header[5] = (blockId & 0x07) << 4;

        let hcPos = 6;
        if (dictId !== null) {
            this.writeU32(header, dictId, 6);
            hcPos = 10;
        }

        const headerHash = xxHash32(header.subarray(4, hcPos), 0);
        header[hcPos] = (headerHash >>> 8) & 0xFF;

        return header;
    }
};