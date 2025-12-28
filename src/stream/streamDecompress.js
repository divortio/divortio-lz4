

import {LZ4Decoder} from '../shared/lz4Decode.js';

/**
 * Creates a standard TransformStream for LZ4 decompression.
 */
export function createDecompressStream(options = {}) {
    const decoder = new LZ4Decoder(options);

    return new TransformStream({
        transform(chunk, controller) {
            try {
                const chunks = decoder.update(chunk);
                for (const c of chunks) controller.enqueue(c);
            } catch (e) {
                controller.error(e);
            }
        }
    });
}