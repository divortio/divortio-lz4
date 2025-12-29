import { it, describe } from 'node:test';
import assert from 'node:assert';
import { LZ4Decoder } from '../../src/shared/lz4Decode.js';
import { LZ4Encoder } from '../../src/shared/lz4Encode.js';
import { createRandomBuffer, assertBufferEquals } from '../utils.mjs';

describe('LZ4Decoder (Shared Unit)', () => {

    // Helper: Compress data into a single Uint8Array frame
    function getCompressedFrame(inputData, options = {}) {
        const encoder = new LZ4Encoder(options.dictionary, options.maxBlockSize, options.blockIndependence, options.contentChecksum);
        const chunks = [
            ...encoder.update(inputData),
            ...encoder.finish()
        ];
        // Merge
        const total = chunks.reduce((acc, c) => acc + c.length, 0);
        const res = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
            res.set(c, off);
            off += c.length;
        }
        return res;
    }

    // Helper: Decompress data using the Decoder
    function decodeFrame(frameData, dictionary = null, verifyChecksum = true) {
        const decoder = new LZ4Decoder(dictionary, verifyChecksum);
        const chunks = decoder.update(frameData);
        // Merge
        const total = chunks.reduce((acc, c) => acc + c.length, 0);
        const res = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
            res.set(c, off);
            off += c.length;
        }
        return res;
    }

    // --- 1. Standard Features ---

    it('should decode a valid frame in one go', () => {
        const input = new TextEncoder().encode("Unit Test Data");
        const frame = getCompressedFrame(input);
        const result = decodeFrame(frame);
        assertBufferEquals(result, input, "Simple Decode Failed");
    });

    it('should handle fragmented headers (State Machine Stress)', () => {
        const input = new TextEncoder().encode("Fragmented Header Test");
        const frame = getCompressedFrame(input);

        const decoder = new LZ4Decoder();
        const resultChunks = [];

        // Feed 1 byte at a time to force state transitions
        for (let i = 0; i < frame.length; i++) {
            const byteChunk = frame.subarray(i, i + 1);
            const out = decoder.update(byteChunk);
            resultChunks.push(...out);
        }

        // Merge
        const total = resultChunks.reduce((acc, c) => acc + c.length, 0);
        const result = new Uint8Array(total);
        let off = 0;
        for (const c of resultChunks) {
            result.set(c, off);
            off += c.length;
        }

        assertBufferEquals(result, input, "Byte-by-byte Decode Failed");
    });

    // --- 2. Checksum Logic ---

    it('should throw on invalid Content Checksum', () => {
        const input = new TextEncoder().encode("Corruption Test");
        // FIX: Enable checksum generation in the helper or manually
        const encoder = new LZ4Encoder(null, 65536, false, true); // contentChecksum = true
        const frameChunks = [...encoder.update(input), ...encoder.finish()];

        // Merge
        const total = frameChunks.reduce((acc, c) => acc + c.length, 0);
        const frame = new Uint8Array(total);
        let off = 0;
        for (const c of frameChunks) {
            frame.set(c, off);
            off += c.length;
        }

        // Corrupt the last byte (part of the checksum)
        frame[frame.length - 1] ^= 0xFF;

        const decoder = new LZ4Decoder(null, true);

        assert.throws(() => {
            decoder.update(frame);
        }, /Checksum Error/);
    });

    it('should ignore checksum errors if verifyChecksum is false', () => {
        const input = new TextEncoder().encode("Ignore Corruption");
        const frame = getCompressedFrame(input, { contentChecksum: true });

        // Corrupt the last byte
        frame[frame.length - 1] ^= 0xFF;

        // Should NOT throw
        const result = decodeFrame(frame, null, false);
        assertBufferEquals(result, input, "Should recover data despite bad checksum");
    });

    // --- 3. Advanced Logic (Window & Dictionary) ---

    it('should handle Dependent Blocks (Sliding Window)', () => {
        // Create input larger than 1 block (64KB) to force splitting.
        // We use repetitive data so Block 2 refers back to Block 1.
        const input = new Uint8Array(70000);
        for(let i=0; i<input.length; i++) input[i] = i % 256;

        // Compress with small block size to ensure multiple blocks
        // blockIndependence = FALSE (Default)
        const frame = getCompressedFrame(input, { maxBlockSize: 65536, blockIndependence: false });

        const result = decodeFrame(frame);
        assertBufferEquals(result, input, "Dependent Block Decode Failed");
    });

    it('should decode with an External Dictionary', () => {
        const dictStr = "PrefixData_For_Compression_";
        const dict = new TextEncoder().encode(dictStr);

        const message = dictStr + "UniqueSuffix";
        const input = new TextEncoder().encode(message);

        // Compress WITH dictionary
        const frame = getCompressedFrame(input, { dictionary: dict });

        // Decompress WITH dictionary
        const result = decodeFrame(frame, dict);

        const text = new TextDecoder().decode(result);
        assert.strictEqual(text, message);
    });

    it('should fail if required Dictionary is missing', () => {
        const dictStr = "RequiredPrefix_";
        const dict = new TextEncoder().encode(dictStr);
        const input = new TextEncoder().encode(dictStr + "Suffix");

        const frame = getCompressedFrame(input, { dictionary: dict });

        // Decompress WITHOUT dictionary
        // This usually throws "Output buffer too small" or "Invalid offset"
        // because the back-reference goes into negative space (missing history).
        assert.throws(() => {
            decodeFrame(frame, null);
        }, Error);
    });
});