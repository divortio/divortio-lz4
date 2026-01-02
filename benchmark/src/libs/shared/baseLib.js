/**
 * Abstract Base Class for Benchmark Libraries
 */
export class BaseLib {
    /**
     * @param {string} name - Semantic name referenced in the benchmark (e.g., 'snappyjs')
     * @param {string} library - NPM package name (e.g., 'snappyjs')
     * @param {string} environment - Runtime environment: 'NodeJS', 'Web', or 'V8' (Universal)
     * @param {string} language - Implementation language: 'C++', 'Rust', 'Javascript', 'WASM'
     */
    constructor(name, library, environment, language) {
        this.name = name;
        this.library = library;
        this.environment = environment;
        this.language = language;
        this.lib = null;
    }

    /**
     * Dynamically imports the library.
     * Must be implemented by subclasses to set this.lib.
     */
    async load() {
        throw new Error(`${this.name} must implement load()`);
    }

    /**
     * Standardized compression method.
     * @param {Uint8Array|Buffer} input - The raw data to compress.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer (for zero-alloc).
     * @returns {Uint8Array|Buffer} - The compressed data.
     */
    compress(input, outputBuffer) {
        throw new Error(`${this.name} must implement compress()`);
    }

    /**
     * Standardized decompression method.
     * @param {Uint8Array|Buffer} compressedInput - The compressed data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * @returns {Uint8Array|Buffer} - The decompressed data.
     */
    decompress(compressedInput, outputBuffer) {
        throw new Error(`${this.name} must implement decompress()`);
    }
}