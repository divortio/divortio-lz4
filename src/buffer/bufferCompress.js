import { xxHash32 } from '../xxhash32/xxhash32.js';
import { compressBlock } from '../block/blockCompress.js';
import { BLOCK_MAX_SIZES } from '../shared/constants.js';
import { Lz4Base } from '../shared/lz4Base.js';

/**
 * Compresses data into an LZ4 Frame (Synchronous).
 * **Optimization:** Single-pass allocation.
 *
 * @param {string|Object|ArrayBuffer|Uint8Array|ArrayBufferView} input - Data to compress.
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary.
 * @param {number} [maxBlockSize=65536] - Target block size (default 64KB).
 * @param {boolean} [blockIndependence=false] - If false, blocks can match previous blocks (better ratio).
 * @param {boolean} [contentChecksum=false] - If true, appends xxHash32 (slower).
 * @returns {Uint8Array} The complete LZ4 Frame.
 */
export function compressBuffer(input, dictionary = null, maxBlockSize = 65536, blockIndependence = false, contentChecksum = false) {
    const data = Lz4Base.ensureBuffer(input);
    const len = data.length | 0;

    // Resolve Block Size ID
    const bdId = Lz4Base.getBlockId(maxBlockSize);
    const resolvedBlockSize = BLOCK_MAX_SIZES[bdId] | 0;

    // --- 1. Allocation Strategy (Worst Case) ---
    // Worst case: input + 0.4% + header + footer.
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
    let currentDict = dictionary;

    while (srcPos < len) {
        const end = Math.min(srcPos + resolvedBlockSize, len) | 0;
        const blockSize = (end - srcPos) | 0;

        // Reserve 4 bytes for Block Size
        const sizePos = outPos;
        outPos = (outPos + 4) | 0;

        const rawBlock = data.subarray(srcPos, end);
        const destView = output.subarray(outPos);

        // Compress
        const compSize = compressBlock(rawBlock, destView, hashTable, currentDict);

        if (compSize > 0 && compSize < blockSize) {
            // Compressed
            Lz4Base.writeU32(output, compSize, sizePos);
            outPos = (outPos + compSize) | 0;
        } else {
            // Uncompressed
            Lz4Base.writeU32(output, blockSize | 0x80000000, sizePos);
            output.set(rawBlock, outPos);
            outPos = (outPos + blockSize) | 0;
        }

        // Update Dictionary Context
        if (blockIndependence) {
            hashTable.fill(0xFFFF);
            currentDict = null;
        } else {
            currentDict = rawBlock;
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

    return output.subarray(0, outPos);
}