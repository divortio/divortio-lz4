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
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary.
 * @param {number} [maxBlockSize=65536] - Target block size (default 64KB).
 * @param {boolean} [blockIndependence=false] - If false, blocks can match previous blocks (better ratio).
 * @param {boolean} [contentChecksum=false] - If true, appends xxHash32 (slower).
 * @returns {Uint8Array} The compressed LZ4 frame.
 */
export function compressString(str, dictionary = null, maxBlockSize = 65536, blockIndependence = false, contentChecksum = false) {
    const rawBytes = textEncoder.encode(str);
    return compressBuffer(rawBytes, dictionary, maxBlockSize, blockIndependence, contentChecksum);
}

/**
 * Decompresses an LZ4 Frame directly into a JavaScript string.
 * Assumes the decompressed data is valid UTF-8.
 *
 * @param {Uint8Array} compressedData - The LZ4 frame.
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary.
 * @param {boolean} [verifyChecksum=true] - If false, skips content checksum verification (faster).
 * @returns {string} The decoded string.
 */
export function decompressString(compressedData, dictionary = null, verifyChecksum = true) {
    const rawBytes = decompressBuffer(compressedData, dictionary, verifyChecksum);
    return textDecoder.decode(rawBytes);
}

/**
 * Compresses a JavaScript Object (JSON) directly to an LZ4 Frame.
 * Handles JSON serialization and UTF-8 encoding automatically.
 *
 * @param {Object|Array|number|boolean} obj - The object to serialize and compress.
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary.
 * @param {number} [maxBlockSize=65536] - Target block size.
 * @param {boolean} [blockIndependence=false] - If false, blocks can match previous blocks.
 * @param {boolean} [contentChecksum=false] - If true, appends xxHash32.
 * @returns {Uint8Array} The compressed LZ4 frame.
 */
export function compressObject(obj, dictionary = null, maxBlockSize = 65536, blockIndependence = false, contentChecksum = false) {
    const jsonStr = JSON.stringify(obj);
    const rawBytes = textEncoder.encode(jsonStr);
    return compressBuffer(rawBytes, dictionary, maxBlockSize, blockIndependence, contentChecksum);
}

/**
 * Decompresses an LZ4 Frame directly into a JavaScript Object.
 * Assumes the data is valid JSON.
 *
 * @param {Uint8Array} compressedData - The LZ4 frame.
 * @param {Uint8Array|null} [dictionary=null] - Optional initial dictionary.
 * @param {boolean} [verifyChecksum=true] - If false, skips content checksum verification.
 * @returns {Object|Array|number|boolean} The parsed object.
 */
export function decompressObject(compressedData, dictionary = null, verifyChecksum = true) {
    const rawBytes = decompressBuffer(compressedData, dictionary, verifyChecksum);
    const jsonStr = textDecoder.decode(rawBytes);
    return JSON.parse(jsonStr);
}