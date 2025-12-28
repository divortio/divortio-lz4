import { createDecompressStream } from "./streamDecompress.js";
import { createTimeSlicer } from "./scheduler.js";

/**
 * Asynchronously decompresses an LZ4 Frame into raw binary data.
 *
 * This function utilizes a "Time Slicing" strategy to prevent blocking the
 * main thread (UI or Event Loop). It chunks the input data and yields execution
 * periodically, allowing the browser to render frames or the server to handle
 * other requests during the decompression process.
 *
 * @param {Uint8Array} input - The compressed LZ4 Frame to decompress.
 * @param {Object} [options] - Configuration options.
 * @param {number} [options.maxBlockSize=65536] - Helper to pre-allocate buffers if the header is missing size data (rare).
 * @param {number} [chunkSize=524288] - The size of data chunks (in bytes) to process per tick.
 * Defaults to 512KB. Smaller chunks yield more often; larger chunks improve raw throughput.
 * @returns {Promise<Uint8Array>} A Promise that resolves to the complete decompressed data.
 */
export async function decompressAsync(input, options = {}, chunkSize = 524288) {
    // 1. Initialize Stream & Scheduler
    const stream = createDecompressStream(options);
    const reader = stream.readable.getReader();
    const writer = stream.writable.getWriter();

    // Target a 12ms budget. This leaves ~4ms buffer in a 16ms frame (60fps)
    // for the browser to handle rendering and other tasks.
    const yieldIfOverBudget = createTimeSlicer(12);

    /** @type {Uint8Array[]} Storage for decompressed chunks */
    const resultChunks = [];
    let totalLength = 0;

    // 2. Start Reader (Parallel)
    // Captures output as it becomes available from the transform stream
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

        // Write the chunk to the stream.
        await writer.write(chunk);

        // Check our time budget. If we've been running >12ms, yield to the event loop.
        await yieldIfOverBudget();

        offset = end;
    }

    // 4. Finalize
    await writer.close();
    await readPromise; // Ensure we have collected all output

    // 5. Merge & Return
    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const chunk of resultChunks) {
        result.set(chunk, pos);
        pos += chunk.byteLength;
    }

    return result;
}