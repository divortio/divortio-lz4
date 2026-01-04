/**
 * benchmark/src/bench/profile-decompression.js
 * * Standalone profiling script for lz4-divortio Decompression.
 * * Automated Mode: Spawns itself with V8 profiling enabled, then processes the logs.
 * * * USAGE:
 * node benchmark/src/bench/profile-decompression.js
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { compressBuffer } from '../../../src/buffer/bufferCompress.js';
import { decompressBuffer } from '../../../src/buffer/bufferDecompress.js';

// --- ESM Helper ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const IS_WORKER = process.argv.includes('--worker');
const SIZES = [
    1 * 1024 * 1024,   // 1 MB
    5 * 1024 * 1024,   // 5 MB
    25 * 1024 * 1024   // 25 MB
];
const DURATION_PER_SIZE_MS = 3000;

// =========================================================
// RUNNER LOGIC (Parent Process)
// =========================================================
if (!IS_WORKER) {
    console.log('================================================');
    console.log('   LZ4-DIVORTIO DECOMPRESS PROFILER (Auto)      ');
    console.log('================================================');
    console.log('Spawning profiling worker node process...');

    // Spawn self with --prof enabled
    const child = spawn(process.execPath, ['--prof', __filename, '--worker'], {
        stdio: 'inherit',
        cwd: process.cwd()
    });

    child.on('exit', (code) => {
        if (code !== 0) {
            console.error(`\nWorker process failed with code ${code}`);
            process.exit(code);
        }

        console.log('\n[Post-Processing Logs]');

        // Find the log file associated with the child PID
        // Pattern: isolate-0x<address>-<pid>-v8.log
        const logPattern = new RegExp(`isolate-0x[0-9a-fA-F]+-${child.pid}-v8\\.log`);
        const files = fs.readdirSync(process.cwd());
        const logFilename = files.find(f => logPattern.test(f));

        if (!logFilename) {
            console.error('Error: Could not find V8 log file for pid', child.pid);
            process.exit(1);
        }

        const logPath = path.resolve(process.cwd(), logFilename);
        const outPath = logPath + '.txt';

        console.log(`  - Raw Log Found:   ${logPath}`);

        try {
            process.stdout.write('  - Processing...    ');
            execSync(`node --prof-process "${logPath}" > "${outPath}"`);
            console.log('Done.');

            console.log('\n================================================');
            console.log('PROFILING COMPLETE');
            console.log(`Processed Report: ${outPath}`);
            console.log('================================================');
        } catch (e) {
            console.error('\nFailed to process log file:', e.message);
        }
    });

}

// =========================================================
// WORKER LOGIC (Child Process - The Benchmark)
// =========================================================
else {
    runBenchmark();
}

/**
 * Generates compressible data (repeating patterns).
 * Identical to the compression profiler to ensure consistent characteristics.
 */
function generateCompressibleData(size) {
    const buffer = new Uint8Array(size);
    const seedSize = 4096;
    const seed = new Uint8Array(seedSize);
    for (let i = 0; i < seedSize; i++) {
        seed[i] = (Math.random() * 256) | 0;
    }
    for (let i = 0; i < size; i++) {
        buffer[i] = seed[i % seedSize];
    }
    return buffer;
}

function runBenchmark() {
    console.log(`\n[ Worker PID: ${process.pid} Started ]`);

    for (const size of SIZES) {
        const label = `${size / 1024 / 1024} MB`;
        console.log(`\n[ Profiling Target: ${label} ]`);

        // 1. Generation & Setup
        process.stdout.write('  - Preparing Data...  ');
        const rawInput = generateCompressibleData(size);
        // Pre-compress the data so we have a valid LZ4 frame to decompress
        const compressedInput = compressBuffer(rawInput);
        console.log(`Done. (Compressed: ${(compressedInput.length / 1024).toFixed(1)} KB)`);

        // 2. Warmup
        process.stdout.write('  - Warming up V8...   ');
        for (let i = 0; i < 10; i++) {
            decompressBuffer(compressedInput);
        }
        console.log('Done.');

        // 3. Hot Loop
        console.log(`  - Running Hot Loop (${DURATION_PER_SIZE_MS}ms)...`);

        const start = performance.now();
        let count = 0;

        while (performance.now() - start < DURATION_PER_SIZE_MS) {
            decompressBuffer(compressedInput);
            count++;
        }

        const end = performance.now();

        // Calculate throughput based on ORIGINAL (Uncompressed) Size
        const totalBytes = count * size;
        const seconds = (end - start) / 1000;
        const mbPerSec = (totalBytes / 1024 / 1024) / seconds;

        console.log(`  > Iterations: ${count}`);
        console.log(`  > Speed:      ${mbPerSec.toFixed(2)} MB/s`);
    }
}