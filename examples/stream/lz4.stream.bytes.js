import { LZ4 } from '../../src/lz4.js';
import * as fs from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

console.log("--- LZ4 Stream Example ---");

async function runStreamExample() {
    const inputFile = 'example_input.txt';
    const compressedFile = 'example_output.lz4';
    const restoredFile = 'example_restored.txt';

    // 1. Create a dummy large file (approx 1MB)
    const largeData = "Stream line data... \n".repeat(50000);
    fs.writeFileSync(inputFile, largeData);
    console.log(`Created ${inputFile} (${fs.statSync(inputFile).size} bytes)`);

    // 2. Stream Compression: File -> LZ4 -> File
    console.log("Compressing stream...");
    await pipeline(
        fs.createReadStream(inputFile),
        LZ4.compressStream(), // Creates a TransformStream
        fs.createWriteStream(compressedFile)
    );
    console.log(`Compressed to ${compressedFile} (${fs.statSync(compressedFile).size} bytes)`);

    // 3. Stream Decompression: File -> LZ4 -> File
    console.log("Decompressing stream...");
    await pipeline(
        fs.createReadStream(compressedFile),
        LZ4.decompressStream(),
        fs.createWriteStream(restoredFile)
    );

    // 4. Verify
    const originalStat = fs.statSync(inputFile);
    const restoredStat = fs.statSync(restoredFile);
    console.log(`Restored ${restoredFile} (${restoredStat.size} bytes)`);

    if (originalStat.size === restoredStat.size) {
        console.log("✅ Stream Round-trip Successful!");
    } else {
        console.error("❌ Size Mismatch");
    }

    // Cleanup
    [inputFile, compressedFile, restoredFile].forEach(f => fs.unlinkSync(f));
}

runStreamExample().catch(console.error);