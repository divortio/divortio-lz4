import { createCompressStream } from "./streamCompress.js";
import { createTimeSlicer } from "./scheduler.js";

/**
 * Asynchronously compresses a raw buffer into an LZ4 Frame.
 *
 * This function utilizes a "Time Slicing" strategy to prevent blocking the
 * main thread (UI or Event Loop). It chunks the input data and yields execution
 * periodically, allowing the browser to render frames or the server to handle
 * other requests during the compression process.
 *
 * @param {Uint8Array} input - The raw binary data to compress.
 * @param {Object} [options] - Configuration options for the LZ4 Encoder.
 * @param {boolean} [options.blockIndependence=true] - If true, blocks are independent (no dictionary dependency).
 * @param {boolean} [options.contentChecksum=true] - If true, appends an xxHash32 checksum of the original content.
 * @param {number} [options.maxBlockSize=65536] - The maximum size of a single LZ4 block (default 64KB).
 * @param {number} [chunkSize=524288] - The size of data chunks (in bytes) to process per tick.
 * Defaults to 512KB. Smaller chunks yield more often; larger chunks improve raw throughput.
 * @returns {Promise<Uint8Array>} A Promise that resolves to the complete compressed LZ4 Frame.
 */
export async function compressAsync(input, options = {}, chunkSize = 524288) {
    // 1. Initialize Stream & Scheduler
    const stream = createCompressStream(options);
    const reader = stream.readable.getReader();
    const writer = stream.writable.getWriter();

    // Target a 12ms budget. This leaves ~4ms buffer in a 16ms frame (60fps)
    // for the browser to handle rendering and other tasks.
    const yieldIfOverBudget = createTimeSlicer(12);

    /** @type {Uint8Array[]} Storage for compressed chunks */
    const resultChunks = [];
    let totalLength = 0;

    // 2. Start Reader (Parallel)
    // We start reading immediately so that as soon as the writer pushes data,
    // the underlying transform stream processes it and makes it available here.
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
        // Note: We await strict backpressure here, though for LZ4 it's rarely blocking.
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