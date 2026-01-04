import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BaseLib } from '../shared/baseLib.js';

/**
 * @class V8WASMLz4WasmWeb
 * @extends {BaseLib}
 * @description A Node.js-compatible wrapper for the generic `lz4-wasm` web package.
 *
 * This class encapsulates the complex loading logic required to make the
 * web-targeted `lz4-wasm` crate work inside a Node.js environment.
 * It handles:
 * 1. Resolving the correct JS entry point (snake_case vs kebab-case).
 * 2. Manually locating and loading the .wasm binary from the file system.
 * 3. Initializing the WASM instance with the binary buffer.
 */
class V8WASMLz4WasmWeb extends BaseLib {
    constructor() {
        // name: 'lz4-wasm-web' - Semantic name for reports
        // library: 'lz4-wasm' - NPM package name
        // environment: 'Web/Node' - Web WASM package adapted for Node
        // language: 'WASM'
        super('lz4-wasm-web', 'lz4-wasm', 'V8', 'WASM');

        /** @type {Function|null} The internal compress function from the WASM module */
        this.compressFn = null;
        /** @type {Function|null} The internal decompress function from the WASM module */
        this.decompressFn = null;
        /** @type {boolean} wrapper to track initialization status */
        this.isLoaded = false;
    }

    /**
     * Loads the lz4-wasm library using the Node.js-specific workaround strategy.
     * * This mimics the logic originally found in benchWorker.js:
     * - Attempts to import `lz4_wasm.js` (ignoring package.json 'module' field issues).
     * - If the default export is an init function, it attempts to run it.
     * - If running init fails (common in Node), it manually reads `lz4_wasm_bg.wasm`
     * from disk and passes the buffer to the init function.
     *
     * @async
     * @override
     * @returns {Promise<void>}
     * @throws {Error} If the module or the WASM binary cannot be found/loaded.
     */
    async load() {
        if (this.isLoaded) return;

        let mod;
        // 1. Try to import the specific JS file (Node often ignores 'module' field in pkg.json)
        try {
            mod = await import('lz4-wasm/lz4_wasm.js');
        } catch (e) {
            // Fallback: try kebab-case just in case the package structure differs
            try {
                mod = await import('lz4-wasm/lz4-wasm.js');
            } catch (e2) {
                throw new Error("Could not locate 'lz4_wasm.js' or 'lz4-wasm.js' in lz4-wasm package.");
            }
        }

        // 2. Initialize the WASM module
        if (typeof mod.default === 'function') {
            try {
                // Attempt standard init
                await mod.default();
            } catch (e) {
                // Fallback: Manually locate and load lz4_wasm_bg.wasm
                try {
                    // Use the module's URL to resolve the relative .wasm file
                    // lz4-wasm usually puts lz4_wasm_bg.wasm next to the JS file
                    const jsPath = import.meta.resolve('lz4-wasm/lz4_wasm.js');
                    const wasmUrl = new URL('lz4_wasm_bg.wasm', jsPath);
                    const wasmPath = fileURLToPath(wasmUrl);

                    if (!fs.existsSync(wasmPath)) {
                        throw new Error(`WASM binary not found at: ${wasmPath}`);
                    }

                    const wasmBuffer = fs.readFileSync(wasmPath);
                    await mod.default(wasmBuffer);
                } catch (resolveErr) {
                    console.error("Critical: Failed to load lz4-wasm-web binary using manual fs read.");
                    throw resolveErr;
                }
            }
        }

        // 3. Bind the wrapper functions
        this.compressFn = mod.compress;
        this.decompressFn = mod.decompress;

        if (!this.compressFn || !this.decompressFn) {
            throw new Error("Could not find 'compress' or 'decompress' exports in lz4-wasm module.");
        }

        this.isLoaded = true;
    }

    /**
     * Compresses the input data using the loaded WASM function.
     *
     * @override
     * @param {Uint8Array|Buffer} input - The data to compress.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: lz4-wasm allocates a new buffer, so this is unused.
     * @returns {Uint8Array} The compressed data.
     * @throws {Error} If the library is not loaded.
     */
    compress(input, outputBuffer) {
        if (!this.isLoaded) throw new Error("Library not loaded. Call load() first.");
        return this.compressFn(input);
    }

    /**
     * Decompresses the input data using the loaded WASM function.
     *
     * @override
     * @param {Uint8Array|Buffer} input - The compressed data.
     * @param {Uint8Array} [outputBuffer] - Optional shared output buffer.
     * Note: lz4-wasm allocates a new buffer, so this is unused.
     * @returns {Uint8Array} The decompressed data.
     * @throws {Error} If the library is not loaded.
     */
    decompress(input, outputBuffer) {
        if (!this.isLoaded) throw new Error("Library not loaded. Call load() first.");
        return this.decompressFn(input);
    }
}

export default V8WASMLz4WasmWeb;