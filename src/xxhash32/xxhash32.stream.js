/**
 * @fileoverview Streaming port of xxHash32.
 * **Role:** Calculates 32-bit hash for data streams of unknown length.
 * **Optimization:** Hybrid. Uses Uint32Array for aligned block reads.
 */

// Detect Little Endian CPU
const IS_LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

// Prime Constants
const PRIME32_1 = 2654435761 | 0;
const PRIME32_2 = 2246822519 | 0;
const PRIME32_3 = 3266489917 | 0;
const PRIME32_4 =  668265263 | 0;
const PRIME32_5 =  374761393 | 0;

export class XXHash32Stream {
    /**
     * @param {number} [seed=0] - The 32-bit seed value.
     */
    constructor(seed = 0) {
        this.seed = seed | 0;
        this.totalLen = 0;

        // Internal buffer (can hold up to 15 bytes)
        this.buffer = new Uint8Array(16);
        this.bufSize = 0;

        // Internal State (v1-v4) for inputs >= 16 bytes
        this.v1 = (seed + PRIME32_1 + PRIME32_2) | 0;
        this.v2 = (seed + PRIME32_2) | 0;
        this.v3 = (seed + 0) | 0;
        this.v4 = (seed - PRIME32_1) | 0;
    }

    /**
     * Updates the hash with a new chunk of data.
     * @param {Uint8Array} chunk
     */
    update(chunk) {
        let chunkLen = chunk.length;
        if (chunkLen === 0) return;

        this.totalLen = (this.totalLen + chunkLen) | 0;
        let offset = 0;

        // ---------------------------------------------------------
        // 1. Fill Internal Buffer
        // ---------------------------------------------------------
        if (this.bufSize > 0) {
            const needed = 16 - this.bufSize;

            if (chunkLen < needed) {
                this.buffer.set(chunk, this.bufSize);
                this.bufSize += chunkLen;
                return;
            }

            // Fill buffer, process it
            this.buffer.set(chunk.subarray(0, needed), this.bufSize);

            // Process the 16 bytes in buffer
            const b = this.buffer;
            // Manual read from buffer (guaranteed to be 16 bytes here)
            const p0 = b[0]|(b[1]<<8)|(b[2]<<16)|(b[3]<<24);
            const p1 = b[4]|(b[5]<<8)|(b[6]<<16)|(b[7]<<24);
            const p2 = b[8]|(b[9]<<8)|(b[10]<<16)|(b[11]<<24);
            const p3 = b[12]|(b[13]<<8)|(b[14]<<16)|(b[15]<<24);

            this._processStripe(p0, p1, p2, p3);

            this.bufSize = 0;
            offset += needed;
            chunkLen -= needed;
        }

        // ---------------------------------------------------------
        // 2. Process Main Data (Hybrid Optimization)
        // ---------------------------------------------------------
        if (IS_LITTLE_ENDIAN && chunkLen >= 16) {
            const currentByteOffset = chunk.byteOffset + offset;

            // Fast Path: Aligned Reads
            if ((currentByteOffset & 3) === 0) {
                const p32 = new Uint32Array(chunk.buffer, currentByteOffset, chunkLen >>> 2);
                let i = 0;
                // Process 4 ints (16 bytes) at a time
                while (chunkLen >= 16) {
                    this._processStripe(p32[i], p32[i+1], p32[i+2], p32[i+3]);
                    i += 4;
                    chunkLen -= 16;
                    offset += 16;
                }
            } else {
                // Slow Path: Unaligned
                while (chunkLen >= 16) {
                    const o = offset;
                    const p0 = chunk[o]|(chunk[o+1]<<8)|(chunk[o+2]<<16)|(chunk[o+3]<<24);
                    const p1 = chunk[o+4]|(chunk[o+5]<<8)|(chunk[o+6]<<16)|(chunk[o+7]<<24);
                    const p2 = chunk[o+8]|(chunk[o+9]<<8)|(chunk[o+10]<<16)|(chunk[o+11]<<24);
                    const p3 = chunk[o+12]|(chunk[o+13]<<8)|(chunk[o+14]<<16)|(chunk[o+15]<<24);

                    this._processStripe(p0, p1, p2, p3);

                    offset += 16;
                    chunkLen -= 16;
                }
            }
        } else {
            // Fallback (Big Endian or small chunks)
            while (chunkLen >= 16) {
                const o = offset;
                const p0 = chunk[o]|(chunk[o+1]<<8)|(chunk[o+2]<<16)|(chunk[o+3]<<24);
                const p1 = chunk[o+4]|(chunk[o+5]<<8)|(chunk[o+6]<<16)|(chunk[o+7]<<24);
                const p2 = chunk[o+8]|(chunk[o+9]<<8)|(chunk[o+10]<<16)|(chunk[o+11]<<24);
                const p3 = chunk[o+12]|(chunk[o+13]<<8)|(chunk[o+14]<<16)|(chunk[o+15]<<24);

                this._processStripe(p0, p1, p2, p3);

                offset += 16;
                chunkLen -= 16;
            }
        }

        // ---------------------------------------------------------
        // 3. Buffer Remaining Tail
        // ---------------------------------------------------------
        if (chunkLen > 0) {
            this.buffer.set(chunk.subarray(offset, offset + chunkLen), 0);
            this.bufSize = chunkLen;
        }
    }

