
// --- Frame Constants ---
export const MAGIC_NUMBER = 0x184D2204 | 0;
export const LZ4_VERSION = 1 | 0;

// --- Frame Flags ---
export const FLG_VERSION_MASK = 0xC0 | 0;
export const FLG_BLOCK_INDEP_MASK = 0x20 | 0;
export const FLG_BLOCK_CHECKSUM_MASK = 0x10 | 0;
export const FLG_CONTENT_SIZE_MASK = 0x08 | 0;
export const FLG_CONTENT_CHECKSUM_MASK = 0x04 | 0;
export const FLG_DICT_ID_MASK = 0x01 | 0;

// --- Block Sizes ---
export const MAX_SIZE_64KB = 4 | 0;
export const MAX_SIZE_256KB = 5 | 0;
export const MAX_SIZE_1MB = 6 | 0;
export const MAX_SIZE_4MB = 7 | 0;

/** @type {Object<number, number>} */
export const BLOCK_MAX_SIZES = {
    4: 65536,
    5: 262144,
    6: 1048576,
    7: 4194304
};

export const DEFAULT_BLOCK_ID = MAX_SIZE_64KB;

// --- LZ4 Block Logic Constants (Moved from lz4.block.js) ---
export const MIN_MATCH = 4 | 0;
export const LAST_LITERALS = 5 | 0;
export const HASH_SEED = 0x9E3779B1 | 0;
export const HASH_LOG = 14 | 0;
export const HASH_SHIFT = (32 - HASH_LOG) | 0;
export const MAX_DISTANCE = 65535 | 0;
