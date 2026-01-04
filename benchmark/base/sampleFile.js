/**
 * benchmark/base/sampleFile.js
 * * Abstraction for a file system resource used in benchmarking.
 * * Key Features:
 * - Lazy-loaded metadata (size, existence).
 * - On-demand cryptographic hashing (MD5, SHA1, SHA256).
 * - Helper methods to load content as Buffer, Text, or JSON.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class SampleFile {
    /**
     * @param {string} filePath - Absolute or relative path to the file.
     */
    constructor(filePath) {
        if (typeof filePath !== 'string' || filePath.trim() === '') {
            throw new Error('Invalid argument: filePath must be a non-empty string.');
        }

        // Path Parsing
        this.path = path.resolve(filePath);
        this.dirname = path.dirname(this.path);
        this.filename = path.basename(this.path);
        this.extension = path.extname(this.path);

        // Internal Cache
        this._stat = null;     // Cached fs.Stats
        this._buffer = null;   // Cached content (Buffer)
        this._hashes = {};     // Cached hashes { md5: '...', sha1: '...' }
    }

    /**
     * Checks if the file exists on disk.
     * @returns {boolean}
     */
    get exists() {
        return fs.existsSync(this.path);
    }

    /**
     * Returns the size of the file in bytes.
     * Throws an error if the file does not exist.
     * @returns {number}
     */
    get size() {
        this._ensureStat();
        return this._stat.size;
    }

    /**
     * Returns the size in a human-readable string (e.g., "10.5 MB").
     * @returns {string}
     */
    get sizeH() {
        return this._formatBytes(this.size);
    }

    /**
     * Lazy-loaded MD5 checksum of the file content.
     * @returns {string} Hex string.
     */
    get md5() {
        return this._getOrComputeHash('md5');
    }

    /**
     * Lazy-loaded SHA1 checksum of the file content.
     * @returns {string} Hex string.
     */
    get sha1() {
        return this._getOrComputeHash('sha1');
    }

    /**
     * Lazy-loaded SHA256 checksum of the file content.
     * @returns {string} Hex string.
     */
    get sha256() {
        return this._getOrComputeHash('sha256');
    }

    /**
     * Loads the file content into a Buffer.
     * Caches the result in memory so subsequent calls are instant.
     * @returns {Buffer}
     */
    load() {
        if (!this._buffer) {
            if (!this.exists) throw new Error(`File not found: ${this.path}`);
            this._buffer = fs.readFileSync(this.path);
        }
        return this._buffer;
    }

    /**
     * Loads the file content as a UTF-8 string.
     * @returns {string}
     */
    loadText() {
        return this.load().toString('utf8');
    }

    /**
     * Loads and parses the file content as JSON.
     * @returns {object}
     */
    loadJson() {
        return JSON.parse(this.loadText());
    }

    /**
     * Clears all cached data (buffer, stats, hashes).
     * Useful if the file is modified externally during a benchmark.
     */
    resetCache() {
        this._stat = null;
        this._buffer = null;
        this._hashes = {};
    }

    // --- Internal Helpers ---

    /**
     * Ensures fs.Stats is cached.
     * @private
     */
    _ensureStat() {
        if (!this._stat) {
            if (!this.exists) throw new Error(`File not found: ${this.path}`);
            this._stat = fs.statSync(this.path);
        }
    }

    /**
     * Computes a hash synchronously.
     * Uses the cached buffer if available to save I/O, otherwise reads from disk.
     * @param {string} algo - 'md5', 'sha1', 'sha256'
     * @returns {string}
     * @private
     */
    _getOrComputeHash(algo) {
        if (this._hashes[algo]) return this._hashes[algo];

        const hash = crypto.createHash(algo);

        // Optimization: If buffer is already loaded in RAM, hash it directly.
        if (this._buffer) {
            hash.update(this._buffer);
        } else {
            // Otherwise, read sync from disk to avoid loading massive files just for a hash
            if (!this.exists) throw new Error(`File not found: ${this.path}`);
            const fileData = fs.readFileSync(this.path);
            hash.update(fileData);
        }

        const result = hash.digest('hex');
        this._hashes[algo] = result;
        return result;
    }

    /**
     * Formatter helper (Duplicated logic to keep class standalone)
     * @param {number} bytes
     * @returns {string}
     * @private
     */
    _formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}