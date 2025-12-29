import { it, describe } from 'node:test';
import assert from 'node:assert';
import { LZ4 } from '../../src/lz4.js';

describe('Dictionary Support', () => {

    // Common data pattern
    const DICT_STRING = "CommonPrefix_SharedData_Reference_1234567890";
    const MSG_1 = DICT_STRING + "_UniquePartA";
    const MSG_2 = DICT_STRING + "_UniquePartB";

    const dict = new TextEncoder().encode(DICT_STRING);
    const input1 = new TextEncoder().encode(MSG_1);

    it('should compress better with a dictionary', () => {
        // 1. Compress WITHOUT dictionary
        const noDictComp = LZ4.compress(input1, null);

        // 2. Compress WITH dictionary
        const withDictComp = LZ4.compress(input1, dict);

        // With dictionary, LZ4 should replace "CommonPrefix..." with a tiny reference
        // So `withDictComp` should be smaller than `noDictComp`
        assert.ok(withDictComp.length < noDictComp.length,
            `Dictionary output (${withDictComp.length}) should be smaller than standard (${noDictComp.length})`);
    });

    it('should fail to decompress dictionary-dependent data without the dictionary', () => {
        const withDictComp = LZ4.compress(input1, dict);

        // Attempt decompress without dict
        assert.throws(() => {
            LZ4.decompress(withDictComp, null);
        }, /dictionary/i, "Should throw error about missing history or bounds");
    });

    it('should successfully decompress with the correct dictionary', () => {
        const withDictComp = LZ4.compress(input1, dict);
        const restored = LZ4.decompress(withDictComp, dict);

        const text = new TextDecoder().decode(restored);
        assert.strictEqual(text, MSG_1);
    });
});