import { it, describe } from 'node:test';
import assert from 'node:assert';
import { xxHash32 } from '../../src/xxhash32/xxhash32.js';
import { XXHash32Stream } from '../../src/xxhash32/xxhash32.stream.js';
import { createRandomBuffer } from '../utils.mjs';

describe('xxHash32 Stream (Unit)', () => {
    it('should match static xxHash32 for single chunk', () => {
        const input = new TextEncoder().encode("Streaming Test");
        const expected = xxHash32(input, 0);

        const stream = new XXHash32Stream(0);
        stream.update(input);
        const actual = stream.finalize();

        assert.strictEqual(actual, expected);
    });

    it('should match static xxHash32 for split chunks', () => {
        const input = createRandomBuffer(1024);
        const expected = xxHash32(input, 0);

        const stream = new XXHash32Stream(0);

        // Split into 3 random parts
        const p1 = input.subarray(0, 100);
        const p2 = input.subarray(100, 500);
        const p3 = input.subarray(500);

        stream.update(p1);
        stream.update(p2);
        stream.update(p3);
        const actual = stream.finalize();

        assert.strictEqual(actual, expected, "Streaming hash mismatch vs Static hash");
    });
});