import { LZ4 } from '../../src/lz4.js';
import zlib from 'zlib';
import { generateData, measure, printResults, printSystemInfo } from './bench-utils.js';

printSystemInfo(); // <--- NEW
console.log("\n--- Round-Trip Benchmark ---");

const SIZES = [5, 10]; // MB

for (const size of SIZES) {
    console.log(`\n[...] Generating ${size}MB Dataset...`);
    const input = generateData(size);
    const results = [];

    results.push(measure('LZ4 (JS)', () => LZ4.decompress(LZ4.compress(input)), input.byteLength));

    results.push(measure('Gzip (C++)', () => zlib.gunzipSync(zlib.gzipSync(input)), input.byteLength));

    printResults(`Round-Trip Results (${size} MB Input)`, results);
}