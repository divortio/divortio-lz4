import { createCompressStream } from "./streamCompress.js";
import { createTimeSlicer } from "./scheduler.js";

/**
 * Asynchronously compresses a raw buffer into an LZ4 Frame.
 *
 * Uses "Time Slicing" to yield to the main thread (UI/Event Loop) periodically,
 * preventing long blocking operations during large file compression.
 *
 * @param {Uint8Array} input
 * @param {Uint8Array|null} [dictionary=null]
 * @param {number} [maxBlockSize=65536]
 * @param {boolean} [blockIndependence=false]
 * @param {boolean} [contentChecksum=false]
 * @param {number} [chunkSize=524288]
 * @returns {Promise<Uint8Array>}
 */
export async function compressAsync(input, dictionary = null, maxBlockSize = 65536, blockIndependence = false, contentChecksum = false, chunkSize = 524288) {
    // Pass flat args to the stream factory
    const stream = createCompressStream(dictionary, maxBlockSize, blockIndependence, contentChecksum);

    const reader = stream.readable.getReader();
    const writer = stream.writable.getWriter();

    // Target a 12ms budget (allows ~4ms overhead for 60fps rendering)
    const yieldIfOverBudget = createTimeSlicer(12);

    /** @type {Uint8Array[]} Storage for compressed chunks */
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

        // Write the chunk to the stream
        await writer.write(chunk);

        // Yield if we exceeded our frame budget
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