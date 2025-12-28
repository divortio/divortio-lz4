import { it, describe } from 'node:test';
import assert from 'node:assert';
import { LZ4Encoder } from '../../src/shared/lz4Encode.js';
import { MAGIC_NUMBER } from '../../src/shared/constants.js';
import { Lz4Base } from '../../src/shared/lz4Base.js';

describe('LZ4Encoder (Shared Unit)', () => {
    it('should write Magic Number and Header on first update', () => {
        const encoder = new LZ4Encoder();
        const input = new Uint8Array([1, 2, 3]);

        const chunks = encoder.update(input);

        // Should have Header
        assert.ok(chunks.length > 0);
        const firstChunk = chunks[0];

        assert.ok(firstChunk.length >= 7); // Min header size
        const magic = Lz4Base.readU32(firstChunk, 0);
        assert.strictEqual(magic, MAGIC_NUMBER);
    });

    it('should buffer small inputs without emitting blocks immediately', () => {
        // Default block size is 64KB
        const encoder = new LZ4Encoder({ maxBlockSize: 65536 });
        const smallInput = new Uint8Array(100).fill(1);

        // First update emits header, but NO block yet (buffer < 64KB)
        const chunks1 = encoder.update(smallInput);
        assert.strictEqual(chunks1.length, 1); // Header only
        assert.ok(chunks1[0].length < 20); // Just header

        // Second update, still no block
        const chunks2 = encoder.update(smallInput);
        assert.strictEqual(chunks2.length, 0); // Still buffering
    });

    it('should flush buffered data on finish', () => {
        const encoder = new LZ4Encoder();
        const input = new Uint8Array([65, 66, 67]); // "ABC"

        encoder.update(input); // buffers "ABC"
        const finalChunks = encoder.finish();

        // finish() should produce:
        // 1. Block (containing "ABC")
        // 2. EndMark (0x00000000)
        // 3. Content Checksum (4 bytes)

        assert.ok(finalChunks.length >= 2);

        // Verify EndMark is present
        const endMarkChunk = finalChunks[finalChunks.length - 2];
        const endMarkVal = Lz4Base.readU32(endMarkChunk, 0);
        assert.strictEqual(endMarkVal, 0, "Missing EndMark");

        // Verify Checksum is last
        const checksumChunk = finalChunks[finalChunks.length - 1];
        assert.strictEqual(checksumChunk.length, 4, "Missing Content Checksum");
    });
});