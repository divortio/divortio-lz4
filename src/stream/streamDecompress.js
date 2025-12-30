import { LZ4Decoder } from '../shared/lz4Decode.js';
import { ensureBuffer } from '../shared/lz4Util.js';

/**
 * Creates a standard TransformStream for LZ4 decompression.
 *
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary (history window).
 * @param {boolean} [verifyChecksum=true] - If false, skips content checksum verification (faster).
 * @returns {TransformStream} A web standard TransformStream that accepts compressed chunks and emits decompressed Uint8Array chunks.
 */
export function createDecompressStream(dictionary = null, verifyChecksum = true) {
    const decoder = new LZ4Decoder(dictionary, verifyChecksum);

    return new TransformStream({
        transform(chunk, controller) {
            try {
                // Compatibility check (ensure input is always a buffer)
                const data = ensureBuffer(chunk);

                const chunks = decoder.update(data);
                for (const c of chunks) {
                    controller.enqueue(c);
                }
            } catch (e) {
                controller.error(e);
            }
        }
    });
}