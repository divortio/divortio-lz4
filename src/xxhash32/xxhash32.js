/**
 * src/xxhash32/xxhash32.js
 * Stateless (One-Shot) implementation of xxHash32.
 * Optimized for V8 JIT with strict 32-bit integer math.
 *
 * Usage: const hash = xxHash32(buffer, seed);
 */

const PRIME32_1 = 2654435761 | 0;
const PRIME32_2 = 2246822519 | 0;
const PRIME32_3 = 3266489917 | 0;
const PRIME32_4 =  668265263 | 0;
const PRIME32_5 =  374761393 | 0;

/**
 * Calculates the 32-bit hash of a buffer in a single pass.
 * @param {Uint8Array} input - The data buffer.
 * @param {number} [seed=0] - The seed value.
 * @returns {number} The 32-bit unsigned hash.
 */
export function xxHash32(input, seed = 0) {
    seed = seed | 0;
    const len = input.length | 0;
    let h32 = 0 | 0;
    let p = 0 | 0;

    if (len >= 16) {
        const limit = (len - 16) | 0;
        let v1 = (seed + PRIME32_1 + PRIME32_2) | 0;
        let v2 = (seed + PRIME32_2) | 0;
        let v3 = seed;
        let v4 = (seed - PRIME32_1) | 0;

        while (p <= limit) {
            const i1 = (input[p] | (input[p+1] << 8) | (input[p+2] << 16) | (input[p+3] << 24));
            const i2 = (input[p+4] | (input[p+5] << 8) | (input[p+6] << 16) | (input[p+7] << 24));
            const i3 = (input[p+8] | (input[p+9] << 8) | (input[p+10] << 16) | (input[p+11] << 24));
            const i4 = (input[p+12] | (input[p+13] << 8) | (input[p+14] << 16) | (input[p+15] << 24));

            v1 = (v1 + Math.imul(i1, PRIME32_2)) | 0;
            v1 = ((v1 << 13) | (v1 >>> 19));
            v1 = Math.imul(v1, PRIME32_1);

            v2 = (v2 + Math.imul(i2, PRIME32_2)) | 0;
            v2 = ((v2 << 13) | (v2 >>> 19));
            v2 = Math.imul(v2, PRIME32_1);

            v3 = (v3 + Math.imul(i3, PRIME32_2)) | 0;
            v3 = ((v3 << 13) | (v3 >>> 19));
            v3 = Math.imul(v3, PRIME32_1);

            v4 = (v4 + Math.imul(i4, PRIME32_2)) | 0;
            v4 = ((v4 << 13) | (v4 >>> 19));
            v4 = Math.imul(v4, PRIME32_1);

            p = (p + 16) | 0;
        }

        h32 = ((v1 << 1) | (v1 >>> 31)) | 0;
        h32 = (h32 + v2) | 0;
        h32 = ((h32 << 7) | (h32 >>> 25)) | 0;
        h32 = (h32 + v3) | 0;
        h32 = ((h32 << 12) | (h32 >>> 20)) | 0;
        h32 = (h32 + v4) | 0;
        h32 = ((h32 << 18) | (h32 >>> 14)) | 0;
    } else {
        h32 = (seed + PRIME32_5) | 0;
    }

    h32 = (h32 + len) | 0;

    // Process remaining 4-byte chunks
    const limit4 = (len - 4) | 0;
    while (p <= limit4) {
        const i = (input[p] | (input[p+1] << 8) | (input[p+2] << 16) | (input[p+3] << 24));
        h32 = (h32 + Math.imul(i, PRIME32_3)) | 0;
        h32 = ((h32 << 17) | (h32 >>> 15));
        h32 = Math.imul(h32, PRIME32_4);
        p = (p + 4) | 0;
    }

    // Process remaining bytes
    while (p < len) {
        h32 = (h32 + Math.imul(input[p], PRIME32_5)) | 0;
        h32 = ((h32 << 11) | (h32 >>> 21));
        h32 = Math.imul(h32, PRIME32_1);
        p = (p + 1) | 0;
    }

    // Final Mix
    h32 ^= h32 >>> 15;
    h32 = Math.imul(h32, PRIME32_2);
    h32 ^= h32 >>> 13;
    h32 = Math.imul(h32, PRIME32_3);
    h32 ^= h32 >>> 16;

    return h32 >>> 0;
}