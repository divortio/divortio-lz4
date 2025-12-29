import { xxHash32 } from '../xxhash32/xxhash32.js';
import { decompressBlock } from '../block/blockDecompress.js';
import {
    MAGIC_NUMBER, LZ4_VERSION, BLOCK_MAX_SIZES,
    FLG_VERSION_MASK, FLG_BLOCK_CHECKSUM_MASK, FLG_CONTENT_SIZE_MASK,
    FLG_CONTENT_CHECKSUM_MASK, FLG_DICT_ID_MASK
} from '../shared/constants.js';
import { Lz4Base } from '../shared/lz4Base.js';

/**
 * Decompresses an LZ4 Frame (Synchronous).
 *
 * @param {ArrayBuffer|ArrayBufferView|Uint8Array} input - The LZ4 Frame.
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary.
 * @param {boolean} [verifyChecksum=true] - If false, skips content checksum verification.
 * @returns {Uint8Array} Decompressed data.
 */
export function decompressBuffer(input, dictionary = null, verifyChecksum = true) {
    const data = Lz4Base.ensureBuffer(input);
    const len = data.length | 0;
    let pos = 0 | 0;

    // 1. Magic Check
    if (Lz4Base.readU32(data, pos) !== MAGIC_NUMBER) {
        throw new Error("LZ4: Invalid Magic Number");
    }
    pos = (pos + 4) | 0;

    // 2. Parse FLG
    const flg = data[pos++];
    const version = (flg & FLG_VERSION_MASK) >> 6;
    if (version !== LZ4_VERSION) throw new Error(`LZ4: Unsupported Version ${version}`);

    const hasBlockChecksum = (flg & FLG_BLOCK_CHECKSUM_MASK) !== 0;
    const hasContentSize = (flg & FLG_CONTENT_SIZE_MASK) !== 0;
    const hasContentChecksum = (flg & FLG_CONTENT_CHECKSUM_MASK) !== 0;
    const hasDictId = (flg & FLG_DICT_ID_MASK) !== 0;

    // 3. Parse BD
    const bd = data[pos++];
    const maxBlockId = (bd & 0x70) >> 4;
    const maxBlockSize = BLOCK_MAX_SIZES[maxBlockId] || 65536;

    // 4. Header Checksum
    const storedHeaderHash = data[pos++];
    const actualHeaderHash = (xxHash32(data.subarray(4, pos - 1), 0) >>> 8) & 0xFF;
    if (storedHeaderHash !== actualHeaderHash) throw new Error("LZ4: Header Checksum Error");

    if (hasContentSize) pos = (pos + 8) | 0;
    if (hasDictId) pos = (pos + 4) | 0;

    // --- Window Management ---
    let window = dictionary instanceof Uint8Array ? dictionary : new Uint8Array(0);
    const MAX_WINDOW_SIZE = 65536;

    const outputChunks = [];
    let totalOutputLen = 0 | 0;
    const workspace = new Uint8Array(maxBlockSize);

    // 5. Read Blocks
    while (true) {
        if (pos >= len) throw new Error("LZ4: Unexpected End of Stream");

        const blockSizeField = Lz4Base.readU32(data, pos);
        pos = (pos + 4) | 0;

        if (blockSizeField === 0) break; // EndMark

        const isUncompressed = (blockSizeField & 0x80000000) !== 0;
        const blockSize = blockSizeField & 0x7FFFFFFF;

        if ((pos + blockSize) > len) throw new Error("LZ4: Block exceeds file bounds");

        const blockData = data.subarray(pos, pos + blockSize);
        pos = (pos + blockSize) | 0;

        if (hasBlockChecksum) pos = (pos + 4) | 0;

        let decodedChunk;

        if (isUncompressed) {
            decodedChunk = blockData.slice(0); // Copy safe
        } else {
            const written = decompressBlock(blockData, workspace, window);
            decodedChunk = workspace.slice(0, written);
        }

        outputChunks.push(decodedChunk);
        totalOutputLen = (totalOutputLen + decodedChunk.length) | 0;

        // Update Window
        if (decodedChunk.length >= MAX_WINDOW_SIZE) {
            window = decodedChunk.subarray(decodedChunk.length - MAX_WINDOW_SIZE);
        } else {
            const newWinLen = window.length + decodedChunk.length;
            if (newWinLen <= MAX_WINDOW_SIZE) {
                const newWin = new Uint8Array(newWinLen);
                newWin.set(window);
                newWin.set(decodedChunk, window.length);
                window = newWin;
            } else {
                const newWin = new Uint8Array(MAX_WINDOW_SIZE);
                const keep = MAX_WINDOW_SIZE - decodedChunk.length;
                newWin.set(window.subarray(window.length - keep), 0);
                newWin.set(decodedChunk, keep);
                window = newWin;
            }
        }
    }

    // 6. Merge
    const result = new Uint8Array(totalOutputLen);
    let offset = 0 | 0;
    for (let i = 0; i < outputChunks.length; i++) {
        result.set(outputChunks[i], offset);
        offset = (offset + outputChunks[i].length) | 0;
    }

    if (hasContentChecksum && verifyChecksum) {
        if ((pos + 4) > len) throw new Error("LZ4: Missing Content Checksum");
        const storedContentHash = Lz4Base.readU32(data, pos);
        const actualContentHash = xxHash32(result, 0);

        if (storedContentHash !== actualContentHash) {
            throw new Error("LZ4: Content Checksum Error");
        }
    }

    return result;
}