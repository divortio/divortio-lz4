import { LZ4 } from '../../src/lz4.js';
import lz4Napi from 'lz4-napi';
import lz4js from 'lz4js';
import { generateData, measure, printResults, printSystemInfo } from './bench-utils.js';

printSystemInfo();
console.log("\n--- LZ4 Libraries: Compression Benchmark ---");

const SIZES = [1, 5, 25]; // MB

for (const size of SIZES) {
    console.log(`\n[...] Generating ${size}MB Dataset...`);
    // Ensure Buffer for C++ bindings compatibility
    const input = Buffer.from(generateData(size));
    const results = [];

    // 1. Divortio LZ4 (Local)
    results.push(measure('Divortio LZ4', () => LZ4.compress(input), input.byteLength));

    // 2. lz4-napi (Native C++/Rust Binding)
    results.push(measure('lz4-napi (C++)', () => lz4Napi.compressSync(input), input.byteLength));

    // 3. lz4js (Pure JS Reference)
    results.push(measure('lz4js (Pure JS)', () => lz4js.compress(input), input.byteLength));

    printResults(`Compression Results (${size} MB Input)`, results);
}