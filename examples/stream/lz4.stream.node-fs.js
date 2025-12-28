const fs = require('fs');
const path = require('path');
const lz4 = require('../../src/lz4.js');

/**
 * ============================================================================
 * LZ4 Node.js File System Example
 * ============================================================================
 * Demonstrates piping file streams through the LZ4 encoder/decoder.
 * * Flow:
 * 1. Create a dummy text file (input).
 * 2. Pipe input -> LZ4 Encoder -> output.lz4
 * 3. Pipe output.lz4 -> LZ4 Decoder -> output.txt
 * ============================================================================
 */

// Setup file paths
const INPUT_FILE = path.join(__dirname, 'fs-example-input.txt');
const COMPRESSED_FILE = path.join(__dirname, 'fs-example.lz4');
const DECOMPRESSED_FILE = path.join(__dirname, 'fs-example-restored.txt');

// 1. GENERATE DUMMY DATA
console.log('1. Generating dummy input file...');
const dummyContent = 'Hello World! '.repeat(1000); // ~13KB of text
fs.writeFileSync(INPUT_FILE, dummyContent, 'utf8');
console.log(`   Input file created: ${INPUT_FILE} (${dummyContent.length} bytes)`);


// 2. COMPRESS (Read -> Compress -> Write)
console.log('\n2. Compressing file...');
const readStreamRaw = fs.createReadStream(INPUT_FILE);
const writeStreamComp = fs.createWriteStream(COMPRESSED_FILE);
const encoder = lz4.createEncoderStream();

readStreamRaw
    .pipe(encoder)
    .pipe(writeStreamComp)
    .on('finish', () => {
        const stats = fs.statSync(COMPRESSED_FILE);
        console.log(`   Compression complete: ${COMPRESSED_FILE}`);
        console.log(`   Size: ${stats.size} bytes (Compressed from ${dummyContent.length})`);

        // Start Decompression only after Compression finishes
        runDecompression();
    });

// 3. DECOMPRESS (Read -> Decompress -> Write)
function runDecompression() {
    console.log('\n3. Decompressing file...');
    const readStreamComp = fs.createReadStream(COMPRESSED_FILE);
    const writeStreamDec = fs.createWriteStream(DECOMPRESSED_FILE);
    const decoder = lz4.createDecoderStream();

    readStreamComp
        .pipe(decoder)
        .pipe(writeStreamDec)
        .on('finish', () => {
            console.log(`   Decompression complete: ${DECOMPRESSED_FILE}`);

            // Verify content
            const restoredContent = fs.readFileSync(DECOMPRESSED_FILE, 'utf8');
            if (restoredContent === dummyContent) {
                console.log('\n✅ SUCCESS: Restored content matches original!');
            } else {
                console.error('\n❌ FAILURE: Content mismatch.');
            }
        });
}