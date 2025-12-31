import { xxHash32 } from '../xxhash32/xxhash32.js';
import { compressBlock } from '../block/blockCompress.js';
import { ensureBuffer } from '../shared/lz4Util.js';

// --- Localized Constants ---
const MIN_MATCH = 4 | 0;
const HASH_LOG = 14 | 0;
const HASH_TABLE_SIZE = 16384 | 0;
const HASH_SHIFT = 18 | 0;
const HASH_MASK = 16383 | 0;

const LZ4_VERSION = 1;
const FLG_BLOCK_INDEPENDENCE_MASK = 0x20;
const FLG_CONTENT_CHECKSUM_MASK = 0x04;
const FLG_CONTENT_SIZE_MASK = 0x08;
const FLG_DICT_ID_MASK = 0x01;

const BLOCK_MAX_SIZES = {
    4: 65536,
    5: 262144,
    6: 1048576,
    7: 4194304
};

// Fixed 16K Int32 Table (Avoids Polymorphism)
const GLOBAL_HASH_TABLE = new Int32Array(HASH_TABLE_SIZE);

// --- Local Helpers ---
function writeU32(b, i, n) {
    b[n] = i & 0xFF;
    b[n + 1] = (i >>> 8) & 0xFF;
    b[n + 2] = (i >>> 16) & 0xFF;
    b[n + 3] = (i >>> 24) & 0xFF;
}

function getBlockId(bytes) {
    if (!bytes || bytes <= 65536) return 4;
    if (bytes <= 262144) return 5;
    if (bytes <= 1048576) return 6;
    return 7;
}

/**
 * Compresses a buffer into an LZ4 Frame.
 * @param {Uint8Array} input
 * @param {Uint8Array} dictionary
 * @param {number} maxBlockSize
 * @param {boolean} blockIndependence
 * @param {boolean} contentChecksum
 * @param {boolean} addContentSize
 * @param {Uint8Array} [outputBuffer] - Optional pre-allocated buffer to write to (avoids GC)
 */
export function compressBuffer(input, dictionary = null, maxBlockSize = 4194304, blockIndependence = false, contentChecksum = false, addContentSize = true, outputBuffer = null) {
    const rawInput = ensureBuffer(input);

    let workingBuffer = rawInput;
    let inputStartOffset = 0;
    let dictLen = 0;
    let dictId = null;

    if (dictionary && dictionary.length > 0) {
        const dictBuffer = ensureBuffer(dictionary);
        dictId = xxHash32(dictBuffer, 0);

        const dictWindow = dictBuffer.length > 65536 ? dictBuffer.subarray(dictBuffer.length - 65536) : dictBuffer;
        dictLen = dictWindow.length;

        workingBuffer = new Uint8Array(dictLen + rawInput.length);
        workingBuffer.set(dictWindow, 0);
        workingBuffer.set(rawInput, dictLen);
        inputStartOffset = dictLen;
    }

    const len = rawInput.length | 0;
    const bdId = getBlockId(maxBlockSize);
    const resolvedBlockSize = BLOCK_MAX_SIZES[bdId] | 0;

    // --- Output Buffer Selection ---
    let output;
    let outPos = 0 | 0;

    if (outputBuffer) {
        output = outputBuffer;
    } else {
        const worstCaseSize = (19 + len + (len / 255 | 0) + 64 + 8) | 0;
        output = new Uint8Array(worstCaseSize);
    }

    // --- Header ---
    output[outPos++] = 0x04; output[outPos++] = 0x22; output[outPos++] = 0x4D; output[outPos++] = 0x18;

    let flg = (LZ4_VERSION << 6);
    if (blockIndependence) flg |= FLG_BLOCK_INDEPENDENCE_MASK;
    if (contentChecksum) flg |= FLG_CONTENT_CHECKSUM_MASK;
    if (dictId !== null) flg |= FLG_DICT_ID_MASK;
    if (addContentSize) flg |= FLG_CONTENT_SIZE_MASK;
    output[outPos++] = flg;
    output[outPos++] = (bdId & 0x07) << 4;

    const headerStart = 4;
    if (addContentSize) {
        writeU32(output, len >>> 0, outPos);
        outPos += 4;
        writeU32(output, (len / 4294967296) | 0, outPos);
        outPos += 4;
    }
    if (dictId !== null) {
        writeU32(output, dictId, outPos);
        outPos += 4;
    }
    const headerHash = xxHash32(output.subarray(headerStart, outPos), 0);
    output[outPos++] = (headerHash >>> 8) & 0xFF;

    // --- Compression ---
    const hashTable = GLOBAL_HASH_TABLE;
    hashTable.fill(0);

    if (dictLen > 0) {
        const mask = HASH_MASK;
        const shift = HASH_SHIFT;
        const limit = (dictLen - 4) | 0;

        for (let i = 0; i <= limit; i++) {
            var seq = (workingBuffer[i] | (workingBuffer[i + 1] << 8) | (workingBuffer[i + 2] << 16) | (workingBuffer[i + 3] << 24)) | 0;
            var h = seq;
            h = (h + 2127912214 + (h << 12)) | 0;
            h = (h ^ -949894596 ^ (h >>> 19)) | 0;
            h = (h + 374761393 + (h << 5)) | 0;
            h = (h + -744332180 ^ (h << 9)) | 0;
            h = (h + -42973499 + (h << 3)) | 0;
            h = (h ^ -1252372727 ^ (h >>> 16)) | 0;
            var hash = (h >>> shift) & mask;
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

        // Pass output and offset directly
        const compSize = compressBlock(workingBuffer, output, srcPos, blockSize, hashTable, outPos);

        if (compSize > 0 && compSize < blockSize) {
            writeU32(output, compSize, sizePos);
            outPos = (outPos + compSize) | 0;
        } else {
            writeU32(output, blockSize | 0x80000000, sizePos);
            output.set(workingBuffer.subarray(srcPos, end), outPos);
            outPos = (outPos + blockSize) | 0;
        }

        if (blockIndependence) {
            hashTable.fill(0);
        }

        srcPos = end;
    }

    writeU32(output, 0, outPos);
    outPos = (outPos + 4) | 0;

    if (contentChecksum) {
        const fullHash = xxHash32(rawInput, 0);
        writeU32(output, fullHash, outPos);
        outPos = (outPos + 4) | 0;
    }

    return output.subarray(0, outPos);
}