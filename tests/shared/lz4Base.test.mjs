import { it, describe } from 'node:test';
import assert from 'node:assert';
import { Lz4Base } from '../../src/shared/lz4Base.js';
import { MAGIC_NUMBER } from '../../src/shared/constants.js';

describe('Lz4Base (Shared)', () => {
    it('readU32/writeU32 should be symmetric', () => {
        const buf = new Uint8Array(4);
        const val = 0x12345678;
        Lz4Base.writeU32(buf, val, 0);
        const readBack = Lz4Base.readU32(buf, 0);
        assert.strictEqual(readBack, val);
    });

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

    it('createFrameHeader should produce valid LZ4 Magic Number', () => {
        const header = Lz4Base.createFrameHeader(true, true, 4);
        const magic = Lz4Base.readU32(header, 0);
        assert.strictEqual(magic, MAGIC_NUMBER);
        assert.strictEqual(header.length, 7);
    });
});