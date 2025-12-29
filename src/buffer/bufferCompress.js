import { xxHash32 } from '../xxhash32/xxhash32.js';
import { compressBlock } from '../block/blockCompress.js';
import {
    BLOCK_MAX_SIZES,
    HASH_TABLE_SIZE,
    MIN_MATCH,
    HASH_SHIFT
} from '../shared/constants.js';
import { Lz4Base } from '../shared/lz4Base.js';

const GLOBAL_HASH_TABLE = new Uint32Array(HASH_TABLE_SIZE);

export function compressBuffer(input, dictionary = null, maxBlockSize = 4194304, blockIndependence = false, contentChecksum = false) {
    const rawInput = Lz4Base.ensureBuffer(input);

    let workingBuffer = rawInput;
    let inputStartOffset = 0;
    let dictLen = 0;
    let dictId = null;

    if (dictionary && dictionary.length > 0) {
        const dictBuffer = Lz4Base.ensureBuffer(dictionary);
        dictId = xxHash32(dictBuffer, 0);

        const dictWindow = dictBuffer.length > 65536 ? dictBuffer.subarray(dictBuffer.length - 65536) : dictBuffer;
        dictLen = dictWindow.length;

        workingBuffer = new Uint8Array(dictLen + rawInput.length);
        workingBuffer.set(dictWindow, 0);
        workingBuffer.set(rawInput, dictLen);
        inputStartOffset = dictLen;
    }

    const len = rawInput.length | 0;
    const bdId = Lz4Base.getBlockId(maxBlockSize);
    const resolvedBlockSize = BLOCK_MAX_SIZES[bdId] | 0;

    const worstCaseSize = (15 + len + (len / 255 | 0) + 64 + 8) | 0;
    const output = new Uint8Array(worstCaseSize);
    let outPos = 0 | 0;

    // Header
    const header = Lz4Base.createFrameHeader(blockIndependence, contentChecksum, bdId, dictId);
    output.set(header, outPos);
    outPos = (outPos + header.length) | 0;

    // Compress Blocks
    const hashTable = GLOBAL_HASH_TABLE;
    hashTable.fill(0);

    // FIX: Restore Dictionary Warming (Critical for Dictionary Tests)
    // We must use the EXACT same hash logic as blockCompress.
    if (dictLen > 0) {
        const HASH_MASK = (HASH_TABLE_SIZE - 1) | 0;
        const limit = (dictLen - 4) | 0; // Don't overshoot

        // Scan the dictionary to populate the hash table
        for (let i = 0; i <= limit; i++) {
            // 1. Read Sequence
            var seq = (workingBuffer[i] | (workingBuffer[i + 1] << 8) | (workingBuffer[i + 2] << 16) | (workingBuffer[i + 3] << 24)) | 0;

            // 2. Hash (Bob Jenkins / lz4js variant inline)
            var h = seq;
            h = (h + 2127912214 + (h << 12)) | 0;
            h = (h ^ -949894596 ^ (h >>> 19)) | 0;
            h = (h + 374761393 + (h << 5)) | 0;
            h = (h + -744332180 ^ (h << 9)) | 0;
            h = (h + -42973499 + (h << 3)) | 0;
            h = (h ^ -1252372727 ^ (h >>> 16)) | 0;

            var hash = (h >>> HASH_SHIFT) & HASH_MASK;

            // 3. Store (1-based index)
            hashTable[hash] = i + 1;
        }
    }

    let srcPos = inputStartOffset;
    const totalEnd = inputStartOffset + len;

    while (srcPos < totalEnd) {
        const end = Math.min(srcPos + resolvedBlockSize, totalEnd) | 0;
        const blockSize = (end - srcPos) | 0;

        const sizePos = outPos;
        outPos = (outPos + 4) | 0;

        const destView = output.subarray(outPos);

        const compSize = compressBlock(workingBuffer, destView, srcPos, blockSize, hashTable);

        if (compSize > 0 && compSize < blockSize) {
            Lz4Base.writeU32(output, compSize, sizePos);
            outPos = (outPos + compSize) | 0;
        } else {
            Lz4Base.writeU32(output, blockSize | 0x80000000, sizePos);
            output.set(workingBuffer.subarray(srcPos, end), outPos);
            outPos = (outPos + blockSize) | 0;
        }

        if (blockIndependence) {
            hashTable.fill(0);
        }

        srcPos = end;
    }

    Lz4Base.writeU32(output, 0, outPos);
    outPos = (outPos + 4) | 0;

    if (contentChecksum) {
        const fullHash = xxHash32(rawInput, 0);
        Lz4Base.writeU32(output, fullHash, outPos);
        outPos = (outPos + 4) | 0;
    }

    return output.subarray(0, outPos);
}