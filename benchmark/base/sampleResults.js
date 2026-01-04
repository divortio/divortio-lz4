/**
 * benchmark/base/sampleResults.js
 * * Collection class for managing multiple SampleResult instances.
 * * Key Features:
 * - Aggregates multiple runs.
 * - Provides statistical analysis (Mean, Median, P95, Standard Deviation).
 * - Sorting and filtering capabilities.
 * - **Batch Initialization**: Can be initialized with an array of results.
 */

import { SampleResult } from './sampleResult.js';

export class SampleResults {
    /**
     * @param {SampleResult[]} [initialResults=[]] - Optional array of SampleResult objects to initialize with.
     */
    constructor(initialResults = []) {
        /** @type {SampleResult[]} */
        this._samples = [];

        if (Array.isArray(initialResults)) {
            for (const result of initialResults) {
                this.addResult(result);
            }
        }
    }

    /**
     * Adds a result to the collection.
     * @param {SampleResult} result
     */
    addResult(result) {
        if (!(result instanceof SampleResult)) {
            throw new Error('Invalid argument: Must be instance of SampleResult');
        }
        this._samples.push(result);
    }

    /**
     * Returns the total number of samples collected.
     */
    get count() {
        return this._samples.length;
    }

    /**
     * Returns all samples.
     */
    get all() {
        return [...this._samples];
    }

    /**
     * Returns the sample with the highest throughput.
     * @returns {SampleResult|null}
     */
    get fastest() {
        if (this._samples.length === 0) return null;
        return this.getSorted('throughput', 'desc')[0];
    }

    /**
     * Returns the sample with the lowest throughput.
     * @returns {SampleResult|null}
     */
    get slowest() {
        if (this._samples.length === 0) return null;
        return this.getSorted('throughput', 'asc')[0];
    }

    /**
     * Calculates the Arithmetic Mean (Average) throughput.
     * @returns {number} bytes/sec
     */
    get mean() {
        if (this._samples.length === 0) return 0;
        const total = this._samples.reduce((sum, s) => sum + s.throughput, 0);
        return total / this._samples.length;
    }

    /**
     * Calculates the Median throughput.
     * @returns {number} bytes/sec
     */
    get median() {
        if (this._samples.length === 0) return 0;
        const sorted = this.getSorted('throughput', 'desc');
        const mid = Math.floor(sorted.length / 2);

        if (sorted.length % 2 !== 0) {
            return sorted[mid].throughput;
        }
        return (sorted[mid - 1].throughput + sorted[mid].throughput) / 2;
    }

    /**
     * Calculates the Standard Deviation of the throughput.
     * Useful for determining how stable the benchmark was.
     * @returns {number}
     */
    get stdDev() {
        if (this._samples.length === 0) return 0;
        const mean = this.mean;
        const squareDiffs = this._samples.map(s => {
            const diff = s.throughput - mean;
            return diff * diff;
        });
        const avgSquareDiff = squareDiffs.reduce((sum, d) => sum + d, 0) / this._samples.length;
        return Math.sqrt(avgSquareDiff);
    }

    /**
     * Gets a specific percentile result (based on throughput).
     * @param {number} p - Percentile (0-100), e.g., 95 for P95.
     * @returns {number} bytes/sec at that percentile.
     */
    getPercentile(p) {
        if (this._samples.length === 0) return 0;
        const sorted = this.getSorted('throughput', 'asc'); // Low to High
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, Math.min(index, sorted.length - 1))].throughput;
    }

    /**
     * Returns an array of samples sorted by a specific field.
     * @param {string} field - Property name to sort by (default: 'throughput').
     * @param {string} order - 'asc' or 'desc' (default: 'desc').
     * @returns {SampleResult[]}
     */
    getSorted(field = 'throughput', order = 'desc') {
        return [...this._samples].sort((a, b) => {
            const valA = a[field];
            const valB = b[field];

            if (valA < valB) return order === 'asc' ? -1 : 1;
            if (valA > valB) return order === 'asc' ? 1 : -1;
            return 0;
        });
    }

    /**
     * Returns a summary object useful for logging.
     */
    toJSON() {
        return {
            count: this.count,
            fastest: this.fastest ? this.fastest.throughputH : 'N/A',
            slowest: this.slowest ? this.slowest.throughputH : 'N/A',
            mean: this._formatBytes(this.mean) + '/s',
            median: this._formatBytes(this.median) + '/s',
            p95: this._formatBytes(this.getPercentile(95)) + '/s',
            stdDev: this.stdDev.toFixed(2)
        };
    }

    // Helper duplicated from SampleResult for the summary output
    _formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}