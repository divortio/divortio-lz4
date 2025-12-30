import { generateData, measure } from './bench-utils.js';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// CLI Arguments: node bench-worker.js <libName> <sizeMB> <mode>
const [,, libName, sizeStr, mode] = process.argv;
const sizeMB = parseFloat(sizeStr);
const isDecompress = mode === 'decompress';

if (!libName || !sizeMB || !mode) {
    console.error("Usage: node bench-worker.js <libName> <sizeMB> <compress|decompress>");
    process.exit(1);
}

// 1. Generate Input Data
const rawData = Buffer.from(generateData(sizeMB));

async function runBenchmark() {
    let runFn;
    let setupData = rawData;

    // Dynamic Import & Setup
    switch (libName) {
        case 'divortio': {
            const { LZ4 } = await import('../../src/lz4.js');
            const { decompressBuffer } = await import('../../src/buffer/bufferDecompress.js');

            if (isDecompress) {
                setupData = LZ4.compress(rawData, null, 4194304, true, false);
                decompressBuffer(setupData); // Warmup
                runFn = () => decompressBuffer(setupData);
            } else {
                LZ4.compress(rawData, null, 4194304, true, false); // Warmup
                runFn = () => LZ4.compress(rawData, null, 4194304, true, false);
            }
            break;
        }
        case 'lz4-napi': {
            const lz4Napi = (await import('lz4-napi')).default;
            if (isDecompress) {
                setupData = lz4Napi.compressSync(rawData);
                lz4Napi.uncompressSync(setupData);
                runFn = () => lz4Napi.uncompressSync(setupData);
            } else {
                lz4Napi.compressSync(rawData);
                runFn = () => lz4Napi.compressSync(rawData);
            }
            break;
        }
        case 'lz4-wasm': {
            // "lz4-wasm-nodejs" (Optimized for Node)
            const { compress, decompress } = await import('lz4-wasm-nodejs');
            if (isDecompress) {
                setupData = compress(rawData);
                decompress(setupData);
                runFn = () => decompress(setupData);
            } else {
                compress(rawData);
                runFn = () => compress(rawData);
            }
            break;
        }
        case 'lz4-wasm-web': {
            // "lz4-wasm" (Generic/Web Package)
            // FIX: Node ignores 'module' field, so we must link to the specific JS file.
            // Usually 'lz4_wasm.js' (snake_case) for Rust crates.
            let mod;
            try {
                mod = await import('lz4-wasm/lz4_wasm.js');
            } catch (e) {
                // Fallback: try kebab-case just in case
                try {
                    mod = await import('lz4-wasm/lz4-wasm.js');
                } catch (e2) {
                    throw new Error("Could not locate 'lz4_wasm.js' or 'lz4-wasm.js' in lz4-wasm package.");
                }
            }

            // 1. Initialize
            if (typeof mod.default === 'function') {
                try {
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
                        console.error("Critical: Failed to load lz4-wasm-web binary.");
                        throw resolveErr;
                    }
                }
            }

            // 2. Select JS Wrappers
            const compress = mod.compress;
            const decompress = mod.decompress;

            if (!compress || !decompress) throw new Error("Could not find lz4-wasm JS wrappers");

            if (isDecompress) {
                setupData = compress(rawData);
                decompress(setupData);
                runFn = () => decompress(setupData);
            } else {
                compress(rawData);
                runFn = () => compress(rawData);
            }
            break;
        }
        case 'lz4-browser': {
            const mod = await import('lz4-browser');
            // Named exports 'encode' and 'decode'
            const encode = mod.encode;
            const decode = mod.decode;

            if (!encode || !decode) throw new Error("Could not find lz4-browser encode/decode methods");

            if (isDecompress) {
                setupData = encode(rawData);
                decode(setupData);
                runFn = () => decode(setupData);
            } else {
                encode(rawData);
                runFn = () => encode(rawData);
            }
            break;
        }
        case 'lz4js': {
            const lz4js = (await import('lz4js')).default;
            if (isDecompress) {
                setupData = lz4js.compress(rawData);
                lz4js.decompress(setupData);
                runFn = () => lz4js.decompress(setupData);
            } else {
                lz4js.compress(rawData);
                runFn = () => lz4js.compress(rawData);
            }
            break;
        }
        case 'snappy': {
            const snappy = (await import('snappy')).default;
            if (isDecompress) {
                setupData = snappy.compressSync(rawData);
                snappy.uncompressSync(setupData);
                runFn = () => snappy.uncompressSync(setupData);
            } else {
                snappy.compressSync(rawData);
                runFn = () => snappy.compressSync(rawData);
            }
            break;
        }
        case 'snappyjs': {
            const SnappyJS = (await import('snappyjs')).default;
            const ab = rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength);

            if (isDecompress) {
                const compressedAb = SnappyJS.compress(ab);
                SnappyJS.uncompress(compressedAb);
                runFn = () => SnappyJS.uncompress(compressedAb);
            } else {
                SnappyJS.compress(ab);
                runFn = () => SnappyJS.compress(ab);
            }
            break;
        }
        default:
            throw new Error(`Unknown library: ${libName}`);
    }

    if (global.gc) global.gc();

    const result = measure(getDisplayName(libName), runFn, rawData.byteLength);
    console.log(JSON.stringify(result));
}

function getDisplayName(key) {
    const map = {
        'divortio': 'Divortio LZ4',
        'lz4-napi': 'lz4-napi (C++)',
        'lz4-wasm': 'lz4-wasm (Node)',
        'lz4-wasm-web': 'lz4-wasm (Web)',
        'lz4-browser': 'lz4-browser',
        'lz4js': 'lz4js (Legacy)',
        'snappy': 'snappy (C++)',
        'snappyjs': 'snappyjs (Pure JS)'
    };
    return map[key] || key;
}

runBenchmark().catch(err => {
    // Force error output to stderr
    console.error(err);
    process.exit(1);
});