import { LZ4 } from '../../src/lz4.js';
import lz4Napi from 'lz4-napi';
import lz4js from 'lz4js';
import { generateData, measure, printResults, printSystemInfo } from './bench-utils.js';

printSystemInfo();
console.log("\n--- LZ4 Libraries: Compression Benchmark ---");

// const SIZES = [1, 5, 25]; // MB
const SIZES = [1, 4, 8, 16, 32, 64]; // MB
// Warmup V8 JIT
console.log("Warmup...");
const warmupData = Buffer.from(generateData(0.1));
LZ4.compress(warmupData, null, 4194304, true, false);

for (const size of SIZES) {
    console.log(`\n[...] Generating ${size}MB Dataset...`);
    const input = Buffer.from(generateData(size));
    const results = [];

    // 1. Divortio LZ4 (Local)
    results.push(measure('divortio-lz4 (Pure JS)', () => {
        return LZ4.compress(input, null, 4194304, true, false);
    }, input.byteLength));

    // 2. lz4-napi
    try {
        results.push(measure('lz4-napi (C++)', () => {
            return lz4Napi.compressSync(input);
        }, input.byteLength));
    } catch (e) {}

    // 3. lz4js
    results.push(measure('lz4js (Pure JS)', () => {
        return lz4js.compress(input);
    }, input.byteLength));

    // Just call this! It prints table + matrix + summary.
    printResults(`Compression Results (${size} MB Input)`, results);
}