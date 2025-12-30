import { LZ4Encoder } from "../shared/lz4Encode.js";
import { ensureBuffer } from "../shared/lz4Util.js";

/**
 * Creates a standard TransformStream for LZ4 compression.
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary for compression.
 * @param {number} [maxBlockSize=4194304] - Target block size (default 4MB).
 * @param {boolean} [blockIndependence=false] - If false, allows matches across blocks (better compression, slower seeking).
 * @param {boolean} [contentChecksum=false] - If true, appends XXHash32 checksum at the end of the stream.
 * @returns {TransformStream} A web standard TransformStream that accepts Uint8Array chunks.
 */
export function createCompressStream(dictionary = null, maxBlockSize = 4194304, blockIndependence = false, contentChecksum = false) {
    const encoder = new LZ4Encoder(dictionary, maxBlockSize, blockIndependence, contentChecksum);

    return new TransformStream({
        transform(chunk, controller) {
            try {
                // Compatibility check (ensure input is always a buffer)
                const data = ensureBuffer(chunk);
                const frames = encoder.update(data);
                for (const frame of frames) controller.enqueue(frame);
            } catch (e) {
                controller.error(e);
            }
        },
        flush(controller) {
            try {
                const frames = encoder.finish();
                for (const frame of frames) controller.enqueue(frame);
            } catch (e) {
                controller.error(e);
            }
        }
    });
}