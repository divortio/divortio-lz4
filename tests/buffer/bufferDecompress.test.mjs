import { it, describe } from 'node:test';
import assert from 'node:assert';
import { compressBuffer } from '../../src/buffer/bufferCompress.js';
import { decompressBuffer } from '../../src/buffer/bufferDecompress.js';
import { createRandomBuffer, assertBufferEquals } from '../utils.mjs';

describe('Buffer Decompression', () => {
    it('should round-trip "Hello World"', () => {
        const input = new TextEncoder().encode("Hello World");
        const compressed = compressBuffer(input);
        const decompressed = decompressBuffer(compressed);

        assertBufferEquals(decompressed, input, "Round Trip Failed");
    });

    it('should round-trip random binary data', () => {
        const input = createRandomBuffer(1024 * 64 + 500); // > 64KB to force multiple blocks
        const compressed = compressBuffer(input);
        const decompressed = decompressBuffer(compressed);

        assertBufferEquals(decompressed, input, "Random Data Round Trip Failed");
    });

    it('should throw on invalid magic number', () => {
        const badData = new Uint8Array([0, 1, 2, 3, 4, 5]);
        assert.throws(() => decompressBuffer(badData), /Invalid Magic/);
    });
});