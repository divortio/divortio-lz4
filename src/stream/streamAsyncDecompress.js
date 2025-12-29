import { createDecompressStream } from "./streamDecompress.js";
import { createTimeSlicer } from "./scheduler.js";

/**
 * Asynchronously decompresses an LZ4 Frame into raw binary data.
 * Uses "Time Slicing" to prevent blocking the main thread.
 *
 * @param {Uint8Array} input - The compressed LZ4 Frame.
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary.
 * @param {boolean} [verifyChecksum=true] - If false, skips checksum verification.
 * @param {number} [chunkSize=524288] - Processing chunk size (default 512KB).
 * @returns {Promise<Uint8Array>} Resolved decompressed data.
 */
export async function decompressAsync(input, dictionary = null, verifyChecksum = true, chunkSize = 524288) {
    // 1. Initialize Stream
    const stream = createDecompressStream(dictionary, verifyChecksum);
    const reader = stream.readable.getReader();
    const writer = stream.writable.getWriter();

    // Target a 12ms budget
    const yieldIfOverBudget = createTimeSlicer(12);

    /** @type {Uint8Array[]} Storage for decompressed chunks */
    const resultChunks = [];
    let totalLength = 0;

    // 2. Start Reader (Parallel)
    const readPromise = (async () => {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                resultChunks.push(value);
                totalLength += value.byteLength;
            }
        }
    })();

    // 3. Write in Chunks (Time Sliced)
    const len = input.byteLength;
    let offset = 0;

    while (offset < len) {
        const end = Math.min(offset + chunkSize, len);
        const chunk = input.subarray(offset, end);

        // Write chunk
        await writer.write(chunk);

        // Yield if needed
        await yieldIfOverBudget();

        offset = end;
    }

    // 4. Finalize
    await writer.close();
    await readPromise;

    // 5. Merge
    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const chunk of resultChunks) {
        result.set(chunk, pos);
        pos += chunk.byteLength;
    }

    return result;
}