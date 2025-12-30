import { createCompressStream } from "./streamCompress.js";
import { createTimeSlicer } from "./scheduler.js";
import { ensureBuffer } from "../shared/lz4Util.js";

/**
 * Asynchronously compresses data into an LZ4 Frame.
 * Uses a time-slicing scheduler to avoid blocking the main thread during large compressions.
 *
 * @param {Uint8Array|string|ArrayBuffer} input - The data to compress.
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary (history window).
 * @param {number} [maxBlockSize=4194304] - Target block size (default 4MB).
 * @param {boolean} [blockIndependence=false] - If false, allows matches across blocks (better compression, slower seeking).
 * @param {boolean} [contentChecksum=false] - If true, appends XXHash32 checksum at the end of the stream.
 * @param {number} [chunkSize=524288] - Size of chunks processed per time slice (default 512KB).
 * @returns {Promise<Uint8Array>} A promise that resolves to the complete compressed buffer.
 */
export async function compressAsync(input, dictionary = null, maxBlockSize = 4194304, blockIndependence = false, contentChecksum = false, chunkSize = 524288) {
    // Compatibility check
    const rawInput = ensureBuffer(input);

    const stream = createCompressStream(dictionary, maxBlockSize, blockIndependence, contentChecksum);
    const reader = stream.readable.getReader();
    const writer = stream.writable.getWriter();

    // Scheduler: Yield to event loop every 12ms to prevent UI freezing
    const yieldIfOverBudget = createTimeSlicer(12);

    const resultChunks = [];
    let totalLength = 0;

    // Background Reader: Consumes compressed chunks as they are produced
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

    const len = rawInput.byteLength;
    let offset = 0;

    // Chunked Writer: Feeds the stream in slices, yielding to the scheduler
    while (offset < len) {
        const end = Math.min(offset + chunkSize, len);
        const chunk = rawInput.subarray(offset, end);

        await writer.write(chunk);
        await yieldIfOverBudget();

        offset = end;
    }

    await writer.close();
    await readPromise;

    // Concatenate result
    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const chunk of resultChunks) {
        result.set(chunk, pos);
        pos += chunk.byteLength;
    }

    return result;
}