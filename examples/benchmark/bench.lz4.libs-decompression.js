import { LZ4 } from '../../src/lz4.js';
import lz4Napi from 'lz4-napi';
import lz4js from 'lz4js';
import { generateData, measure, printResults, printSystemInfo } from './bench-utils.js';

printSystemInfo();
console.log("\n--- LZ4 Libraries: Decompression Benchmark ---");

const SIZES = [1, 5, 25]; // MB

for (const size of SIZES) {
    console.log(`\n[...] Preparing ${size}MB Dataset...`);
    const input = Buffer.from(generateData(size));

    // Pre-compress using each engine to ensure valid frame formats for that engine
    const compDivortio = LZ4.compress(input);
    const compNapi = lz4Napi.compressSync(input);
    const compLz4js = lz4js.compress(input);

    const results = [];

    // 1. Divortio LZ4
    results.push(measure('Divortio LZ4', () => LZ4.decompress(compDivortio), input.byteLength));

    // 2. lz4-napi
    results.push(measure('lz4-napi (C++)', () => lz4Napi.uncompressSync(compNapi), input.byteLength));

    // 3. lz4js
    results.push(measure('lz4js (Pure JS)', () => lz4js.decompress(compLz4js), input.byteLength));

    printResults(`Decompression Results (${size} MB Input)`, results);
}