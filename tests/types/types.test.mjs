import { it, describe } from 'node:test';
import assert from 'node:assert';
import { LZ4 } from '../../src/lz4.js';

describe('Type Handling Helpers', () => {

    it('should compress and decompress Strings (UTF-8)', () => {
        const text = "Hello 🌍 World! " + "Repeat".repeat(50);

        const compressed = LZ4.compressString(text);
        assert.ok(compressed instanceof Uint8Array);

        const restored = LZ4.decompressString(compressed);
        assert.strictEqual(restored, text);
    });

    it('should compress and decompress Objects (JSON)', () => {
        const data = {
            id: 1,
            list: [10, 20, 30],
            nested: { valid: true }
        };

        const compressed = LZ4.compressObject(data);
        assert.ok(compressed instanceof Uint8Array);

        const restored = LZ4.decompressObject(compressed);
        assert.deepStrictEqual(restored, data);
    });
});