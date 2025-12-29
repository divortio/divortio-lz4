import { createCompressStream } from "./streamCompress.js";
import { createTimeSlicer } from "./scheduler.js";
import { Lz4Base } from "../shared/lz4Base.js";

/**
 * Asynchronously compresses data into an LZ4 Frame.
 * @param {number} [maxBlockSize=4194304] - Target block size (default 4MB).
 */
export async function compressAsync(input, dictionary = null, maxBlockSize = 4194304, blockIndependence = false, contentChecksum = false, chunkSize = 524288) {
    const rawInput = Lz4Base.ensureBuffer(input);

    const stream = createCompressStream(dictionary, maxBlockSize, blockIndependence, contentChecksum);
    const reader = stream.readable.getReader();
    const writer = stream.writable.getWriter();

    const yieldIfOverBudget = createTimeSlicer(12);

    const resultChunks = [];
    let totalLength = 0;

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

    while (offset < len) {
        const end = Math.min(offset + chunkSize, len);
        const chunk = rawInput.subarray(offset, end);

        await writer.write(chunk);
        await yieldIfOverBudget();

        offset = end;
    }

    await writer.close();
    await readPromise;

    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const chunk of resultChunks) {
        result.set(chunk, pos);
        pos += chunk.byteLength;
    }

    return result;
}