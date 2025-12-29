/**
 * src/shared/constants.js
 * LZ4 Constants & Specifications.
 */

// --- Frame Magic & Version ---
export const MAGIC_NUMBER = 0x184D2204 | 0;
export const LZ4_VERSION = 1 | 0;

// --- Frame Descriptor Flags (FLG) ---
export const FLG_VERSION_MASK = 0xC0 | 0;
export const FLG_BLOCK_INDEPENDENCE_MASK = 0x20 | 0;
export const FLG_BLOCK_INDEP_MASK = FLG_BLOCK_INDEPENDENCE_MASK;
export const FLG_BLOCK_CHECKSUM_MASK = 0x10 | 0;
export const FLG_CONTENT_SIZE_MASK = 0x08 | 0;
export const FLG_CONTENT_CHECKSUM_MASK = 0x04 | 0;
export const FLG_DICT_ID_MASK = 0x01 | 0;

// --- Block Maximum Sizes (BD) ---
export const MAX_SIZE_64KB = 4 | 0;
export const MAX_SIZE_256KB = 5 | 0;
export const MAX_SIZE_1MB = 6 | 0;
export const MAX_SIZE_4MB = 7 | 0;

// UPDATED: Default is now 4MB (Standard LZ4 behavior)
export const DEFAULT_BLOCK_ID = MAX_SIZE_4MB;

/** @type {Object<number, number>} Map ID to Bytes */
export const BLOCK_MAX_SIZES = {
    4: 65536,
    5: 262144,
    6: 1048576,
    7: 4194304
};

// --- LZ4 Block Compression Constants ---
export const MIN_MATCH = 4 | 0;
export const LAST_LITERALS = 5 | 0;
export const MF_LIMIT = (LAST_LITERALS + 7) | 0;

export const HASH_SEED = 0x9E3779B1 | 0;
export const HASH_LOG = 16 | 0;
export const HASH_TABLE_SIZE = (1 << HASH_LOG) | 0;
export const HASH_SHIFT = (32 - HASH_LOG) | 0;

export const WINDOW_SIZE = 65536 | 0;
export const MAX_DISTANCE = 65535 | 0;
export const DICT_SIZE = 65536 | 0;

export const SKIP_STRENGTH = 6 | 0;