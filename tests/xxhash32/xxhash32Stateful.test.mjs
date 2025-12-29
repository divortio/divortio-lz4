import { it, describe } from 'node:test';
import assert from 'node:assert';
import { xxHash32 } from '../../src/xxhash32/xxhash32.js';
import { XXHash32 } from '../../src/xxhash32/xxhash32Stateful.js';

/** * Helper to create deterministic random buffer
 */
function createRandomBuffer(size) {
    const b = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        b[i] = (i * 31 + 17) & 0xFF;
    }
    return b;
}

describe('xxHash32 (Stateful / Streaming)', () => {

    it('should match static xxHash32 for single chunk', () => {
        const input = new TextEncoder().encode("Streaming Test");
        const expected = xxHash32(input, 0);

        const hasher = new XXHash32(0);
        hasher.update(input);
        const actual = hasher.digest();

        assert.strictEqual(actual, expected);
    });

    it('should match static xxHash32 for split chunks', () => {
        const input = createRandomBuffer(1024);
        const expected = xxHash32(input, 0);

        const hasher = new XXHash32(0);

        // Split into 3 arbitrary parts
        const p1 = input.subarray(0, 100);
        const p2 = input.subarray(100, 500);
        const p3 = input.subarray(500);

        hasher.update(p1);
        hasher.update(p2);
        hasher.update(p3);
        const actual = hasher.digest();

        assert.strictEqual(actual, expected, "Streaming hash mismatch vs Static hash");
    });

    it('should match static xxHash32 for byte-by-byte updates', () => {
        const input = new TextEncoder().encode("ByteByByte");
        const expected = xxHash32(input, 0);

        const hasher = new XXHash32(0);
        for (let i = 0; i < input.length; i++) {
            hasher.update(input.subarray(i, i + 1));
        }
        const actual = hasher.digest();

        assert.strictEqual(actual, expected);
    });

    it('should support incremental digests (peek hash without resetting)', () => {
        const hasher = new XXHash32(0);

        // 1. First Chunk
        hasher.update(new Uint8Array([1, 2, 3]));
        const hash1 = hasher.digest();
        const expected1 = xxHash32(new Uint8Array([1, 2, 3]), 0);
        assert.strictEqual(hash1, expected1);

        // 2. Second Chunk
        hasher.update(new Uint8Array([4, 5, 6]));
        const hash2 = hasher.digest();

        // Check total hash
        const fullBuffer = new Uint8Array([1, 2, 3, 4, 5, 6]);
        const expected2 = xxHash32(fullBuffer, 0);

        assert.strictEqual(hash2, expected2);
    });
});