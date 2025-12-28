
/**
 * @fileoverview High-performance JavaScript port of xxHash32.
 * **Role:** The fastest pure 32-bit hash function for JS.
 * **Optimization:** Hybrid. Uses Uint32Array for aligned block reads (Zero-Copy).
 * @module xxhash32
 */

// Detect Little Endian CPU
const IS_LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

// Prime Constants
const PRIME32_1 = 2654435761 | 0;
const PRIME32_2 = 2246822519 | 0;
const PRIME32_3 = 3266489917 | 0;
const PRIME32_4 =  668265263 | 0;
const PRIME32_5 =  374761393 | 0;

/**
 * xxHash32.
 * @param {Uint8Array} input - The input byte array.
 * @param {number} [seed=0] - 32-bit seed.
 * @returns {number} The 32-bit hash (unsigned).
 */
export function xxHash32(input, seed = 0) {
    let len = input.length | 0;
    let h32 = 0;
    let offset = 0;

    // ---------------------------------------------------------
    // 1. Process 16-byte stripes (4 x 32-bit integers)
    // ---------------------------------------------------------
    if (len >= 16) {
        let limit = len - 16;
        let v1 = (seed + PRIME32_1 + PRIME32_2) | 0;
        let v2 = (seed + PRIME32_2) | 0;
        let v3 = (seed + 0) | 0;
        let v4 = (seed - PRIME32_1) | 0;

        // Optimization: Aligned Fast Path
        if (IS_LITTLE_ENDIAN && (input.byteOffset & 3) === 0) {
            const p32 = new Uint32Array(input.buffer, input.byteOffset, len >>> 2);
            let i = 0;
            // Limit check must be in 32-bit words (limit in bytes / 4)
            const limit32 = limit >>> 2;

            while (offset <= limit) {
                v1 = (v1 + Math.imul(p32[i], PRIME32_2)) | 0;
                v1 = (v1 << 13) | (v1 >>> 19);
                v1 = Math.imul(v1, PRIME32_1);

                v2 = (v2 + Math.imul(p32[i+1], PRIME32_2)) | 0;
                v2 = (v2 << 13) | (v2 >>> 19);
                v2 = Math.imul(v2, PRIME32_1);

                v3 = (v3 + Math.imul(p32[i+2], PRIME32_2)) | 0;
                v3 = (v3 << 13) | (v3 >>> 19);
                v3 = Math.imul(v3, PRIME32_1);

                v4 = (v4 + Math.imul(p32[i+3], PRIME32_2)) | 0;
                v4 = (v4 << 13) | (v4 >>> 19);
                v4 = Math.imul(v4, PRIME32_1);

                i += 4;
                offset += 16;
            }
        } else {
            // Unaligned Slow Path (Byte Re-assembly)
            while (offset <= limit) {
                const i = offset;
                const p0 = input[i]|(input[i+1]<<8)|(input[i+2]<<16)|(input[i+3]<<24);
                const p1 = input[i+4]|(input[i+5]<<8)|(input[i+6]<<16)|(input[i+7]<<24);
                const p2 = input[i+8]|(input[i+9]<<8)|(input[i+10]<<16)|(input[i+11]<<24);
                const p3 = input[i+12]|(input[i+13]<<8)|(input[i+14]<<16)|(input[i+15]<<24);

                v1 = (v1 + Math.imul(p0, PRIME32_2)) | 0; v1 = (v1 << 13) | (v1 >>> 19); v1 = Math.imul(v1, PRIME32_1);
                v2 = (v2 + Math.imul(p1, PRIME32_2)) | 0; v2 = (v2 << 13) | (v2 >>> 19); v2 = Math.imul(v2, PRIME32_1);
                v3 = (v3 + Math.imul(p2, PRIME32_2)) | 0; v3 = (v3 << 13) | (v3 >>> 19); v3 = Math.imul(v3, PRIME32_1);
                v4 = (v4 + Math.imul(p3, PRIME32_2)) | 0; v4 = (v4 << 13) | (v4 >>> 19); v4 = Math.imul(v4, PRIME32_1);

                offset += 16;
            }
        }

        h32 = (v1 << 1) | (v1 >>> 31);
        h32 = (h32 + v2) | 0;
        h32 = (h32 << 7) | (h32 >>> 25);
        h32 = (h32 + v3) | 0;
        h32 = (h32 << 12) | (h32 >>> 20);
        h32 = (h32 + v4) | 0;
        h32 = (h32 << 18) | (h32 >>> 14);
    } else {
        h32 = (seed + PRIME32_5) | 0;
    }

    h32 = (h32 + len) | 0;

    // ---------------------------------------------------------
    // 2. Process remaining 4-byte blocks
    // ---------------------------------------------------------
    while (offset <= len - 4) {
        // We can safely read 4 bytes because logic ensures bounds
        const k1 = input[offset]|(input[offset+1]<<8)|(input[offset+2]<<16)|(input[offset+3]<<24);

        h32 = (h32 + Math.imul(k1, PRIME32_3)) | 0;
        h32 = (h32 << 17) | (h32 >>> 15);
        h32 = Math.imul(h32, PRIME32_4);
        offset += 4;
    }

    // ---------------------------------------------------------
    // 3. Process remaining bytes (1..3)
    // ---------------------------------------------------------
    while (offset < len) {
        h32 = (h32 + Math.imul(input[offset], PRIME32_5)) | 0;
        h32 = (h32 << 11) | (h32 >>> 21);
        h32 = Math.imul(h32, PRIME32_1);
        offset++;
    }

    // ---------------------------------------------------------
    // 4. Final Mix (Avalanche)
    // ---------------------------------------------------------
    h32 ^= h32 >>> 15;
    h32 = Math.imul(h32, PRIME32_2);
    h32 ^= h32 >>> 13;
    h32 = Math.imul(h32, PRIME32_3);
    h32 ^= h32 >>> 16;

    return h32 >>> 0;
}