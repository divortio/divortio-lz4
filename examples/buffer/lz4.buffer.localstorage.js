import { LZ4 } from '../../src/lz4.js';

console.log("--- LZ4 LocalStorage Optimization Example ---");

// --- 1. Mock Data (Large User Session) ---
const userSession = {
    id: "user_12345",
    preferences: { theme: "dark", notifications: true },
    // Simulate a large cache (e.g., 5000 items)
    cache: Array.from({ length: 5000 }, (_, i) => ({
        id: i,
        title: `Item ${i}`,
        description: "This is a cached item description that takes up space."
    }))
};

// --- 2. The Problem: Standard Storage ---
const rawJson = JSON.stringify(userSession);
console.log(`Raw JSON Size: ${(rawJson.length / 1024).toFixed(2)} KB`);

// --- 3. The Solution: Compress -> Base64 ---

// Step A: Compress Object (JSON -> LZ4 Buffer)
const compressedBuffer = LZ4.compressObject(userSession);

// Step B: Convert Uint8Array to Base64 String (for Storage)
// Note: In Node.js we use Buffer. In Browser, use btoa(String.fromCharCode(...)) or a helper.
const base64String = Buffer.from(compressedBuffer).toString('base64');

console.log(`Compressed (Base64) Size: ${(base64String.length / 1024).toFixed(2)} KB`);
console.log(`Space Saved: ${((1 - base64String.length / rawJson.length) * 100).toFixed(2)}%`);

// --- 4. Simulation: Save & Load ---

const mockLocalStorage = { "session_v1": base64String }; // Saved!

// ... Later ...

// Step C: Load Base64 -> Buffer
const loadedBase64 = mockLocalStorage["session_v1"];
const loadedBuffer = Uint8Array.from(Buffer.from(loadedBase64, 'base64'));

// Step D: Decompress (LZ4 Buffer -> Object)
const restoredSession = LZ4.decompressObject(loadedBuffer);

// --- 5. Verify ---
const isMatch = restoredSession.cache.length === userSession.cache.length;
console.log(`Restored Session Cache Count: ${restoredSession.cache.length}`);
console.log(`Success: ${isMatch}`);