import { it, describe } from 'node:test';
import assert from 'node:assert';
import { createCompressStream } from '../../src/stream/streamCompress.js';
import { decompressBuffer } from '../../src/buffer/bufferDecompress.js';

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

describe('Stream Compression', () => {
    it('should compress a stream of data correctly', async () => {
        const inputStr = "Hello Stream";
        const input = new TextEncoder().encode(inputStr);

        // Create source stream
        const source = new ReadableStream({
            start(c) { c.enqueue(input); c.close(); }
        });

        const compressStream = createCompressStream();
        const pipeline = source.pipeThrough(compressStream);

        const compressed = await consume(pipeline);

        // Verify with buffer decompressor
        const decompressed = decompressBuffer(compressed);
        const resultStr = new TextDecoder().decode(decompressed);

        assert.strictEqual(resultStr, inputStr);
    });
});