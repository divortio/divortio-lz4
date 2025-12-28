
import {LZ4Encoder} from "../shared/lz4Encode.js";

/**
 * Creates a standard TransformStream for LZ4 compression.
 */
export function createCompressStream(options = {}) {
    const encoder = new LZ4Encoder(options);

    return new TransformStream({
        transform(chunk, controller) {
            try {
                const frames = encoder.update(chunk);
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