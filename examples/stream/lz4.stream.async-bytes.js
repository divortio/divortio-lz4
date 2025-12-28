import { LZ4 } from '../../src/lz4.js';

console.log("--- LZ4 Async (Non-Blocking) Example ---");

// Helper to simulate a "UI" or background task
function startHeartbeat() {
    const start = Date.now();
    const interval = setInterval(() => {
        const delta = Date.now() - start;
        // If the thread is blocked, this log will pause/stutter
        console.log(`[Event Loop Alive] Tick: ${delta}ms`);
    }, 5); // Fast tick to catch blocks
    return interval;
}

async function runAsyncExample() {
    // 1. Generate massive dataset (approx 50MB)
    // Synchronous compression of 50MB would freeze the thread for ~200-500ms
    console.log("Generating 50MB Buffer...");
    const size = 50 * 1024 * 1024;
    const input = new Uint8Array(size);
    for (let i = 0; i < size; i++) input[i] = i % 255;

    console.log("Starting Async Compression...");

    // 2. Start "UI" heartbeat
    const timer = startHeartbeat();

    // 3. Run Async Compression
    // This uses "Time Slicing" to yield to the event loop every ~12ms
    const startComp = performance.now();
    const compressed = await LZ4.compressAsync(input);
    const endComp = performance.now();

    clearInterval(timer);
    console.log(`\nCompression Complete!`);
    console.log(`Time: ${(endComp - startComp).toFixed(2)}ms`);
    console.log(`Output Size: ${compressed.length} bytes`);

    // 4. Run Async Decompression
    console.log("\nStarting Async Decompression...");
    const timer2 = startHeartbeat();

    const restored = await LZ4.decompressAsync(compressed);

    clearInterval(timer2);
    console.log(`\nDecompression Complete!`);
    console.log(`Restored Size: ${restored.length} bytes`);
    console.log(`Match: ${input.length === restored.length}`);
}

runAsyncExample().catch(console.error);