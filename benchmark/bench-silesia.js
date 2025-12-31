import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, 'bench-worker.js');
const CORPUS_DIR = path.join(__dirname, 'silesia_corpus');

// New URL (tar.gz)
const CORPUS_URL = 'https://github.com/DataCompression/corpus-collection/raw/refs/heads/main/Silesia-Corpus/silesia.tar.gz';

const LIBRARIES = [
    'lz4-napi',
    'lz4-wasm',
    'lz4-wasm-web',
    'lz4-browser',
    'snappy',
    'divortio',
    'lz4js',
    'snappyjs'
];

const SAMPLES = 3;

// --- 1. Corpus Management (Updated for .tar.gz) ---

async function prepareCorpus() {
    if (fs.existsSync(CORPUS_DIR)) {
        const files = fs.readdirSync(CORPUS_DIR);
        if (files.length > 0) {
            console.log(`[+] Corpus found at ${CORPUS_DIR}`);
            return getCorpusFiles();
        }
    }

    console.log(`[-] Corpus not found. Downloading from ${CORPUS_URL}...`);
    const tarPath = path.join(__dirname, 'silesia.tar.gz');

    // Download with Redirect Handling
    await downloadFile(CORPUS_URL, tarPath);

    console.log(`[+] Download complete. Extracting...`);

    if (!fs.existsSync(CORPUS_DIR)) fs.mkdirSync(CORPUS_DIR);

    try {
        // Extract .tar.gz
        // -x: extract, -z: gzip, -f: file, -C: output dir
        execSync(`tar -xzf "${tarPath}" -C "${CORPUS_DIR}"`);
    } catch (e) {
        console.error("❌ Failed to extract tar.gz.");
        console.error(`Error: ${e.message}`);
        console.error("Please extract 'silesia.tar.gz' manually into 'silesia_corpus' folder.");
        process.exit(1);
    }

    // Cleanup
    if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
    console.log(`[+] Corpus ready.`);

    return getCorpusFiles();
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);

        const request = (uri) => {
            https.get(uri, response => {
                // Handle Redirects (GitHub uses them)
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    return request(response.headers.location);
                }

                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', err => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
        };

        request(url);
    });
}

function getCorpusFiles() {
    return fs.readdirSync(CORPUS_DIR)
        .filter(f => !f.startsWith('.'))
        .map(f => path.join(CORPUS_DIR, f));
}

// --- 2. Benchmark Runner ---

async function runSilesiaBenchmark() {
    const files = await prepareCorpus();
    const metrics = {};

    console.log(`\n================================================================================`);
    console.log(`🚀 SILESIA CORPUS BENCHMARK (Detailed Real-time Feed)`);
    console.log(`================================================================================`);
    // Header for realtime feed
    console.log(
        `| ${"Library".padEnd(16)} ` +
        `| ${"File".padEnd(12)} ` +
        `| ${"Input".padStart(8)} ` +
        `| ${"Output".padStart(8)} ` +
        `| ${"Ratio".padStart(7)} ` +
        `| ${"Time".padStart(8)} ` +
        `| ${"Speed".padStart(10)} |`
    );
    console.log("-".repeat(95));

    for (const file of files) {
        const fileName = path.basename(file);
        const fileSize = fs.statSync(file).size;

        for (const lib of LIBRARIES) {

            const fileArg = `file:${file}`;
            let bestResult = null;

            // Run Samples
            for (let i = 0; i < SAMPLES; i++) {
                const child = spawnSync('node', ['--expose-gc', WORKER_PATH, lib, fileArg, 'compress'], {
                    encoding: 'utf-8',
                    stdio: ['ignore', 'pipe', 'pipe']
                });

                if (child.status !== 0) {
                    console.error(`[${lib}] Error: Worker Failed`);
                    continue;
                }

                try {
                    const lines = child.stdout.trim().split('\n');
                    const json = JSON.parse(lines[lines.length - 1]);

                    // Keep best result for summary
                    if (!bestResult || json.throughput > bestResult.throughput) {
                        bestResult = json;
                    }

                    // --- REAL TIME OUTPUT ---
                    // Input: MB, Output: MB, Ratio: %, Time: ms, Speed: MB/s
                    const inputMB = (fileSize / 1024 / 1024).toFixed(2) + "M";
                    const outputMB = (json.sizeBytes / 1024 / 1024).toFixed(2) + "M";
                    const ratio = ((fileSize / json.sizeBytes)).toFixed(2) + "x";
                    const timeMs = json.timeMs.toFixed(1) + "ms";
                    const speed = json.throughput.toFixed(2) + " MB/s";

                    console.log(
                        `| ${lib.padEnd(16)} ` +
                        `| ${fileName.padEnd(12)} ` +
                        `| ${inputMB.padStart(8)} ` +
                        `| ${outputMB.padStart(8)} ` +
                        `| ${ratio.padStart(7)} ` +
                        `| ${timeMs.padStart(8)} ` +
                        `| ${speed.padStart(10)} |`
                    );

                } catch (e) {
                    console.error("Parse Error");
                }
            }

            // Aggregate Best Data for Final Table
            if (bestResult) {
                if (!metrics[lib]) {
                    metrics[lib] = { totalBytes: 0, totalTime: 0, originalSize: 0, compressedSize: 0 };
                }
                const sizeMB = fileSize / 1024 / 1024;
                const timeSec = sizeMB / bestResult.throughput;

                metrics[lib].totalBytes += fileSize;
                metrics[lib].totalTime += timeSec;
                metrics[lib].originalSize += fileSize;
                metrics[lib].compressedSize += bestResult.sizeBytes;
            }
        }
        // Separator between files
        console.log("-".repeat(95));
    }

    // --- REPORTING ---
    console.log(`\n\n🏆 GLOBAL CHAMPIONSHIP (Weighted Average across Corpus)`);
    console.log(`================================================================================`);

    const tableData = Object.entries(metrics).map(([name, data]) => {
        const totalSizeMB = data.totalBytes / 1024 / 1024;
        const avgSpeed = totalSizeMB / data.totalTime;
        const ratio = (data.originalSize / data.compressedSize);

        return {
            "Library": name,
            "Speed (MB/s)": avgSpeed.toFixed(2),
            "Ratio": ratio.toFixed(3) + "x",
            "Compressed (MB)": (data.compressedSize / 1024 / 1024).toFixed(2)
        };
    });

    tableData.sort((a, b) => parseFloat(b["Speed (MB/s)"]) - parseFloat(a["Speed (MB/s)"]));
    console.table(tableData);
}

runSilesiaBenchmark().catch(console.error);