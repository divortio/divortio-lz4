import { LZ4 } from '../../src/lz4.js';

console.log("--- LZ4 Buffer (Bytes) Example ---");

// 1. Prepare Data
const text = "Hello World! ".repeat(100);
const input = new TextEncoder().encode(text);

console.log(`Original Size: ${input.length} bytes`);

// 2. Compress (Sync)
const compressed = LZ4.compress(input);
console.log(`Compressed Size: ${compressed.length} bytes`);
console.log(`Ratio: ${(compressed.length / input.length * 100).toFixed(2)}%`);

// 3. Decompress (Sync)
const decompressed = LZ4.decompress(compressed);

// 4. Verify
const decodedText = new TextDecoder().decode(decompressed);
const isMatch = decodedText === text;

console.log(`Success: ${isMatch}`);
if (!isMatch) console.error("Data mismatch!");