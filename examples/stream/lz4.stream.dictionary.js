import { LZ4 } from '../../src/lz4.js';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

console.log("--- LZ4 Streaming Dictionary Example ---");

// This example simulates a log stream where every line shares a common prefix.
// We pass a dictionary to the stream compressor to optimize the entire stream.

const DICT_STR = "[INFO] [Service-A] Timestamp:";
const dictionary = new TextEncoder().encode(DICT_STR);

// Generator: Creates chunks that start with the dictionary string
async function* logGenerator() {
    for (let i = 0; i < 5; i++) {
        const msg = `${DICT_STR} ${Date.now()} - Event ID ${i}\n`;
        yield new TextEncoder().encode(msg);
    }
}

async function run() {
    const chunks = [];

    // 1. Compress Stream WITH Dictionary
    // Sig: compressStream(dictionary, maxBlockSize, blockIndep, checksum)
    const compressor = LZ4.compressStream(dictionary);

    console.log("Compressing stream with dictionary...");

    await pipeline(
        Readable.from(logGenerator()),
        compressor,
        async function(source) {
            for await (const chunk of source) {
                chunks.push(chunk);
            }
        }
    );

    // Combine chunks to simulate a file/network payload
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const compressedData = new Uint8Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
        compressedData.set(c, offset);
        offset += c.length;
    }
    console.log(`Total Compressed Size: ${totalLength} bytes`);

    // 2. Decompress Stream WITH Dictionary
    // We must feed the same dictionary to the decompressor
    const decompressor = LZ4.decompressStream(dictionary);

    // Create a stream from our compressed buffer
    const inputStream = new ReadableStream({
        start(c) {
            c.enqueue(compressedData);
            c.close();
        }
    });

    // Read back
    const reader = inputStream.pipeThrough(decompressor).getReader();
    let decompressedText = "";
    const decoder = new TextDecoder();

    while(true) {
        const { done, value } = await reader.read();
        if (done) break;
        decompressedText += decoder.decode(value, { stream: true });
    }

    console.log("\n--- Decompressed Output ---");
    console.log(decompressedText.trim());
}

run().catch(console.error);