/**
 * src/shared/constants.js
 * LZ4 Constants & Specifications.
 * Aligned with the official LZ4 Block Format 1.6.1 and Frame Format 1.6.1.
 */

// --- Frame Magic & Version ---
export const MAGIC_NUMBER = 0x184D2204 | 0;
export const LZ4_VERSION = 1 | 0;

// --- Frame Descriptor Flags (FLG) ---
// | Version(2) | B.Indep(1) | B.Checksum(1) | C.Size(1) | C.Checksum(1) | Reserved(1) | DictID(1) |
export const FLG_VERSION_MASK = 0xC0 | 0;
export const FLG_BLOCK_INDEP_MASK = 0x20 | 0;       // Set: Blocks are independent
export const FLG_BLOCK_CHECKSUM_MASK = 0x10 | 0;    // Set: Each block has a checksum
export const FLG_CONTENT_SIZE_MASK = 0x08 | 0;      // Set: Frame size is known (8 bytes)
export const FLG_CONTENT_CHECKSUM_MASK = 0x04 | 0;  // Set: Full content checksum at end
export const FLG_DICT_ID_MASK = 0x01 | 0;           // Set: Dictionary ID present

// --- Block Maximum Sizes (BD) ---
// 4: 64KB, 5: 256KB, 6: 1MB, 7: 4MB
export const MAX_SIZE_64KB = 4 | 0;
export const MAX_SIZE_256KB = 5 | 0;
export const MAX_SIZE_1MB = 6 | 0;
export const MAX_SIZE_4MB = 7 | 0;
export const DEFAULT_BLOCK_ID = MAX_SIZE_64KB;

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

// The limit where we stop searching for matches at the end of a block.
// Input - 12 bytes. (Last 5 literals + 7 bytes for match finding safety)
export const MF_LIMIT = (LAST_LITERALS + 7) | 0;

export const HASH_SEED = 0x9E3779B1 | 0;
// TUNING: Increased from 14 (16KB) to 16 (64KB) to match the Window Size.
// This reduces hash collisions and improves compression ratio.
export const HASH_LOG = 16 | 0;             // 64KB Hash Table (2^16)
export const HASH_TABLE_SIZE = (1 << HASH_LOG) | 0;
export const HASH_SHIFT = (32 - HASH_LOG) | 0;

// Window / Dictionary Constants
export const WINDOW_SIZE = 65536 | 0;       // 64KB History
export const MAX_DISTANCE = 65535 | 0;      // Max offset value (UInt16)
export const DICT_SIZE = 65536 | 0;         // Size of Dictionary Buffer

// Internal tuning
export const SKIP_STRENGTH = 6 | 0;         // For future acceleration