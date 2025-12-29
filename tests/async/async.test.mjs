import { it, describe } from 'node:test';
import assert from 'node:assert';
import { LZ4 } from '../../src/lz4.js';
import { createRandomBuffer, assertBufferEquals } from '../utils.mjs';

describe('Async API (Time Sliced)', () => {

    it('should compress and decompress data asynchronously', async () => {
        const input = createRandomBuffer(50000); // 50KB

        // 1. Async Compress
        const compressed = await LZ4.compressAsync(input);

        assert.ok(compressed instanceof Uint8Array);
        assert.ok(compressed.length > 0);

        // 2. Async Decompress
        const restored = await LZ4.decompressAsync(compressed);

        // 3. Verify
        assertBufferEquals(restored, input, "Async Round-Trip Failed");
    });

    it('should handle tiny inputs in async mode', async () => {
        const input = new Uint8Array([1, 2, 3]);
        const compressed = await LZ4.compressAsync(input);
        const restored = await LZ4.decompressAsync(compressed);

        assertBufferEquals(restored, input, "Tiny Async Round-Trip Failed");
    });
});