import { it, describe } from 'node:test';
import assert from 'node:assert';
import { LZ4Encoder } from '../../src/shared/lz4Encode.js';

import { Lz4TestUtils,
    FLG_BLOCK_INDEP_MASK,
    FLG_CONTENT_CHECKSUM_MASK, MAGIC_NUMBER } from '../lz4TestUtils.js';


describe('LZ4Encoder (Shared Unit)', () => {

    it('should write Magic Number and Header on first update', () => {
        const encoder = new LZ4Encoder();
        const input = new Uint8Array([1, 2, 3]);
        const chunks = encoder.update(input);
        assert.ok(chunks.length > 0);
        const magic = Lz4TestUtils.readU32(chunks[0], 0);
        assert.strictEqual(magic, MAGIC_NUMBER);
    });

    it('should buffer small inputs without emitting blocks immediately', () => {
        const encoder = new LZ4Encoder(null, 65536);
        const smallInput = new Uint8Array(100).fill(1);
        const chunks1 = encoder.update(smallInput);
        assert.strictEqual(chunks1.length, 1); // Header only
        const chunks2 = encoder.update(smallInput);
        assert.strictEqual(chunks2.length, 0); // Still buffering
    });

    it('should flush buffered data on finish', () => {
        const encoder = new LZ4Encoder();
        const input = new Uint8Array([65, 66, 67]);
        encoder.update(input);
        const finalChunks = encoder.finish();
        assert.ok(finalChunks.length >= 2);
        const endMarkChunk = finalChunks[finalChunks.length - 1];
        assert.strictEqual(endMarkChunk.length, 4);
        assert.strictEqual(Lz4TestUtils.readU32(endMarkChunk, 0), 0);
    });

    it('should configure Frame Header flags correctly', () => {
        const encoder = new LZ4Encoder(null, 65536, true, true);
        const chunks = encoder.update(new Uint8Array([1]));
        const flg = chunks[0][4];
        assert.strictEqual((flg & FLG_BLOCK_INDEP_MASK) !== 0, true);
        assert.strictEqual((flg & FLG_CONTENT_CHECKSUM_MASK) !== 0, true);
    });

    it('should split large input into multiple blocks', () => {
        // Use > 64KB input to force a split even if maxBlockSize defaults to 64KB
        const largeInput = new Uint8Array(70000);
        const encoder = new LZ4Encoder(null, 65536);
        const chunks = encoder.update(largeInput);

        // Header + Block 1 (64KB) = 2 chunks minimum
        assert.ok(chunks.length >= 2, `Expected >= 2 chunks, got ${chunks.length}`);
    });

    it('should accept a dictionary without error', () => {
        const dict = new Uint8Array(100).fill(65);
        const encoder = new LZ4Encoder(dict);
        const chunks = encoder.update(new Uint8Array([66]));
        assert.ok(chunks.length > 0);
    });
});