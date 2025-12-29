/**
 * src/xxhash32/xxhash32Stateful.js
 * A stateful Class implementation of xxHash32.
 * Optimized for V8 JIT with strict 32-bit integer math.
 */

const PRIME32_1 = 2654435761 | 0;
const PRIME32_2 = 2246822519 | 0;
const PRIME32_3 = 3266489917 | 0;
const PRIME32_4 =  668265263 | 0;
const PRIME32_5 =  374761393 | 0;

export class XXHash32 {
    /**
     * @param {number} [seed=0]
     */
    constructor(seed = 0) {
        this.seed = seed | 0;
        this.totalLen = 0 | 0;
        this.memSize = 0 | 0;
        this.memory = new Uint8Array(16);

        // State
        this.v1 = (this.seed + PRIME32_1 + PRIME32_2) | 0;
        this.v2 = (this.seed + PRIME32_2) | 0;
        this.v3 = this.seed | 0;
        this.v4 = (this.seed - PRIME32_1) | 0;
    }

    /**
     * Updates the hash state with a new chunk of data.
     * @param {Uint8Array} input
     */
    update(input) {
        let p = 0 | 0;
        const len = input.length | 0;
        this.totalLen = (this.totalLen + len) | 0;

        // 1. Fill internal memory if we have leftovers
        if ((this.memSize + len) < 16) {
            this.memory.set(input, this.memSize);
            this.memSize = (this.memSize + len) | 0;
            return;
        }

        if (this.memSize > 0) {
            const sliceSize = (16 - this.memSize) | 0;
            this.memory.set(input.subarray(0, sliceSize), this.memSize);

            this._processStripe(this.memory, 0);

            p = sliceSize;
            this.memSize = 0;
        }

        // 2. Process full 16-byte stripes from input
        const limit = (len - 16) | 0;
        while (p <= limit) {
            this._processStripe(input, p);
            p = (p + 16) | 0;
        }

        // 3. Buffer remaining bytes
        if (p < len) {
            this.memory.set(input.subarray(p, len), 0);
            this.memSize = (len - p) | 0;
        }
    }

    /**
     * @private
     */
    _processStripe(b, offset) {
        const i1 = (b[offset] | (b[offset + 1] << 8) | (b[offset + 2] << 16) | (b[offset + 3] << 24));
        const i2 = (b[offset + 4] | (b[offset + 5] << 8) | (b[offset + 6] << 16) | (b[offset + 7] << 24));
        const i3 = (b[offset + 8] | (b[offset + 9] << 8) | (b[offset + 10] << 16) | (b[offset + 11] << 24));
        const i4 = (b[offset + 12] | (b[offset + 13] << 8) | (b[offset + 14] << 16) | (b[offset + 15] << 24));

        let v1 = this.v1;
        let v2 = this.v2;
        let v3 = this.v3;
        let v4 = this.v4;

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

        this.v1 = v1;
        this.v2 = v2;
        this.v3 = v3;
        this.v4 = v4;
    }

    /**
     * Finalizes the hash calculation.
     * @returns {number} The 32-bit hash.
     */
    digest() {
        let h32 = 0 | 0;

        if (this.totalLen >= 16) {
            h32 = ((this.v1 << 1) | (this.v1 >>> 31)) | 0;
            h32 = (h32 + this.v2) | 0;
            h32 = ((h32 << 7) | (h32 >>> 25)) | 0;
            h32 = (h32 + this.v3) | 0;
            h32 = ((h32 << 12) | (h32 >>> 20)) | 0;
            h32 = (h32 + this.v4) | 0;
            h32 = ((h32 << 18) | (h32 >>> 14)) | 0;
        } else {
            h32 = (this.seed + PRIME32_5) | 0;
        }

        h32 = (h32 + this.totalLen) | 0;

        let p = 0 | 0;
        const limit = (this.memSize - 4) | 0;

        while (p <= limit) {
            const val = (this.memory[p] | (this.memory[p + 1] << 8) | (this.memory[p + 2] << 16) | (this.memory[p + 3] << 24));
            h32 = (h32 + Math.imul(val, PRIME32_3)) | 0;
            h32 = ((h32 << 17) | (h32 >>> 15));
            h32 = Math.imul(h32, PRIME32_4);
            p = (p + 4) | 0;
        }

        while (p < this.memSize) {
            h32 = (h32 + Math.imul(this.memory[p], PRIME32_5)) | 0;
            h32 = ((h32 << 11) | (h32 >>> 21));
            h32 = Math.imul(h32, PRIME32_1);
            p = (p + 1) | 0;
        }

        h32 ^= h32 >>> 15;
        h32 = Math.imul(h32, PRIME32_2);
        h32 ^= h32 >>> 13;
        h32 = Math.imul(h32, PRIME32_3);
        h32 ^= h32 >>> 16;

        return h32 >>> 0;
    }
}