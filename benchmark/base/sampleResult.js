/**
 * benchmark/base/sampleResult.js
 * * Represents the raw data and calculated metrics of a single benchmark execution.
 * This low-level class encapsulates the timing and size data to provide standard
 * performance metrics like throughput and compression ratio.
 */

export class SampleResult {
    /**
     * @param {number} inputSize - The size of the data fed into the operation (bytes).
     * @param {number} outputSize - The size of the result produced (bytes).
     * @param {number} startTime - High-resolution timestamp of the start (ms).
     * @param {number} endTime - High-resolution timestamp of the completion (ms).
     */
    constructor(inputSize, outputSize, startTime, endTime) {
        this.inputSize = inputSize;
        this.outputSize = outputSize;
        this.startTime = startTime;
        this.endTime = endTime;
    }

    /**
     * Duration of the run in milliseconds.
     * @returns {number}
     */
    get durationMs() {
        return this.endTime - this.startTime;
    }

    /**
     * Duration of the run in seconds.
     * @returns {number}
     */
    get durationSec() {
        return this.durationMs / 1000;
    }

    /**
     * Throughput in Bytes per Second.
     * Calculated based on Input Size (rate of consumption).
     * @returns {number}
     */
    get throughput() {
        if (this.durationSec <= 0) return 0;
        return this.inputSize / this.durationSec;
    }

    /**
     * Throughput in Human-Readable format (e.g., "1024.50 MB/s").
     * @returns {string}
     */
    get throughputH() {
        return this._formatBytes(this.throughput) + '/s';
    }

    /**
     * Compression/Expansion Ratio as a decimal.
     * e.g., 0.50 means the output is 50% the size of the input.
     * @returns {number}
     */
    get ratio() {
        if (this.inputSize === 0) return 0;
        // Fix to 4 decimal places for precision, then parse back to number
        return parseFloat((this.outputSize / this.inputSize).toFixed(4));
    }

    /**
     * Helper to format raw bytes into human-readable strings (KB, MB, GB).
     * @param {number} bytes
     * @returns {string}
     */
    static _formatBytes(bytes) {
        if (bytes === 0) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

        // Calculate the magnitude
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        // Return formatted string (e.g., "1.24 MB")
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Returns a plain object representation for logging/JSON.
     */
    toJSON() {
        return {
            inputSize: this.inputSize,
            outputSize: this.outputSize,
            durationMs: parseFloat(this.durationMs.toFixed(3)),
            throughput: this.throughputH,
            ratio: this.ratio
        };
    }
}