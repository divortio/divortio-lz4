import { LZ4 } from '../../src/lz4.js';

console.log("--- LZ4 Buffer (String) Example ---");

// 1. Define String
const myString = "The quick brown fox jumps over the lazy dog. ".repeat(50);
console.log(`Input String Length: ${myString.length}`);

// 2. Compress String directly
// Automatically handles UTF-8 encoding
const compressed = LZ4.compressString(myString);
console.log(`Compressed Output: ${compressed.length} bytes`);

// 3. Decompress String directly
// Automatically handles UTF-8 decoding
const restoredString = LZ4.decompressString(compressed);

// 4. Verify
console.log(`Restored Match: ${myString === restoredString}`);
console.log(`Sample: "${restoredString.substring(0, 40)}..."`);