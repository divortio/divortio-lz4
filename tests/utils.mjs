import assert from 'node:assert';


export function createRandomBuffer(size) {
    const buf = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        buf[i] = Math.floor(Math.random() * 256);
    }
    return buf;
}

export function assertBufferEquals(actual, expected, message) {
    assert.strictEqual(actual.length, expected.length, `${message}: Length mismatch`);
    for (let i = 0; i < actual.length; i++) {
        if (actual[i] !== expected[i]) {
            assert.fail(`${message}: Mismatch at byte ${i}. Expected ${expected[i]}, got ${actual[i]}`);
        }
    }
}

// "Hello World" in LZ4 Frame Format (Standard Reference)
// Header: Magic(4) + FLG/BD(2) + HC(1)
// Block: Size(4) + Data(11) + EndMark(4) + ContentChecksum(4)
export const GOLDEN_INPUT = "Hello World";
// Note: This hex might vary slightly based on block independence flags,
// but we will generate our own golden references dynamically in some tests.