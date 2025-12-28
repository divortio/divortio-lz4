import { it, describe } from 'node:test';
import assert from 'node:assert';
import { LZ4Decoder } from '../../src/shared/lz4Decode.js';
import { LZ4Encoder } from '../../src/shared/lz4Encode.js';
import { createRandomBuffer, assertBufferEquals } from '../utils.mjs';

describe('LZ4Decoder (Shared Unit)', () => {
    // Helper to generate a valid compressed frame
    function getCompressedFrame(inputData) {
        const encoder = new LZ4Encoder();
        const chunks = [
            ...encoder.update(inputData),
            ...encoder.finish()
        ];
        // Merge into one buffer
        const total = chunks.reduce((acc, c) => acc + c.length, 0);
        const res = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
            res.set(c, off);
            off += c.length;
        }
        return res;
    }

    it('should decode a valid frame in one go', () => {
        const input = new TextEncoder().encode("Unit Test Data");
        const frame = getCompressedFrame(input);

        const decoder = new LZ4Decoder();
        const outputChunks = decoder.update(frame);

        // Merge output
        const total = outputChunks.reduce((acc, c) => acc + c.length, 0);
        const result = new Uint8Array(total);
        let off = 0;
        for (const c of outputChunks) {
            result.set(c, off);
            off += c.length;
        }

        assertBufferEquals(result, input, "Simple Decode Failed");
    });

    it('should handle fragmented headers (State Machine Stress)', () => {
        const input = new TextEncoder().encode("Fragmented Header Test");
        const frame = getCompressedFrame(input);

        const decoder = new LZ4Decoder();
        const resultChunks = [];

        // Feed 1 byte at a time!
        // This forces the decoder to stop inside MAGIC, HEADER, and BLOCK_SIZE states
        for (let i = 0; i < frame.length; i++) {
            const byteChunk = frame.subarray(i, i + 1);
            const out = decoder.update(byteChunk);
            resultChunks.push(...out);
        }

        const total = resultChunks.reduce((acc, c) => acc + c.length, 0);
        const result = new Uint8Array(total);
        let off = 0;
        for (const c of resultChunks) {
            result.set(c, off);
            off += c.length;
        }

        assertBufferEquals(result, input, "Byte-by-byte Decode Failed");
    });

    it('should throw on invalid Content Checksum', () => {
        const input = new TextEncoder().encode("Corruption Test");
        const frame = getCompressedFrame(input);

        // Corrupt the last byte (part of the checksum)
        frame[frame.length - 1] ^= 0xFF;

        const decoder = new LZ4Decoder();

        // It might not throw until the very end
        assert.throws(() => {
            decoder.update(frame);
        }, /Checksum Error/);
    });
});