/**
 * benchmark/base/corpusURLArchive.js
 * * Represents a Corpus hosted in a remote compressed archive (e.g., .tar.gz).
 * * Functionality:
 * - Automatically downloads and extracts the archive to a local cache.
 * - Iterates over the contents as `SampleFile` objects.
 * - Supports "Smart Discovery" to find files regardless of directory nesting.
 * - Maintains a synchronous API for ease of use in benchmarks.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { SampleFile } from './sampleFile.js';

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Directory where corpus archives are cached and extracted.
 * Resolves to: /path/to/project/benchmark/.cache/corpus
 * @constant {string}
 */
const CACHE_ROOT = path.resolve(__dirname, '../../.cache/corpus');

export class CorpusURLArchive {
    /**
     * @param {string} name - The unique name of the corpus (e.g., 'silesia'). Used for the cache folder.
     * @param {string} url - The URL to the compressed archive (tar.gz recommended).
     * @param {string[]|null} [subset=null] - Optional list of filenames to restrict the output to.
     * If null, all files are returned.
     */
    constructor(name, url, subset = null) {
        this.name = name;
        this.url = url;
        this.subset = subset ? new Set(subset) : null;

        // Path Setup
        this.corpusDir = path.join(CACHE_ROOT, this.name);

        // Derive archive filename from URL (e.g., "silesia.tar.gz")
        // fallback to "archive.bin" if URL parsing fails to find a name
        const urlPath = new URL(url).pathname;
        this.archiveFilename = path.basename(urlPath) || 'archive.bin';
        this.localArchivePath = path.join(this.corpusDir, this.archiveFilename);

        // State tracking
        this._ready = false;
    }

    /**
     * The Iterator Protocol implementation.
     * Allows the corpus to be used in `for..of` loops.
     * Triggers the download/extract logic synchronously on the first run.
     * @yields {SampleFile}
     */
    *[Symbol.iterator]() {
        this._prepare();

        // Recursively find all files in the corpus directory
        const allFiles = this._walkDirSync(this.corpusDir);

        for (const filePath of allFiles) {
            const fileName = path.basename(filePath);

            // Skip the archive file itself if it resides in the same dir
            if (fileName === this.archiveFilename) continue;

            // FILTER: If a subset is defined, only yield matching filenames
            if (this.subset && !this.subset.has(fileName)) {
                continue;
            }

            // Yield a standard SampleFile object pointing to the extracted local file
            yield new SampleFile(filePath);
        }
    }

    /**
     * Ensures the corpus is downloaded and extracted.
     * Checks if the cache directory exists and is populated.
     * @private
     */
    _prepare() {
        if (this._ready) return;

        // Naive check: If dir exists and has more than just the archive file, we assume it's extracted.
        // (A more robust check would use a specific flag file).
        const exists = fs.existsSync(this.corpusDir);
        if (exists) {
            const contents = fs.readdirSync(this.corpusDir);
            if (contents.length > 1) {
                this._ready = true;
                return;
            }
        }

        console.log(`[CorpusURLArchive] Setup required for '${this.name}'...`);

        // 1. Create Dir
        fs.mkdirSync(this.corpusDir, { recursive: true });

        // 2. Download (Blocking)
        if (!fs.existsSync(this.localArchivePath)) {
            this._downloadSync();
        }

        // 3. Extract (Blocking)
        this._extractSync();

        this._ready = true;
    }

    /**
     * Downloads the archive synchronously using a child process.
     * (Reuses logic from SampleFileURL to avoid async/await in main thread)
     * @private
     */
    _downloadSync() {
        console.log(`  Downloading: ${this.url}`);

        const workerCode = `
            const fs = require('fs');
            const url = process.argv[1];
            const dest = process.argv[2];
            (async () => {
                try {
                    const response = await fetch(url);
                    if (!response.ok) process.exit(1);
                    const buffer = await response.arrayBuffer();
                    fs.writeFileSync(dest, Buffer.from(buffer));
                    process.exit(0);
                } catch (e) { console.error(e); process.exit(1); }
            })();
        `;

        const result = spawnSync(process.execPath, ['-e', workerCode, this.url, this.localArchivePath], {
            stdio: 'inherit'
        });

        if (result.status !== 0) {
            throw new Error(`Failed to download corpus archive: ${this.url}`);
        }
    }

    /**
     * Extracts the archive synchronously using system `tar`.
     * @private
     */
    _extractSync() {
        console.log(`  Extracting to: ${this.corpusDir}`);

        // Detect compression type based on extension (basic)
        const isTar = this.archiveFilename.endsWith('.tar') ||
            this.archiveFilename.endsWith('.tar.gz') ||
            this.archiveFilename.endsWith('.tgz');

        if (isTar) {
            // Use system 'tar' command.
            // -x: extract, -f: file, -C: change directory before extracting
            // Note: This requires 'tar' to be in the system PATH.
            const args = ['-xf', this.localArchivePath, '-C', this.corpusDir];

            const result = spawnSync('tar', args, { stdio: 'inherit' });

            if (result.status !== 0) {
                // If extraction fails, we might have a corrupt download.
                // Optionally cleanup here.
                throw new Error(`Failed to extract archive. Exit code: ${result.status}`);
            }
        } else {
            // Placeholder for ZIP or other formats if needed in future
            console.warn(`[CorpusURLArchive] Warning: No auto-extraction logic for file type: ${this.archiveFilename}`);
        }
    }

    /**
     * Recursively walks a directory and returns a flat list of absolute file paths.
     * @param {string} dir
     * @returns {string[]} List of file paths
     * @private
     */
    _walkDirSync(dir) {
        let results = [];
        const list = fs.readdirSync(dir);

        for (const file of list) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat && stat.isDirectory()) {
                // Recurse
                results = results.concat(this._walkDirSync(filePath));
            } else {
                results.push(filePath);
            }
        }
        return results;
    }
}