import { LZ4 } from '../../src/lz4.js';
import * as fs from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

// NOTE: fs.openAsBlob requires Node.js v19.8.0 or higher.
const IS_NODE_MODERN = typeof fs.openAsBlob === 'function';

console.log("--- LZ4 Node.js Blob/File Stream Example ---");

async function runNodeFileExample() {
    if (!IS_NODE_MODERN) {
        console.error("❌ Skipped: This example requires Node.js 19.8+ for fs.openAsBlob()");
        return;
    }

    const inputFile = 'blob_input.txt';
    const compressedFile = 'blob_output.lz4';

    // 1. Setup: Create a dummy file on disk
    fs.writeFileSync(inputFile, "Modern Node.js File Object Streaming... \n".repeat(10000));
    console.log(`Created source file: ${inputFile}`);

    // 2. The "File Object" Step
    // fs.openAsBlob creates a snapshot 'Blob' backed by the file on disk.
    // This is the closest Node.js equivalent to the Browser's <input type="file"> object.
    const sourceBlob = await fs.openAsBlob(inputFile);
    console.log(`Opened Blob: size=${sourceBlob.size} bytes, type=${sourceBlob.type}`);

    // 3. The Stream Pipeline
    // We take the Web Stream from the Blob, run it through our Compressor,
    // and pipe it to a standard Node.js file write stream.
    console.log("Starting streaming compression...");

    await pipeline(
        // sourceBlob.stream() returns a Web ReadableStream
        Readable.fromWeb(sourceBlob.stream()),

        // Our library's Web TransformStream
        // Note: Node.js pipeline handles Web Transforms natively in recent versions,
        // but explicit conversion via Readable.fromWeb / or internal handling is common.
        // Since LZ4.compressStream() is a standard Web TransformStream,
        // we can pass it directly if using Node 20+, or adapt it.
        // For maximum compatibility in this script, we rely on Node's internal stream adapter.
        LZ4.compressStream(),

        // Destination: Standard Node.js WriteStream
        fs.createWriteStream(compressedFile)
    );

    // 4. Verify
    const originalSize = fs.statSync(inputFile).size;
    const compressedSize = fs.statSync(compressedFile).size;

    console.log(`✅ Compression Complete!`);
    console.log(`Original: ${originalSize} bytes`);
    console.log(`Compressed: ${compressedSize} bytes`);
    console.log(`Ratio: ${(compressedSize / originalSize * 100).toFixed(2)}%`);

    // Cleanup
    fs.unlinkSync(inputFile);
    fs.unlinkSync(compressedFile);
}

runNodeFileExample().catch(console.error);