import { Session } from 'node:inspector';
import fs from 'node:fs';
import { promisify } from 'node:util';
import { LZ4 } from '../../src/lz4.js';
import { generateData } from './bench-utils.js';

// Setup Inspector Session
const session = new Session();
session.connect();

const post = promisify(session.post.bind(session));

async function runProfile() {
    console.log("Preparing Profiling Environment...");

    // 1. Setup Data (Small dataset to target your specific pain point)
    const sizeMB = 1;
    const input = Buffer.from(generateData(sizeMB));

    // Pre-compress so we can profile DECOMPRESSION only
    const compressed = LZ4.compress(input, null, 4194304, true, false);

    console.log(`Payload: ${sizeMB}MB JSON`);
    console.log("Warming up V8 JIT...");

    // Warmup to ensure we profile optimized code, not compilation
    for (let i = 0; i < 50; i++) {
        LZ4.decompress(compressed);
    }

    console.log("Starting CPU Profiler...");

    // 2. Enable Profiler
    await post('Profiler.enable');
    await post('Profiler.start');

    // 3. Run Workload
    // Run enough iterations to get statistically significant samples
    const start = performance.now();
    let count = 0;
    while (performance.now() - start < 3000) { // Run for 3 seconds
        LZ4.decompress(compressed);
        count++;
    }

    // 4. Stop & Save
    const { profile } = await post('Profiler.stop');
    const fileName = `decompression-${sizeMB}MB.cpuprofile`;

    fs.writeFileSync(fileName, JSON.stringify(profile));
    console.log(`\n✅ Profile saved to: ${fileName}`);
    console.log(`Total Decompressions: ${count}`);
    console.log("\nINSTRUCTIONS:");
    console.log("1. Open Chrome or Edge");
    console.log("2. Open DevTools (F12) -> 'Performance' tab (or 'Memory' -> 'Profiles' in older versions)");
    console.log("3. Click 'Load profile...' and select the generated file");
    console.log("4. Look for 'decompressBlock' and 'lz4Base' in the 'Heavy (Bottom Up)' view");

    process.exit(0);
}

runProfile().catch(console.error);