    /**
     * Finalizes the hash.
     * @returns {number} The 32-bit unsigned hash.
     */
    finalize() {
        let h32 = 0;

        // 1. Initialization depend on length
        if (this.totalLen >= 16) {
            // Converge state
            let v1 = this.v1, v2 = this.v2, v3 = this.v3, v4 = this.v4;

            h32 = (v1 << 1) | (v1 >>> 31);
            h32 = (h32 + v2) | 0;
            h32 = (h32 << 7) | (h32 >>> 25);
            h32 = (h32 + v3) | 0;
            h32 = (h32 << 12) | (h32 >>> 20);
            h32 = (h32 + v4) | 0;
            h32 = (h32 << 18) | (h32 >>> 14);
        } else {
            // Standard small input init
            h32 = (this.seed + PRIME32_5) | 0;
        }

        h32 = (h32 + this.totalLen) | 0;

        // 2. Process remaining buffer
        let offset = 0;
        let rem = this.bufSize;
        const b = this.buffer;

        // Process remaining 4-byte blocks
        while (rem >= 4) {
            const k1 = b[offset]|(b[offset+1]<<8)|(b[offset+2]<<16)|(b[offset+3]<<24);

            h32 = (h32 + Math.imul(k1, PRIME32_3)) | 0;
            h32 = (h32 << 17) | (h32 >>> 15);
            h32 = Math.imul(h32, PRIME32_4);

            offset += 4;
            rem -= 4;
        }

        // Process remaining bytes
        while (rem > 0) {
            h32 = (h32 + Math.imul(b[offset], PRIME32_5)) | 0;
            h32 = (h32 << 11) | (h32 >>> 21);
            h32 = Math.imul(h32, PRIME32_1);

            offset++;
            rem--;
        }

        // 3. Final Mix
        h32 ^= h32 >>> 15;
        h32 = Math.imul(h32, PRIME32_2);
        h32 ^= h32 >>> 13;
        h32 = Math.imul(h32, PRIME32_3);
        h32 ^= h32 >>> 16;

        return h32 >>> 0;
    }

    _processStripe(p0, p1, p2, p3) {
        this.v1 = (this.v1 + Math.imul(p0, PRIME32_2)) | 0;
        this.v1 = (this.v1 << 13) | (this.v1 >>> 19);
        this.v1 = Math.imul(this.v1, PRIME32_1);

        this.v2 = (this.v2 + Math.imul(p1, PRIME32_2)) | 0;
        this.v2 = (this.v2 << 13) | (this.v2 >>> 19);
        this.v2 = Math.imul(this.v2, PRIME32_1);

        this.v3 = (this.v3 + Math.imul(p2, PRIME32_2)) | 0;
        this.v3 = (this.v3 << 13) | (this.v3 >>> 19);
        this.v3 = Math.imul(this.v3, PRIME32_1);

        this.v4 = (this.v4 + Math.imul(p3, PRIME32_2)) | 0;
        this.v4 = (this.v4 << 13) | (this.v4 >>> 19);
        this.v4 = Math.imul(this.v4, PRIME32_1);
    }
}