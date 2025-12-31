import { LZ4 } from '../src/lz4.js';
import lz4Napi from 'lz4-napi';
import lz4js from 'lz4js';
import { generateData, measure, printResults, printSystemInfo } from './bench-utils.js';

printSystemInfo();
console.log("\n--- LZ4 Libraries: Decompression Benchmark ---");

const SIZES = [1, 5, 25]; // MB

// Warmup
console.log("Warmup...");
const warmupData = Buffer.from(generateData(0.1));
const warmupComp = LZ4.compress(warmupData, null, 4194304, true, false);
LZ4.decompress(warmupComp);

for (const size of SIZES) {
    console.log(`\n[...] Preparing ${size}MB Dataset...`);
    const input = Buffer.from(generateData(size));

    // Use 4MB blocks for Divortio to ensure fair decompression workload comparison
    const compDivortio = LZ4.compress(input, null, 4194304, true, false);

    let compNapi = null;
    try { compNapi = lz4Napi.compressSync(input); } catch (e) {}

    const compLz4js = lz4js.compress(input);

    const results = [];

    // 1. Divortio LZ4
    results.push(measure('Divortio LZ4', () => {
        return LZ4.decompress(compDivortio);
    }, input.byteLength));

    // 2. lz4-napi
    if (compNapi) {
        results.push(measure('lz4-napi (C++)', () => {
            return lz4Napi.uncompressSync(compNapi);
        }, input.byteLength));
    }

    // 3. lz4js
    results.push(measure('lz4js (Pure JS)', () => {
        return lz4js.decompress(compLz4js);
    }, input.byteLength));

    printResults(`Decompression Results (${size} MB Input)`, results);


}