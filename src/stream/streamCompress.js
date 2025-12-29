import { LZ4Encoder } from "../shared/lz4Encode.js";
import { Lz4Base } from "../shared/lz4Base.js";

/**
 * Creates a standard TransformStream for LZ4 compression.
 * @param {number} [maxBlockSize=4194304] - Target block size (default 4MB).
 */
export function createCompressStream(dictionary = null, maxBlockSize = 4194304, blockIndependence = false, contentChecksum = false) {
    const encoder = new LZ4Encoder(dictionary, maxBlockSize, blockIndependence, contentChecksum);

    return new TransformStream({
        transform(chunk, controller) {
            try {
                const data = Lz4Base.ensureBuffer(chunk);
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