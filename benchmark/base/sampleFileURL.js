/**
 * benchmark/base/sampleFileURL.js
 * * Extension of SampleFile for remote resources with "Invisible" Synchronous Downloading.
 * * This class abstracts a remote file (URL) as if it were a local file.
 * It utilizes a blocking subprocess strategy to download files synchronously
 * on-demand, maintaining API compatibility with the base `SampleFile` class.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { SampleFile } from './sampleFile.js';

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** * Directory where downloaded files are cached.
 * Resolves to: /path/to/project/benchmark/.cache/fileURLs
 * @constant {string}
 */
const CACHE_DIR = path.resolve(__dirname, '../../.cache/fileURLs');

/**
 * Represents a remote file resource that is automatically downloaded and cached upon access.
 * @class
 * @extends SampleFile
 */
export class SampleFileURL extends SampleFile {
    /**
     * Creates an instance of SampleFileURL.
     * * The file is **not** downloaded immediately upon instantiation.
     * It is downloaded lazily when `.load()` is called for the first time.
     * * @param {string} url - The valid HTTP/HTTPS URL of the remote file.
     * @throws {Error} If the URL is not a string or does not start with http/https.
     */
    constructor(url) {
        if (typeof url !== 'string' || !url.startsWith('http')) {
            throw new Error('Invalid argument: Must be a valid HTTP/HTTPS URL.');
        }

        // Generate the local cache path based on the URL structure
        const cachePath = SampleFileURL._generateCachePath(url);

        // Initialize parent with the calculated path (even if it doesn't exist on disk yet)
        super(cachePath);

        /** * The original remote URL.
         * @type {string}
         */
        this.url = url;
    }

    /**
     * Generates a SHA256 hash of the URL (protocol independent).
     * Useful for identifying unique resources regardless of local filename collisions.
     * * @readonly
     * @type {string} Hex string of the hash.
     */
    get urlHash() {
        // Strip protocol to ensure http vs https doesn't alter identity
        const cleanUrl = this.url.replace(/^https?:\/\//, '');
        return crypto.createHash('sha256').update(cleanUrl).digest('hex');
    }

    /**
     * Synchronously loads the file content into a Buffer.
     * * **"Invisible" Sync Logic:**
     * 1. Checks if the file exists locally and has content > 0 bytes.
     * 2. If missing, it blocks the Event Loop and spawns a child process to download the file.
     * 3. Once the download completes, it reads the file from disk using the parent class logic.
     * * @returns {Buffer} The raw file content.
     * @throws {Error} If the download fails or the file cannot be read.
     * @override
     */
    load() {
        // 1. Check if we need to download (Lazy Load)
        if (!this.exists || this.size === 0) {
            this._downloadSync();
        }

        // 2. Standard synchronous load from disk via Parent
        return super.load();
    }

    /**
     * Internal method to perform a "Blocking Download" by spawning a child Node process.
     * * This is required because `fetch` is asynchronous, but we need to maintain
     * a synchronous API for the Benchmark harness.
     * * @private
     * @throws {Error} If the child process exits with a non-zero status.
     */
    _downloadSync() {
        // Ensure the cache directory structure exists
        const dir = path.dirname(this.path);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        console.log(`[SampleFileURL] Cache Miss. Downloading synchronously...`);
        console.log(`  Source: ${this.url}`);
        console.log(`  Dest:   ${this.path}`);

        // The isolated worker script to execute in the child process
        const workerCode = `
            const fs = require('fs');
            const url = process.argv[1];
            const dest = process.argv[2];

            (async () => {
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        console.error('HTTP ' + response.status + ' ' + response.statusText);
                        process.exit(1);
                    }
                    const arrayBuffer = await response.arrayBuffer();
                    fs.writeFileSync(dest, Buffer.from(arrayBuffer));
                    process.exit(0);
                } catch (e) {
                    console.error(e.message);
                    process.exit(1);
                }
            })();
        `;

        // Spawn a new Node instance to run the worker code and BLOCK until it returns
        const result = spawnSync(process.execPath, ['-e', workerCode, this.url, this.path], {
            stdio: 'inherit', // Pipe stdout/stderr so the user sees progress/errors
            encoding: 'utf-8'
        });

        if (result.status !== 0) {
            // Cleanup partial file if it exists (corrupt download)
            if (fs.existsSync(this.path)) fs.unlinkSync(this.path);
            throw new Error(`Failed to download file. Child process exited with code ${result.status}`);
        }

        console.log(`[SampleFileURL] Download Complete.`);

        // IMPORTANT: Reset the parent class's internal cache (stats, existence check)
        // because the file has just been created on disk since instantiation.
        this.resetCache();
    }

    /**
     * Converts a URL into a structured, sanitized local file path.
     * * Strategy:
     * 1. Reverse Domain Notation (drive.google.com -> com.google.drive)
     * 2. Sanitizes illegal OS characters (<, >, :, ", /, \, |, ?, *) to underscores.
     * 3. Appends 'index.bin' for paths ending in a slash or missing an extension.
     * * @param {string} rawUrl - The input URL.
     * @returns {string} The absolute path to the local cache file.
     * @private
     * @static
     */
    static _generateCachePath(rawUrl) {
        const parsed = new URL(rawUrl);

        // 1. Reverse Domain
        const hostParts = parsed.hostname.split('.').reverse();
        const reversedHost = hostParts.join('.');

        // 2. Parse Path
        let urlPath = parsed.pathname;
        if (urlPath.startsWith('/')) urlPath = urlPath.substring(1);

        let filename = 'index.bin';
        let dirPath = urlPath;

        const hasExtension = path.extname(urlPath).length > 0;
        const endsInSlash = urlPath.endsWith('/');

        // Logic to determine if the URL points to a specific file or a directory
        if (!endsInSlash && hasExtension) {
            filename = path.basename(urlPath);
            dirPath = path.dirname(urlPath);
        } else if (!endsInSlash && !hasExtension) {
            // Ambiguous path without extension is treated as a directory
            dirPath = urlPath;
            filename = 'index.bin';
        }

        // 3. Sanitize (Replace OS-illegal chars with underscores)
        const safeDir = dirPath.split('/').map(p => p.replace(/[<>:"/\\|?*]/g, '_')).join(path.sep);
        const safeFilename = filename.replace(/[<>:"/\\|?*]/g, '_');

        return path.join(CACHE_DIR, reversedHost, safeDir, safeFilename);
    }
}