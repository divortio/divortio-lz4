import { compressBuffer } from '../buffer/bufferCompress.js';
import { decompressBuffer } from '../buffer/bufferDecompress.js';

// Cached instances to reduce garbage collection overhead
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Compresses a JavaScript string directly to an LZ4 Frame.
 * Handles UTF-8 encoding automatically.
 *
 * @param {string} str - The string to compress.
 * @param {Object} [options] - LZ4 compression options.
 * @returns {Uint8Array} The compressed LZ4 frame.
 */
export function compressString(str, options) {
    const rawBytes = textEncoder.encode(str);
    return compressBuffer(rawBytes, options);
}

/**
 * Decompresses an LZ4 Frame directly into a JavaScript string.
 * Assumes the decompressed data is valid UTF-8.
 *
 * @param {Uint8Array} compressedData - The LZ4 frame.
 * @returns {string} The decoded string.
 */
export function decompressString(compressedData) {
    const rawBytes = decompressBuffer(compressedData);
    return textDecoder.decode(rawBytes);
}

/**
 * Compresses a JavaScript Object (JSON) directly to an LZ4 Frame.
 * Handles JSON serialization and UTF-8 encoding automatically.
 *
 * @param {Object|Array|number|boolean} obj - The object to serialize and compress.
 * @param {Object} [options] - LZ4 compression options.
 * @returns {Uint8Array} The compressed LZ4 frame.
 */
export function compressObject(obj, options) {
    const jsonStr = JSON.stringify(obj);
    const rawBytes = textEncoder.encode(jsonStr);
    return compressBuffer(rawBytes, options);
}

/**
 * Decompresses an LZ4 Frame directly into a JavaScript Object.
 * Assumes the data is valid JSON.
 *
 * @param {Uint8Array} compressedData - The LZ4 frame.
 * @returns {Object|Array|number|boolean} The parsed object.
 */
export function decompressObject(compressedData) {
    const rawBytes = decompressBuffer(compressedData);
    const jsonStr = textDecoder.decode(rawBytes);
    return JSON.parse(jsonStr);
}