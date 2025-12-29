import { it, describe } from 'node:test';
import assert from 'node:assert';
import { Lz4Base } from '../../src/shared/lz4Base.js';
import { MAGIC_NUMBER } from '../../src/shared/constants.js';

describe('Lz4Base (Shared Utilities)', () => {

    // --- 1. Integer Handling ---

    it('readU32/writeU32 should be symmetric', () => {
        const buf = new Uint8Array(4);
        const val = 0x12345678;
        Lz4Base.writeU32(buf, val, 0);

        const readBack = Lz4Base.readU32(buf, 0);
        assert.strictEqual(readBack, val);

        // Verify Little Endian byte order (78 56 34 12)
        assert.strictEqual(buf[0], 0x78);
        assert.strictEqual(buf[3], 0x12);
    });

    it('readU16/writeU16 should be symmetric', () => {
        const buf = new Uint8Array(2);
        const val = 0xABCD;
        Lz4Base.writeU16(buf, val, 0);

        const readBack = Lz4Base.readU16(buf, 0);
        assert.strictEqual(readBack, val);

        // Verify Little Endian (CD AB)
        assert.strictEqual(buf[0], 0xCD);
        assert.strictEqual(buf[1], 0xAB);
    });

    // --- 2. Input Normalization ---

    it('ensureBuffer should handle Strings', () => {
        const buf = Lz4Base.ensureBuffer("Hello");
        assert.ok(buf instanceof Uint8Array);
        assert.strictEqual(buf.length, 5);
        assert.strictEqual(buf[0], 72); // 'H'
    });

    it('ensureBuffer should handle Objects (JSON)', () => {
        const obj = { a: 1 };
        const buf = Lz4Base.ensureBuffer(obj);
        const str = new TextDecoder().decode(buf);
        assert.strictEqual(str, '{"a":1}');
    });

    it('ensureBuffer should handle ArrayBuffer', () => {
        const ab = new ArrayBuffer(4);
        const buf = Lz4Base.ensureBuffer(ab);
        assert.ok(buf instanceof Uint8Array);
        assert.strictEqual(buf.length, 4);
    });

    it('ensureBuffer should pass-through Uint8Array', () => {
        const input = new Uint8Array([1, 2]);
        const output = Lz4Base.ensureBuffer(input);
        assert.strictEqual(input, output, "Should return exact same instance");
    });

    // --- 3. Block ID Resolution ---

    it('getBlockId should map sizes to LZ4 constants', () => {
        // 4: 64KB, 5: 256KB, 6: 1MB, 7: 4MB
        assert.strictEqual(Lz4Base.getBlockId(100), 4, "Small -> 64KB");
        assert.strictEqual(Lz4Base.getBlockId(65536), 4, "64KB -> 64KB");

        assert.strictEqual(Lz4Base.getBlockId(65537), 5, ">64KB -> 256KB");
        assert.strictEqual(Lz4Base.getBlockId(262144), 5, "256KB -> 256KB");

        assert.strictEqual(Lz4Base.getBlockId(262145), 6, ">256KB -> 1MB");

        assert.strictEqual(Lz4Base.getBlockId(4194304), 7, "4MB -> 4MB");
        assert.strictEqual(Lz4Base.getBlockId(undefined), 4, "Default -> 64KB");
    });

    // --- 4. Frame Headers ---

    it('createFrameHeader should produce valid structure', () => {
        // Options: Independent(false), ContentChecksum(false), BlockID(7=4MB)
        const header = Lz4Base.createFrameHeader(false, false, 7);

        assert.strictEqual(header.length, 7);

        // Magic Number
        const magic = Lz4Base.readU32(header, 0);
        assert.strictEqual(magic, MAGIC_NUMBER);

        // FLG Byte (Offset 4)
        // Version(01) << 6 = 0x40
        // Indep(0) + Checksum(0) = 0
        assert.strictEqual(header[4], 0x40);

        // BD Byte (Offset 5)
        // BlockID(7) << 4 = 0x70
        assert.strictEqual(header[5], 0x70);

        // Header Checksum (Offset 6)
        // Should be present (not 0, unless hash is 0)
        assert.ok(header[6] !== undefined);
    });

    it('createFrameHeader should set flags correctly', () => {
        // Options: Independent(true), ContentChecksum(true), BlockID(4)
        const header = Lz4Base.createFrameHeader(true, true, 4);

        // FLG Byte
        // Version(01)<<6 (0x40) | Indep(1)<<5 (0x20) | ContentChecksum(1)<<2 (0x04)
        // 0x40 + 0x20 + 0x04 = 0x64
        assert.strictEqual(header[4], 0x64);
    });
});