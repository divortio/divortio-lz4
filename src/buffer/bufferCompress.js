import { xxHash32 } from '../xxhash32/xxhash32.js';
import { compressBlock } from '../block/blockCompress.js';
import {
 BLOCK_MAX_SIZES, DEFAULT_BLOCK_ID
} from '../shared/constants.js';

import {Lz4Base} from "../shared/lz4Base.js";

/**
 * Compresses data into an LZ4 Frame (Synchronous).
 * **Optimization:** Single-pass allocation.
 *
 * @param {string|Object|ArrayBuffer|ArrayBufferView} input - Data to compress.
 * @param {Object} [options]
 * @param {boolean} [options.blockIndependence=true] - If true, blocks are independent (no dict).
 * @param {boolean} [options.contentChecksum=true] - If true, appends xxHash32 of original content.
 * @param {number} [options.maxBlockSize=65536] - Target block size.
 * @returns {Uint8Array} The complete LZ4 Frame.
 */
export function compressBuffer(input, options = {}) {
    const data = Lz4Base.ensureBuffer(input);
    const len = data.length | 0;

    // Configuration
    const blockIndependence = options.blockIndependence !== false;
    const contentChecksum = options.contentChecksum !== false;

    // Resolve Block Size
    const bdId = Lz4Base.getBlockId(options.maxBlockSize);
    const maxBlockSize = BLOCK_MAX_SIZES[bdId] | 0;

    // --- 1. Allocation Strategy (Worst Case) ---
    const worstCaseSize = (len + (len / 255 | 0) + 64) | 0;
    const output = new Uint8Array(worstCaseSize);
    let outPos = 0 | 0;

    // --- 2. Write Header ---
    const header = Lz4Base.createFrameHeader(blockIndependence, contentChecksum, bdId);
    output.set(header, outPos);
    outPos = (outPos + header.length) | 0;

    // --- 3. Compress Blocks ---
    const hashTable = new Uint16Array(16384);
    let srcPos = 0 | 0;

    while (srcPos < len) {
        const end = Math.min(srcPos + maxBlockSize, len) | 0;
        const blockSize = (end - srcPos) | 0;

        // Reserve 4 bytes for Block Size
        const sizePos = outPos;
        outPos = (outPos + 4) | 0;

        // View of current raw block
        const rawBlock = data.subarray(srcPos, end);

        // Try Compress directly into output buffer
        const destView = output.subarray(outPos);
        const compSize = compressBlock(rawBlock, destView, hashTable);

        // Decision: Compressed vs Uncompressed
        if (compSize > 0 && compSize < blockSize) {
            // KEEP COMPRESSED
            Lz4Base.writeU32(output, compSize, sizePos);
            outPos = (outPos + compSize) | 0;
        } else {
            // DISCARD COMPRESSED -> COPY RAW
            // Uncompressed flag: High bit of size (0x80000000)
            Lz4Base.writeU32(output, blockSize | 0x80000000, sizePos);
            output.set(rawBlock, outPos);
            outPos = (outPos + blockSize) | 0;
        }

        if (blockIndependence) {
            hashTable.fill(0xFFFF);
        }

        srcPos = end;
    }

    // --- 4. EndMark ---
    Lz4Base.writeU32(output, 0, outPos);
    outPos = (outPos + 4) | 0;

    // --- 5. Content Checksum ---
    if (contentChecksum) {
        const fullHash = xxHash32(data, 0);
        Lz4Base.writeU32(output, fullHash, outPos);
        outPos = (outPos + 4) | 0;
    }

    // Return view of exactly utilized bytes
    return output.subarray(0, outPos);
}