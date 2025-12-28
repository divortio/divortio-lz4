import { it, describe } from 'node:test';
import assert from 'node:assert';
import { createDecompressStream } from '../../src/stream/streamDecompress.js';
import { compressBuffer } from '../../src/buffer/bufferCompress.js';
import { createRandomBuffer, assertBufferEquals } from '../utils.mjs';

async function consume(stream) {
    const reader = stream.getReader();
    const chunks = [];
    while(true) {
        const {done, value} = await reader.read();
        if(done) break;
        chunks.push(value);
    }
    const total = chunks.reduce((acc, c) => acc + c.length, 0);
    const res = new Uint8Array(total);
    let off = 0;
    for(const c of chunks) {
        res.set(c, off);
        off += c.length;
    }
    return res;
}

describe('Stream Decompression', () => {
    it('should decompress a chunked stream', async () => {
        const input = createRandomBuffer(20000); // 20KB
        const compressed = compressBuffer(input);

        // Feed compressed data in tiny chunks to test state machine
        const source = new ReadableStream({
            start(c) {
                let off = 0;
                while(off < compressed.length) {
                    const chunk = compressed.subarray(off, off + 50); // 50 byte chunks
                    c.enqueue(chunk);
                    off += 50;
                }
                c.close();
            }
        });

        const decompressStream = createDecompressStream();
        const pipeline = source.pipeThrough(decompressStream);

        const result = await consume(pipeline);

        assertBufferEquals(result, input, "Stream Chunked Decompression Failed");
    });
});