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

    // --- NEW TESTS FOR FLAT ARGUMENTS ---

    it('should throw on Checksum Error by default', () => {
        const input = new TextEncoder().encode("Integrity Check");
        // Force checksum generation
        const compressed = compressBuffer(input, null, 65536, false, true);

        // Corrupt the last byte (part of the checksum)
        compressed[compressed.length - 1] ^= 0xFF;

        assert.throws(() => {
            decompressBuffer(compressed);
        }, /Checksum Error/, "Should detect corruption");
    });

    it('should ignore Checksum Error when verifyChecksum is false', () => {
        const input = new TextEncoder().encode("Ignore Integrity");
        // Force checksum generation
        const compressed = compressBuffer(input, null, 65536, false, true);

        // Corrupt the last byte
        compressed[compressed.length - 1] ^= 0xFF;

        // Sig: (input, dict, verifyChecksum)
        const decompressed = decompressBuffer(compressed, null, false);

        assertBufferEquals(decompressed, input, "Should decompress despite bad checksum");
    });
});