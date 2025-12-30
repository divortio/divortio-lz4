import { it, describe } from 'node:test';
import assert from 'node:assert';
import { compressBuffer } from '../../src/buffer/bufferCompress.js';

import { Lz4TestUtils, MAGIC_NUMBER } from '../lz4TestUtils.js';

describe('Buffer Compression', () => {
    it('should produce a valid LZ4 Frame header', () => {
        const input = "Hello";
        const compressed = compressBuffer(input);

        assert.ok(compressed.length > 7);
        const magic = Lz4TestUtils.readU32(compressed, 0);
        assert.strictEqual(magic, MAGIC_NUMBER);
    });

    it('should compress a large repeating string (Ratio check)', () => {
        const input = "A".repeat(10000);
        const compressed = compressBuffer(input);

        // LZ4 should compress repetitive data very well
        assert.ok(compressed.length < 100, `Compressed size ${compressed.length} should be small`);
    });

    // --- NEW TESTS FOR FLAT ARGUMENTS ---

    it('should append Content Checksum when requested', () => {
        const input = new Uint8Array([1, 2, 3, 4, 5]);

        // Sig: (input, dict, maxBlockSize, blockIndep, contentChecksum)
        const withChecksum = compressBuffer(input, null, 65536, false, true);
        const withoutChecksum = compressBuffer(input, null, 65536, false, false);

        // Checksum adds 4 bytes at the end
        assert.strictEqual(withChecksum.length, withoutChecksum.length + 4, "Checksum should add 4 bytes");
    });

    it('should support Block Independence flag', () => {
        const input = new Uint8Array(100).fill(1);

        // Just verify it runs without error and produces valid output
        const indep = compressBuffer(input, null, 65536, true, false); // Independent
        const dep = compressBuffer(input, null, 65536, false, false);  // Dependent

        assert.strictEqual(Lz4TestUtils.readU32(indep, 0), MAGIC_NUMBER);
        assert.strictEqual(Lz4TestUtils.readU32(dep, 0), MAGIC_NUMBER);
    });
});