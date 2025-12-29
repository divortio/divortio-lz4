import { LZ4 } from '../../src/lz4.js';
import zlib from 'zlib';
import { generateData, measure, printResults, printSystemInfo } from './bench-utils.js';

printSystemInfo(); // <--- NEW
console.log("\n--- Compression Benchmark ---");

const SIZES = [1, 5, 25]; // MB

for (const size of SIZES) {
    console.log(`\n[...] Generating ${size}MB Dataset...`);
    const input = generateData(size);
    const results = [];

    results.push(measure('LZ4 (JS)', () => LZ4.compress(input), input.byteLength));
    results.push(measure('Gzip (C++)', () => zlib.gzipSync(input), input.byteLength));
    results.push(measure('Deflate (C++)', () => zlib.deflateSync(input), input.byteLength));

    printResults(`Compression Results (${size} MB Input)`, results);
}