import { it, describe } from 'node:test';
import assert from 'node:assert';
import { LZ4 } from '../../src/lz4.js';
import { createRandomBuffer, assertBufferEquals } from '../utils.mjs';

describe('Raw Block API (Low Level)', () => {

    it('should round-trip a single raw block', () => {
        const input = createRandomBuffer(1024);

        // 1. Prepare resources
        const maxBound = input.length + (input.length / 255 | 0) + 16;
        const outputBuffer = new Uint8Array(maxBound);
        const hashTable = new Int32Array(16384).fill(-1); // Reset table

        // 2. Compress Raw
        const written = LZ4.compressRaw(input, outputBuffer, 0, input.length, hashTable);

        assert.ok(written > 0, "Should write bytes");
        const compressedData = outputBuffer.subarray(0, written);

        // 3. Decompress Raw
        // Note: Raw decompression REQUIRES the exact destination size
        const restoreBuffer = new Uint8Array(input.length);
        const bytesRead = LZ4.decompressRaw(compressedData, restoreBuffer);

        // 4. Verify
        assert.strictEqual(bytesRead, input.length, "Decompressed length mismatch");
        assertBufferEquals(restoreBuffer, input, "Raw Round-Trip Content Mismatch");
    });

    it('should fail decompressing raw block into too small buffer', () => {
        const input = new Uint8Array(100).fill(65); // "A..."

        // Compress
        const compBuf = new Uint8Array(200);
        const ht = new Int32Array(16384).fill(-1);
        const compSize = LZ4.compressRaw(input, compBuf, 0, input.length, ht);
        const compressed = compBuf.subarray(0, compSize);

        // Decompress into too small buffer
        const tooSmall = new Uint8Array(50); // Need 100

        assert.throws(() => {
            LZ4.decompressRaw(compressed, tooSmall);
        }, /Output buffer too small/);
    });
});