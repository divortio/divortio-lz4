import { describe, it } from 'node:test';
import assert from 'node:assert';
import { decompressBuffer } from '../src/buffer/bufferDecompress.js';
import { compressBuffer } from '../src/buffer/bufferCompress.js';

// Helper to convert Hex String to Uint8Array
function fromHex(hexString) {
    return new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

describe('Golden Reference Tests (Spec Compliance)', () => {

    /**
     * Test Case 1: "Hello World" Manual Frame (Minimal)
     * Header: 60 40 (Indep, 64KB) -> Checksum 82
     */
    it('should decompress a manually constructed "Hello World" spec frame', () => {
        // Magic: 04 22 4D 18
        // Header: 60 40 82
        // Block: 0B 00 00 80 (Size 11, Uncompressed)
        // Data: "Hello World"
        // EndMark: 00 00 00 00
        const hex = "04224D186040820B00008048656c6c6f20576f726c6400000000";
        const input = fromHex(hex);
        const output = decompressBuffer(input);
        const text = new TextDecoder().decode(output);
        assert.strictEqual(text, "Hello World");
    });

    /**
     * Test Case 2: Empty Frame with 4MB Block Size
     * Header: 60 70 (Indep, 4MB)
     * Header Checksum: xxHash32(60 70) >> 8 = 0x73
     */
    it('should decompress a valid Empty Frame (4MB blocks)', () => {
        // Magic: 04 22 4D 18
        // FLG, BD, HC: 60 70 73
        // EndMark: 00 00 00 00
        const hex = "04224D1860707300000000";
        const input = fromHex(hex);
        const output = decompressBuffer(input);
        assert.strictEqual(output.length, 0);
    });

    /**
     * Test Case 3: "Hello World" with Content Checksum
     * Header: 64 (Indep + ContentChecksum) 40 (64KB).
     * Header Checksum: xxHash32(64 40) >> 8 = 0xA7.
     * Content Checksum of "Hello World": 0xB1FD16EE (LE: EE 16 FD B1).
     */
    it('should decompress a frame with Content Checksum', () => {
        const hex = "04224D186440A70B00008048656c6c6f20576f726c6400000000EE16FDB1";
        const input = fromHex(hex);
        const output = decompressBuffer(input);
        assert.strictEqual(new TextDecoder().decode(output), "Hello World");
    });

    /**
     * Test Case 4: Verify Header Generation (Standard)
     * Matches flags used in Test Case 1.
     */
    it('should generate a spec-compliant header for "Hello World" (Standard)', () => {
        const input = new TextEncoder().encode("Hello World");

        // Options: dict=null, size=65536, indep=true, checksum=false
        const compressed = compressBuffer(input, null, 65536, true, false);

        // Header: 60 40 82
        assert.strictEqual(compressed[4], 0x60, "FLG Mismatch (Standard)");
        assert.strictEqual(compressed[5], 0x40, "BD Mismatch (Standard)");
        assert.strictEqual(compressed[6], 0x82, "HC Mismatch (Standard)");
    });

    /**
     * Test Case 5: Verify Header Generation (With Checksum)
     * Matches flags used in Test Case 3.
     */
    it('should generate a spec-compliant header with Content Checksum', () => {
        const input = new TextEncoder().encode("Hello World");

        // Options: dict=null, size=65536, indep=true, checksum=true
        const compressed = compressBuffer(input, null, 65536, true, true);

        // Header: 64 40 A7
        // FLG 0x64 = Version(01) | Indep(1) | Checksum(1)
        assert.strictEqual(compressed[4], 0x64, "FLG Mismatch (Checksum)");
        assert.strictEqual(compressed[5], 0x40, "BD Mismatch (Checksum)");
        assert.strictEqual(compressed[6], 0xA7, "HC Mismatch (Checksum)");
    });
});