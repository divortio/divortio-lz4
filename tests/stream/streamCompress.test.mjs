import { it, describe } from 'node:test';
import assert from 'node:assert';
import { createCompressStream } from '../../src/stream/streamCompress.js';
import { decompressBuffer } from '../../src/buffer/bufferDecompress.js';
import { createRandomBuffer } from '../utils.mjs';

// Helper to consume stream
async function consume(stream) {
    const reader = stream.getReader();
    const chunks = [];
    while(true) {
        const {done, value} = await reader.read();
        if(done) break;
        chunks.push(value);
    }
    // Merge
    const total = chunks.reduce((acc, c) => acc + c.length, 0);
    const res = new Uint8Array(total);
    let off = 0;
    for(const c of chunks) {
        res.set(c, off);
        off += c.length;
    }
    return res;
}

// Helper: Create a ReadableStream from a buffer
function createStreamFromBuffer(buffer, chunkSize = 1024) {
    return new ReadableStream({
        start(c) {
            let off = 0;
            while(off < buffer.length) {
                const end = Math.min(off + chunkSize, buffer.length);
                c.enqueue(buffer.subarray(off, end));
                off += chunkSize;
            }
            c.close();
        }
    });
}

describe('Stream Compression', () => {

    it('should compress a stream of data correctly (Basic)', async () => {
        const inputStr = "Hello Stream";
        const input = new TextEncoder().encode(inputStr);

        const source = createStreamFromBuffer(input);
        const compressStream = createCompressStream();
        const pipeline = source.pipeThrough(compressStream);

        const compressed = await consume(pipeline);

        // Verify with buffer decompressor
        const decompressed = decompressBuffer(compressed);
        const resultStr = new TextDecoder().decode(decompressed);

        assert.strictEqual(resultStr, inputStr);
    });

    it('should compress using a Dictionary', async () => {
        const dictStr = "Prefix_Common_Data_Reference_";
        const dict = new TextEncoder().encode(dictStr);

        const message = dictStr + "UniqueSuffix";
        const input = new TextEncoder().encode(message);

        // Create stream with dictionary
        // Sig: createCompressStream(dictionary, maxBlockSize, blockIndependence, contentChecksum)
        const compressStream = createCompressStream(dict);

        const source = createStreamFromBuffer(input);
        const pipeline = source.pipeThrough(compressStream);
        const compressed = await consume(pipeline);

        // Verify we can decompress it ONLY if we provide the dictionary
        const decompressed = decompressBuffer(compressed, dict);
        assert.strictEqual(new TextDecoder().decode(decompressed), message);

        // Verify ratio: The prefix should be compressed away
        // Raw length: ~29 + 12 = 41 bytes.
        // Compressed should be much smaller than 41 bytes if dict worked.
        assert.ok(compressed.length < input.length, "Dictionary should reduce size");
    });

    it('should append Content Checksum if requested', async () => {
        const input = new TextEncoder().encode("Checksum Test");
        const source1 = createStreamFromBuffer(input);
        const source2 = createStreamFromBuffer(input);

        // Stream 1: No Checksum
        const s1 = createCompressStream(null, 65536, false, false);
        const output1 = await consume(source1.pipeThrough(s1));

        // Stream 2: With Checksum
        const s2 = createCompressStream(null, 65536, false, true);
        const output2 = await consume(source2.pipeThrough(s2));

        assert.strictEqual(output2.length, output1.length + 4, "Checksum flag should add exactly 4 bytes");
    });

    it('should maintain sliding window across chunks (Dependent Blocks)', async () => {
        // Create input that repeats "ABC" across chunk boundaries
        // chunk 1: "ABC...ABC"
        // chunk 2: "ABC...ABC"
        // If dependent blocks work, chunk 2 should reference chunk 1 and be very small.
        const chunkData = new Uint8Array(100).fill(65); // "A..."

        const source = new ReadableStream({
            start(c) {
                c.enqueue(chunkData); // Chunk 1
                c.enqueue(chunkData); // Chunk 2 (Exact copy)
                c.close();
            }
        });

        // Block Independence = FALSE (Default)
        const compressStream = createCompressStream(null, 65536, false);
        const pipeline = source.pipeThrough(compressStream);

        const compressed = await consume(pipeline);

        // Decompress to verify integrity
        const decompressed = decompressBuffer(compressed);
        assert.strictEqual(decompressed.length, 200, "Should decompress to full size");
    });
});