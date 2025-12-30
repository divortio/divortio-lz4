import { xxHash32 } from '../xxhash32/xxhash32.js';
import { decompressBlock } from '../block/blockDecompress.js';
import { ensureBuffer } from '../shared/lz4Util.js'; // New import

// --- Localized Constants ---
const MAGIC_NUMBER = 0x184D2204;
const LZ4_VERSION = 1;
const FLG_VERSION_MASK = 0xC0;
const FLG_BLOCK_CHECKSUM_MASK = 0x10;
const FLG_CONTENT_SIZE_MASK = 0x08;
const FLG_CONTENT_CHECKSUM_MASK = 0x04;
const FLG_DICT_ID_MASK = 0x01;

const BLOCK_MAX_SIZES = {
    4: 65536,
    5: 262144,
    6: 1048576,
    7: 4194304
};

const FALLBACK_WORKSPACE = new Uint8Array(BLOCK_MAX_SIZES[7]);

// --- Local Helper ---
function readU32(b, n) {
    return (b[n] | (b[n + 1] << 8) | (b[n + 2] << 16) | (b[n + 3] << 24)) >>> 0;
}

export function decompressBuffer(input, dictionary = null, verifyChecksum = true) {
    const data = ensureBuffer(input);
    const len = data.length | 0;
    let pos = 0 | 0;

    // --- Parse Header ---
    if (len < 4 || readU32(data, pos) !== MAGIC_NUMBER) {
        throw new Error("LZ4: Invalid Magic Number");
    }
    pos = (pos + 4) | 0;

    const flg = data[pos++];
    const version = (flg & FLG_VERSION_MASK) >> 6;
    if (version !== LZ4_VERSION) throw new Error(`LZ4: Unsupported Version ${version}`);

    const hasBlockChecksum = (flg & FLG_BLOCK_CHECKSUM_MASK) !== 0;
    const hasContentSize = (flg & FLG_CONTENT_SIZE_MASK) !== 0;
    const hasContentChecksum = (flg & FLG_CONTENT_CHECKSUM_MASK) !== 0;
    const hasDictId = (flg & FLG_DICT_ID_MASK) !== 0;

    pos++; // Skip BD

    let expectedOutputSize = 0;
    if (hasContentSize) {
        const low = readU32(data, pos);
        const high = readU32(data, pos + 4);
        pos = (pos + 8) | 0;
        expectedOutputSize = (high * 4294967296) + low;
    }

    if (hasDictId) {
        const expectedDictId = readU32(data, pos);
        pos = (pos + 4) | 0;
        if (dictionary) {
            const dictBuffer = ensureBuffer(dictionary);
            const actualDictId = xxHash32(dictBuffer, 0);
            if (actualDictId !== expectedDictId) throw new Error("LZ4: Dictionary ID Mismatch");
        } else {
            throw new Error("LZ4: Archive requires a Dictionary");
        }
    }

    pos++; // Skip Header Checksum

    // --- Strategy ---
    const useDirectWrite = (expectedOutputSize > 0) && (!dictionary);

    let result = null;
    let resultPos = 0;
    const outputChunks = [];

    // History Window
    let window = null;
    let windowPos = 0;
    const WINDOW_SIZE = 65536;

    if (useDirectWrite) {
        try {
            result = new Uint8Array(expectedOutputSize);
        } catch (e) {
            throw new Error(`LZ4: Unable to allocate ${expectedOutputSize} bytes.`);
        }
    } else {
        window = new Uint8Array(WINDOW_SIZE);
        if (dictionary) {
            const dict = ensureBuffer(dictionary);
            const size = Math.min(dict.length, WINDOW_SIZE);
            window.set(dict.subarray(dict.length - size), 0);
            windowPos = size;
        }
    }

    // --- Read Blocks ---
    while (true) {
        if (pos >= len) throw new Error("LZ4: Unexpected End of Stream");

        const blockSizeField = readU32(data, pos);
        pos = (pos + 4) | 0;

        if (blockSizeField === 0) break; // EndMark

        const isUncompressed = (blockSizeField & 0x80000000) !== 0;
        const blockSize = blockSizeField & 0x7FFFFFFF;

        if ((pos + blockSize) > len) throw new Error("LZ4: Block exceeds file bounds");

        const blockData = data.subarray(pos, pos + blockSize);
        pos = (pos + blockSize) | 0;
        if (hasBlockChecksum) pos = (pos + 4) | 0;

        // --- Decompress ---
        if (useDirectWrite) {
            const outputView = result.subarray(resultPos);
            let currentDict = null;
            if (resultPos >= 65536) currentDict = result.subarray(resultPos - 65536, resultPos);
            else if (resultPos > 0) currentDict = result.subarray(0, resultPos);

            let bytesWritten = 0;
            if (isUncompressed) {
                result.set(blockData, resultPos);
                bytesWritten = blockSize;
            } else {
                bytesWritten = decompressBlock(blockData, outputView, currentDict);
            }
            resultPos += bytesWritten;
        } else {
            const workspace = FALLBACK_WORKSPACE;
            let chunk = null;

            if (isUncompressed) {
                chunk = blockData.slice();
            } else {
                const dict = (windowPos === WINDOW_SIZE) ? window : window.subarray(0, windowPos);
                const bytes = decompressBlock(blockData, workspace, dict);
                chunk = workspace.slice(0, bytes);
            }
            outputChunks.push(chunk);

            // Update Window
            const chunkLen = chunk.length;
            if (chunkLen >= WINDOW_SIZE) {
                window.set(chunk.subarray(chunkLen - WINDOW_SIZE), 0);
                windowPos = WINDOW_SIZE;
            } else if (windowPos + chunkLen <= WINDOW_SIZE) {
                window.set(chunk, windowPos);
                windowPos += chunkLen;
            } else {
                const keep = WINDOW_SIZE - chunkLen;
                window.copyWithin(0, windowPos - keep, windowPos);
                window.set(chunk, keep);
                windowPos = WINDOW_SIZE;
            }
        }
    }

    // --- Finalize ---
    if (!result) {
        let totalLen = 0;
        for (const c of outputChunks) totalLen += c.length;
        result = new Uint8Array(totalLen);
        let offset = 0;
        for (const c of outputChunks) {
            result.set(c, offset);
            offset += c.length;
        }
    } else {
        if (resultPos < result.length) result = result.subarray(0, resultPos);
    }

    if (hasContentChecksum && verifyChecksum) {
        const storedContentHash = readU32(data, pos);
        const actualContentHash = xxHash32(result, 0);
        if (storedContentHash !== actualContentHash) throw new Error("LZ4: Content Checksum Error");
    }

    return result;
}