/**
 * src/shared/lz4Util.js
 * Common type checking and coercion utility.
 */


/**
 * Ensures the input is a Uint8Array.
 * Automatically coerces Strings, Arrays, and JSON-serializable Objects.
 * @param {string|ArrayBuffer|ArrayBufferView|Array<number>|Object} input
 * @returns {Uint8Array}
 */
export function ensureBuffer(input) {
    if (input instanceof Uint8Array) return input;
    if (typeof input === 'string') return new TextEncoder().encode(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (Array.isArray(input)) return new Uint8Array(input);

    // Handle Plain Objects (JSON)
    if (typeof input === 'object' && input !== null) {
        try {
            const json = JSON.stringify(input);
            if (json !== undefined) {
                return new TextEncoder().encode(json);
            }
        } catch (e) {
            // If serialization fails, fall through to TypeError
        }
    }

    throw new TypeError("LZ4: Input must be a String, ArrayBuffer, View, Array, or Serializable Object");
}