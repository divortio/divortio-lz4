import { LZ4 } from '../../src/lz4.js';
import zlib from 'zlib';
import { generateData, measure, printResults, printSystemInfo } from './bench-utils.js';

printSystemInfo(); // <--- NEW
console.log("\n--- Decompression Benchmark ---");

const SIZES = [1, 5, 25]; // MB

for (const size of SIZES) {
    console.log(`\n[...] Preparing ${size}MB Dataset...`);
    const input = generateData(size);

    const lz4Comp = LZ4.compress(input);
    const gzipComp = zlib.gzipSync(input);
    const deflateComp = zlib.deflateSync(input);

    const results = [];

    results.push(measure('LZ4 (JS)', () => LZ4.decompress(lz4Comp), input.byteLength));
    results.push(measure('Gzip (C++)', () => zlib.gunzipSync(gzipComp), input.byteLength));
    results.push(measure('Deflate (C++)', () => zlib.inflateSync(deflateComp), input.byteLength));

    printResults(`Decompression Results (${size} MB Input)`, results);
}