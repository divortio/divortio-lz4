import { LZ4 } from '../../src/lz4.js';

console.log("--- LZ4 Raw Block API (Low Level) Example ---");
console.log("Warning: This API does not write headers. You must track output size yourself.");

// 1. Prepare Data
const input = new TextEncoder().encode("Raw Block Compression is fast! ".repeat(50));
const maxOutputSize = input.length + (input.length / 255 | 0) + 16; // Worst case sizing

// 2. Allocate Memory Manually
// The Raw API does not allocate for you. You must provide the buffers.
const outputBuffer = new Uint8Array(maxOutputSize);
const hashTable = new Int32Array(16384); // 16KB Hash Table (Reusable!)

// 3. Compress (No Allocation)
// Sig: compressRaw(input, output, srcStart, srcLen, hashTable)
const bytesWritten = LZ4.compressRaw(input, outputBuffer, 0, input.length, hashTable);

// Create a view of just the valid data
const compressedBlock = outputBuffer.subarray(0, bytesWritten);

console.log(`\nInput Size: ${input.length}`);
console.log(`Compressed Block Size: ${bytesWritten}`);

// 4. Decompress
// Raw decompression requires the EXACT output buffer size to be known/allocated.
const restoreBuffer = new Uint8Array(input.length);

// Sig: decompressRaw(input, output)
const bytesRead = LZ4.decompressRaw(compressedBlock, restoreBuffer);

console.log(`\nDecompressed Bytes: ${bytesRead}`);
const text = new TextDecoder().decode(restoreBuffer);
console.log(`Success: ${text === new TextDecoder().decode(input)}`);