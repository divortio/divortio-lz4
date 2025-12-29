import { LZ4 } from '../../src/lz4.js';
import lz4Napi from 'lz4-napi';
import lz4js from 'lz4js';
import { generateData, measure, printResults, printSystemInfo } from './bench-utils.js';

printSystemInfo();
console.log("\n--- LZ4 Libraries: Round-Trip Benchmark ---");

const SIZES = [1, 5, 25]; // MB

for (const size of SIZES) {
    console.log(`\n[...] Generating ${size}MB Dataset...`);
    const input = Buffer.from(generateData(size));
    const results = [];

    // 1. Divortio LZ4
    results.push(measure('Divortio LZ4', () => {
        const c = LZ4.compress(input);
        return LZ4.decompress(c);
    }, input.byteLength));

    // 2. lz4-napi
    results.push(measure('lz4-napi (C++)', () => {
        const c = lz4Napi.compressSync(input);
        return lz4Napi.uncompressSync(c);
    }, input.byteLength));

    // 3. lz4js
    results.push(measure('lz4js (Pure JS)', () => {
        const c = lz4js.compress(input);
        return lz4js.decompress(c);
    }, input.byteLength));

    printResults(`Round-Trip Results (${size} MB Input)`, results);
}