import { LZ4 } from '../../src/lz4.js';

console.log("--- LZ4 Dictionary Compression Example ---");

// Scenario: We are compressing many small JSON records that share the same schema.
// Without a dictionary, each record repeats the keys ("id", "timestamp", "action").
// With a dictionary, these keys are compressed to near-zero bytes.

// 1. Create the Dictionary (The "Shared Knowledge")
// This string contains the common patterns we expect in the data.
const dictString = '{"id":,"timestamp":,"action":"user_login","metadata":{}}';
const dictionary = new TextEncoder().encode(dictString);

console.log(`Dictionary Size: ${dictionary.length} bytes`);

// 2. Create Data mimicking the dictionary structure
const record = JSON.stringify({
    id: 101,
    timestamp: Date.now(),
    action: "user_login",
    metadata: { source: "web", ip: "127.0.0.1" }
});
const input = new TextEncoder().encode(record);

console.log(`\nInput Data: ${record}`);
console.log(`Input Size: ${input.length} bytes`);

// 3. Compare: Standard vs. Dictionary Compression

// A. Standard (No Context)
const standardCompressed = LZ4.compress(input);

// B. Dictionary Mode
// Sig: compress(input, dictionary)
const dictCompressed = LZ4.compress(input, dictionary);

console.log(`\nStandard Compressed:   ${standardCompressed.length} bytes`);
console.log(`Dictionary Compressed: ${dictCompressed.length} bytes`);

const improvement = ((1 - dictCompressed.length / standardCompressed.length) * 100).toFixed(1);
console.log(`>> Improvement: ${improvement}% smaller with dictionary!`);

// 4. Decompression
console.log("\n--- Verification ---");

try {
    // Attempting to decompress WITHOUT the dictionary should fail (or produce garbage)
    // if the compression relied heavily on back-references to the dict.
    const badRestore = LZ4.decompress(dictCompressed, null);
    console.log("Warning: Decompressed without dict (Result might be corrupted or valid depending on overlap)");
} catch (e) {
    console.log("✅ Correctly failed to decompress without dictionary:", e.message);
}

// Correct Decompression
const restored = LZ4.decompress(dictCompressed, dictionary);
const restoredText = new TextDecoder().decode(restored);

console.log(`Restored with Dict: "${restoredText}"`);
console.log(`Match: ${restoredText === record}`);