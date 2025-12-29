import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LZ4 } from '../../src/lz4.js';

/**
 * ============================================================================
 * LZ4 Node.js File System Example
 * ============================================================================
 * Demonstrates piping file streams through the LZ4 encoder/decoder.
 * Flow:
 * 1. Create a dummy text file (input).
 * 2. Pipe input -> LZ4 Encoder -> output.lz4
 * 3. Pipe output.lz4 -> LZ4 Decoder -> output.txt
 * ============================================================================
 */

// Setup file paths (ESM friendly __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, 'fs-example-input.txt');
const COMPRESSED_FILE = path.join(__dirname, 'fs-example.lz4');
const DECOMPRESSED_FILE = path.join(__dirname, 'fs-example-restored.txt');

async function run() {
    // 1. GENERATE DUMMY DATA
    console.log('1. Generating dummy input file...');
    const dummyContent = 'Hello World! '.repeat(1000); // ~13KB of text
    fs.writeFileSync(INPUT_FILE, dummyContent, 'utf8');
    console.log(`   Input file created: ${INPUT_FILE} (${dummyContent.length} bytes)`);

    // 2. COMPRESS (Read -> Compress -> Write)
    console.log('\n2. Compressing file...');

    // Note: Node.js 18+ 'stream/web' allows piping Web Streams (LZ4) with Node Streams (fs)
    // via Readable.toWeb / Readable.fromWeb or direct piping in newer versions.
    // For max compatibility, we use the standard pipeline utility if available,
    // or just rely on the fact that TransformStreams are async iterables.

    const readStreamRaw = fs.createReadStream(INPUT_FILE);
    const writeStreamComp = fs.createWriteStream(COMPRESSED_FILE);

    // Create the TransformStream
    const compressor = LZ4.compressStream();

    // Pipe: Node Read -> Web Transform -> Node Write
    // We can use the 'stream' module's pipeline, or manually pipe.
    // Since LZ4.compressStream() returns a Web TransformStream, we need to bridge it.
    // The easiest way in modern Node is `stream.compose` or `pipeline`.

    // bridge strategy: async iteration
    const webWritable = compressor.writable.getWriter();
    const webReadable = compressor.readable.getReader();

    // Start the writing process (Node -> Web)
    const writeProcess = (async () => {
        for await (const chunk of readStreamRaw) {
            await webWritable.write(new Uint8Array(chunk));
        }
        await webWritable.close();
    })();

    // Start the reading process (Web -> Node)
    const readProcess = (async () => {
        while (true) {
            const { done, value } = await webReadable.read();
            if (done) break;
            writeStreamComp.write(value);
        }
        writeStreamComp.end();
    })();

    await Promise.all([writeProcess, readProcess]);

    const stats = fs.statSync(COMPRESSED_FILE);
    console.log(`   Compression complete: ${COMPRESSED_FILE}`);
    console.log(`   Size: ${stats.size} bytes (Compressed from ${dummyContent.length})`);

    // 3. DECOMPRESS (Read -> Decompress -> Write)
    console.log('\n3. Decompressing file...');
    const readStreamComp = fs.createReadStream(COMPRESSED_FILE);
    const writeStreamDec = fs.createWriteStream(DECOMPRESSED_FILE);

    const decompressor = LZ4.decompressStream();

    const decWritable = decompressor.writable.getWriter();
    const decReadable = decompressor.readable.getReader();

    // Node -> Web
    const writeDecProcess = (async () => {
        for await (const chunk of readStreamComp) {
            await decWritable.write(new Uint8Array(chunk));
        }
        await decWritable.close();
    })();

    // Web -> Node
    const readDecProcess = (async () => {
        while (true) {
            const { done, value } = await decReadable.read();
            if (done) break;
            writeStreamDec.write(value);
        }
        writeStreamDec.end();
    })();

    await Promise.all([writeDecProcess, readDecProcess]);

    console.log(`   Decompression complete: ${DECOMPRESSED_FILE}`);

    // Verify content
    const restoredContent = fs.readFileSync(DECOMPRESSED_FILE, 'utf8');
    if (restoredContent === dummyContent) {
        console.log('\n✅ SUCCESS: Restored content matches original!');
    } else {
        console.error('\n❌ FAILURE: Content mismatch.');
    }

    // Cleanup
    [INPUT_FILE, COMPRESSED_FILE, DECOMPRESSED_FILE].forEach(f => fs.unlinkSync(f));
}

run().catch(console.error);