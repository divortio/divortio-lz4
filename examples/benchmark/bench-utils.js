import { printSystemInfo } from './sys-info.js';

// Re-export for convenience
export { printSystemInfo };

// --- Data Generation ---
export function generateData(sizeMB) {
    // Semi-structured data to prevent trivial RLE optimization but allow LZ4 patterns
    const baseObj = {
        id: 1,
        type: "benchmark_event",
        tags: ["performance", "compression", "lz4", "javascript", "v8"],
        meta: { valid: true, scores: [100, 205, 300, 400, 500] },
        payload: "Repeated data is the key to high compression ratios in LZ4."
    };

    const json = JSON.stringify(baseObj);
    const targetBytes = sizeMB * 1024 * 1024;
    const repeatCount = Math.ceil(targetBytes / json.length);

    return new TextEncoder().encode(json.repeat(repeatCount));
}

// --- Adaptive Measurement Engine ---
export function measure(label, fn, inputSize) {
    const MIN_SAMPLE_TIME = 50; // ms

    // 1. Warmup (JIT Optimization)
    // Run blindly for a short burst
    const warmupStart = performance.now();
    while ((performance.now() - warmupStart) < 50) {
        fn();
    }

    // 2. Calibration (Determine Batch Size)
    // Find 'count' needed to run for ~50ms
    let count = 1;
    while (true) {
        const start = performance.now();
        for (let i = 0; i < count; i++) fn();
        const duration = performance.now() - start;

        if (duration >= MIN_SAMPLE_TIME) break;

        // Adaptive step up
        if (duration < 5) count *= 10;
        else count *= 2;
    }

    // 3. Measurement (Run Samples)
    // We run 5 samples of 'count' iterations each
    const samples = [];
    for (let i = 0; i < 5; i++) {
        const start = performance.now();
        const result = fn(); // Capture result of last run for size check
        // Run remaining count-1
        for (let j = 1; j < count; j++) fn();
        const end = performance.now();

        const totalTime = end - start;
        const totalBytes = inputSize * count;

        // Calculate Throughput (MB/s) for this sample
        const mbps = (totalBytes / 1024 / 1024) / (totalTime / 1000);
        samples.push(mbps);

        // Store size from first run
        if (i === 0) {
            var outputSize = result ? (result.byteLength || result.length) : 0;
        }
    }

    // 4. Statistics
    // Average MB/s
    const avgMbps = samples.reduce((a, b) => a + b, 0) / samples.length;

    // Calculate average duration per single operation (for display)
    // throughput = (SizeMB) / (TimeSec)
    // TimeSec = SizeMB / Throughput
    const timePerOpMs = ((inputSize / 1024 / 1024) / avgMbps) * 1000;

    return {
        engine: label,
        timeMs: timePerOpMs,
        sizeBytes: outputSize,
        throughput: avgMbps,
        ratio: outputSize ? (outputSize / inputSize * 100) : 0
    };
}

// --- Reporting ---
export function printResults(title, results) {
    console.log(`\n=== ${title} ===`);

    // Sort by Throughput (Fastest first)
    results.sort((a, b) => b.throughput - a.throughput);

    console.table(results.map(r => ({
        Engine: r.engine,
        "Time (ms)": r.timeMs.toFixed(3), // Higher precision for micro-ops
        "Speed (MB/s)": r.throughput.toFixed(2),
        "Size (KB)": (r.sizeBytes / 1024).toFixed(0),
        "Ratio (%)": r.ratio.toFixed(1) + "%",
    })));

    const winner = results[0];
    const loser = results[results.length - 1];
    const speedup = (winner.throughput / loser.throughput).toFixed(1);

    console.log(`>> Winner: ${winner.engine} is ${speedup}x faster than ${loser.engine}`);
}