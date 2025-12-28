import { LZ4 } from '../../src/lz4.js';

console.log("--- LZ4 Buffer (Object) Example ---");

// 1. Define Complex Object
const myData = {
    id: 101,
    user: "Developer",
    tags: ["javascript", "lz4", "compression"],
    meta: {
        active: true,
        scores: [10, 20, 30, 40, 50]
    },
    // Add some bulk to make compression visible
    history: Array.from({ length: 100 }, (_, i) => ({ step: i, value: Math.random() }))
};

// 2. Compress Object directly
// Automatically handles JSON.stringify -> UTF-8 -> LZ4
const compressed = LZ4.compressObject(myData);
console.log(`Compressed Buffer: ${compressed.length} bytes`);

// 3. Decompress Object directly
// Automatically handles LZ4 -> UTF-8 -> JSON.parse
const restoredData = LZ4.decompressObject(compressed);

// 4. Verify
console.log("Restored Object Keys:", Object.keys(restoredData));
console.log(`User: ${restoredData.user}`);
console.log(`History Items: ${restoredData.history.length}`);