import { xxHash32 } from '../xxhash32/xxhash32.js';
import { compressBlock } from '../block/blockCompress.js';
import { BLOCK_MAX_SIZES, HASH_TABLE_SIZE, MIN_MATCH } from '../shared/constants.js';
import { Lz4Base } from '../shared/lz4Base.js';

/**
 * Compresses data into an LZ4 Frame (Synchronous).
 * **Optimization:** Single-pass allocation.
 *
 * @param {string|Object|ArrayBuffer|Uint8Array|ArrayBufferView} input - Data to compress.
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary.
 * @param {number} [maxBlockSize=65536] - Target block size (default 64KB).
 * @param {boolean} [blockIndependence=false] - If false, blocks can match previous blocks.
 * @param {boolean} [contentChecksum=false] - If true, appends xxHash32 (slower).
 * @returns {Uint8Array} The complete LZ4 Frame.
 */
export function compressBuffer(input, dictionary = null, maxBlockSize = 65536, blockIndependence = false, contentChecksum = false) {
    const rawInput = Lz4Base.ensureBuffer(input);

    // --- 1. Prepare Buffer & Dictionary ---
    // If we have a dictionary, we must combine it with input to allow the compressor
    // to "look back" into the dictionary.
    // Buffer Layout: [ ...Dictionary... | ...Input... ]

    let workingBuffer = rawInput;
    let inputStartOffset = 0;
    let dictLen = 0;

    if (dictionary && dictionary.length > 0) {
        // Limit dictionary to last 64KB (LZ4 Window Limit)
        const dictWindow = dictionary.length > 65536 ? dictionary.subarray(dictionary.length - 65536) : dictionary;
        dictLen = dictWindow.length;

        // Create combined buffer
        workingBuffer = new Uint8Array(dictLen + rawInput.length);
        workingBuffer.set(dictWindow, 0);
        workingBuffer.set(rawInput, dictLen);
        inputStartOffset = dictLen;
    }

    const len = rawInput.length | 0; // Length of actual data to compress

    // Resolve Block Size ID
    const bdId = Lz4Base.getBlockId(maxBlockSize);
    const resolvedBlockSize = BLOCK_MAX_SIZES[bdId] | 0;

    // --- 2. Allocation Strategy ---
    const worstCaseSize = (len + (len / 255 | 0) + 64) | 0;
    const output = new Uint8Array(worstCaseSize);
    let outPos = 0 | 0;

    // --- 3. Write Header ---
    const header = Lz4Base.createFrameHeader(blockIndependence, contentChecksum, bdId);
    output.set(header, outPos);
    outPos = (outPos + header.length) | 0;

    // --- 4. Compress Blocks ---
    const hashTable = new Int32Array(HASH_TABLE_SIZE);
    hashTable.fill(-1);

    // Dictionary Pre-Warming
    // If we have a dictionary, we must hash it into the table so `compressBlock` can find matches.
    if (dictLen > 0) {
        const end = dictLen - MIN_MATCH;
        for (let i = 0; i <= end; i++) {
            const seq = (workingBuffer[i] | (workingBuffer[i + 1] << 8) | (workingBuffer[i + 2] << 16) | (workingBuffer[i + 3] << 24));
            const hash = (Math.imul(seq, 0x9E3779B1) >>> (32 - 14)) & (HASH_TABLE_SIZE - 1);
            hashTable[hash] = i;
        }
    }

    let srcPos = inputStartOffset;
    const totalEnd = inputStartOffset + len;

    while (srcPos < totalEnd) {
        const end = Math.min(srcPos + resolvedBlockSize, totalEnd) | 0;
        const blockSize = (end - srcPos) | 0;

        // Reserve 4 bytes for Block Size
        const sizePos = outPos;
        outPos = (outPos + 4) | 0;

        const destView = output.subarray(outPos);

        // Compress using the combined buffer
        // srcPos is absolute index in workingBuffer (starts after dictionary)
        const compSize = compressBlock(workingBuffer, destView, srcPos, blockSize, hashTable);

        if (compSize > 0 && compSize < blockSize) {
            // Compressed
            Lz4Base.writeU32(output, compSize, sizePos);
            outPos = (outPos + compSize) | 0;
        } else {
            // Uncompressed -> Copy Raw
            Lz4Base.writeU32(output, blockSize | 0x80000000, sizePos);
            output.set(workingBuffer.subarray(srcPos, end), outPos);
            outPos = (outPos + blockSize) | 0;
        }

        // Reset hash table for next block if independent
        // Note: If dependent, we leave the hash table as is (Sliding Window)
        if (blockIndependence) {
            hashTable.fill(-1);
        }

        srcPos = end;
    }

    // --- 5. EndMark ---
    Lz4Base.writeU32(output, 0, outPos);
    outPos = (outPos + 4) | 0;

    // --- 6. Content Checksum ---
    if (contentChecksum) {
        const fullHash = xxHash32(rawInput, 0); // Hash ONLY the input data
        Lz4Base.writeU32(output, fullHash, outPos);
        outPos = (outPos + 4) | 0;
    }

    return output.subarray(0, outPos);
}