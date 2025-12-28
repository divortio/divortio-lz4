import { it, describe } from 'node:test';
import assert from 'node:assert';
import { compressBuffer } from '../../src/buffer/bufferCompress.js';
import { decompressBuffer } from '../../src/buffer/bufferDecompress.js'; // Needed to verify
import { MAGIC_NUMBER } from '../../src/shared/constants.js';
import { Lz4Base } from '../../src/shared/lz4Base.js';

describe('Buffer Compression', () => {
    it('should produce a valid LZ4 Frame header', () => {
        const input = "Hello";
        const compressed = compressBuffer(input);

        assert.ok(compressed.length > 7);
        const magic = Lz4Base.readU32(compressed, 0);
        assert.strictEqual(magic, MAGIC_NUMBER);
    });

    it('should compress a large repeating string (Ratio check)', () => {
        const input = "A".repeat(10000);
        const compressed = compressBuffer(input);

        // LZ4 should compress repetitive data very well
        assert.ok(compressed.length < 100, `Compressed size ${compressed.length} should be small`);
    });
});