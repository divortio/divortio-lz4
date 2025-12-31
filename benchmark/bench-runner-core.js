import { spawnSync } from 'node:child_process';
import { printResults, printSystemInfo } from './bench-utils.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, 'bench-worker.js');

const LIBRARIES = [
    // 'lz4-napi',
    // 'lz4-wasm',     // Existing (lz4-wasm-nodejs)
    // 'lz4-wasm-web', // New (lz4-wasm generic/browser pkg)
    // 'lz4-browser',  // New (lz4-browser pkg)
    // 'snappy',
    'divortio',
    'lz4js',
    // 'snappyjs'
];

const SIZES = [1, 5, 25]; // MB
const SAMPLES = 5;        // Number of runs per test

export function runSuite(title, mode) {
    printSystemInfo();
    console.log(`\n--- ${title} ---`);
    console.log(`(Sampling ${SAMPLES} runs per test, taking the Median)\n`);

    const summaryTable = {};

    for (const size of SIZES) {
        const sizeLabel = `${size} MB`;

        process.stdout.write(`[...] Benchmarking ${size}MB Dataset`);
        const aggregatedResults = [];

        for (const lib of LIBRARIES) {
            const samples = [];

            // Run SAMPLES times
            for (let i = 0; i < SAMPLES; i++) {
                process.stdout.write('.');

                const child = spawnSync('node', ['--expose-gc', WORKER_PATH, lib, size.toString(), mode], {
                    encoding: 'utf-8',
                    stdio: ['ignore', 'pipe', 'pipe']
                });

                if (child.status !== 0) {
                    // FIX: Log stderr so we know WHY it failed
                    console.error(`\n[${lib}] Worker Failed:`);
                    console.error(child.stderr);
                    continue;
                }

                try {
                    const lines = child.stdout.trim().split('\n');
                    const jsonStr = lines[lines.length - 1];
                    samples.push(JSON.parse(jsonStr));
                } catch (e) {
                    console.error(`\n[${lib}] Output Error:`, e);
                }
            }

            if (samples.length === 0) continue;

            // Calculate Median
            samples.sort((a, b) => b.throughput - a.throughput);
            const medianIndex = Math.floor(samples.length / 2);
            const medianResult = samples[medianIndex];

            // Store results
            aggregatedResults.push(medianResult);

            const libName = medianResult.name;
            if (!summaryTable[libName]) summaryTable[libName] = {};
            summaryTable[libName][sizeLabel] = medianResult.throughput.toFixed(1);
        }

        process.stdout.write('\n');
        printResults(`${mode.toUpperCase()} Results (${sizeLabel} Input - Median of ${SAMPLES})`, aggregatedResults);
    }

    // --- Final Summary Table ---
    console.log(`\n================================================================================`);
    console.log(`🚀 FINAL THROUGHPUT SUMMARY (MB/s)`);
    console.log(`================================================================================`);
    console.table(summaryTable);
}