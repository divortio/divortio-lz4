import { it, describe } from 'node:test';
import assert from 'node:assert';
import { createDecompressStream } from '../../src/stream/streamDecompress.js';
import { compressBuffer } from '../../src/buffer/bufferCompress.js';
import { createRandomBuffer, assertBufferEquals } from '../utils.mjs';

// Helper: Consume a stream into a single Uint8Array
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

// Helper: Create a ReadableStream from a buffer, split into tiny chunks
function createChunkedStream(buffer, chunkSize = 50) {
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

describe('Stream Decompression', () => {

    it('should decompress a chunked stream (Basic)', async () => {
        const input = createRandomBuffer(20000); // 20KB
        const compressed = compressBuffer(input);

        const source = createChunkedStream(compressed, 50);
        const decompressStream = createDecompressStream(); // Default options
        const pipeline = source.pipeThrough(decompressStream);

        const result = await consume(pipeline);

        assertBufferEquals(result, input, "Stream Chunked Decompression Failed");
    });

    it('should decompress with a Dictionary', async () => {
        const dictStr = "Dictionary_Prefix_Data_For_Testing_12345";
        const dict = new TextEncoder().encode(dictStr);

        const inputStr = dictStr + "_Unique_Suffix_Data";
        const input = new TextEncoder().encode(inputStr);

        // Compress WITH dictionary (using buffer API helper)
        const compressed = compressBuffer(input, dict);

        // Create stream source
        const source = createChunkedStream(compressed, 10); // Small chunks

        // Decompress WITH dictionary
        // Sig: createDecompressStream(dictionary, verifyChecksum)
        const decompressStream = createDecompressStream(dict);
        const pipeline = source.pipeThrough(decompressStream);

        const result = await consume(pipeline);
        const resultStr = new TextDecoder().decode(result);

        assert.strictEqual(resultStr, inputStr);
    });

    it('should fail if required Dictionary is missing', async () => {
        const dict = new TextEncoder().encode("Required_Dict");
        const input = new TextEncoder().encode("Required_Dict_Suffix");
        const compressed = compressBuffer(input, dict);

        const source = createChunkedStream(compressed);
        const decompressStream = createDecompressStream(null); // No dict provided
        const pipeline = source.pipeThrough(decompressStream);

        // Stream errors are thrown during consumption
        await assert.rejects(async () => {
            await consume(pipeline);
        }, Error, "Should throw error when dictionary is missing");
    });

    it('should throw on Content Checksum error', async () => {
        const input = new TextEncoder().encode("Integrity Test Data");
        // Force checksum generation: (input, dict, size, indep, contentChecksum=true)
        const compressed = compressBuffer(input, null, 65536, false, true);

        // Corrupt the last byte (checksum)
        compressed[compressed.length - 1] ^= 0xFF;

        const source = createChunkedStream(compressed);
        const decompressStream = createDecompressStream(null, true); // Verify = true
        const pipeline = source.pipeThrough(decompressStream);

        await assert.rejects(async () => {
            await consume(pipeline);
        }, /Checksum/i);
    });

    it('should skip checksum verification if requested', async () => {
        const input = new TextEncoder().encode("Skip Integrity Test");
        // Force checksum generation
        const compressed = compressBuffer(input, null, 65536, false, true);

        // Corrupt the last byte
        compressed[compressed.length - 1] ^= 0xFF;

        const source = createChunkedStream(compressed);
        // Sig: (dict, verifyChecksum=false)
        const decompressStream = createDecompressStream(null, false);
        const pipeline = source.pipeThrough(decompressStream);

        const result = await consume(pipeline);
        assertBufferEquals(result, input, "Should recover data despite bad checksum");
    });
});