import { LZ4 } from '../../src/lz4.js';

console.log("--- LZ4 Dictionary Compression Example ---");

// 1. Create the Dictionary (The "Shared Knowledge")
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

console.log(`Input Size: ${input.length} bytes`);

// 3. Compare: Standard vs. Dictionary
const standard = LZ4.compress(input);
// Sig: compress(input, dictionary)
const optimized = LZ4.compress(input, dictionary);

console.log(`\nStandard Compressed:   ${standard.length} bytes`);
console.log(`Dictionary Compressed: ${optimized.length} bytes`);

const improvement = ((1 - optimized.length / standard.length) * 100).toFixed(1);
console.log(`>> Improvement: ${improvement}% smaller with dictionary!`);

// 4. Verify
const restored = LZ4.decompress(optimized, dictionary);
console.log(`Match: ${new TextDecoder().decode(restored) === record}`);