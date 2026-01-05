/**
 * benchmark/base/corpusURLArchiveFile.js
 * * Represents a single specific file within a remote corpus archive.
 * * Functionality:
 * - Extends SampleFile (lazy loading, hashing).
 * - On access (load), checks if the file exists locally.
 * - If missing, it synchronously downloads and extracts the *entire* source archive.
 * - This ensures that even if you only ask for "dickens", the corpus is prepped.
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
 * Shared Cache Root
 * Resolves to: /path/to/project/benchmark/.cache/corpus
 */
const CACHE_ROOT = path.resolve(__dirname, '../../.cache/corpus');

export class CorpusURLArchiveFile extends SampleFile {
    /**
     * @param {string} corpusName - The namespace for the corpus (e.g. 'silesia').
     * @param {string} archiveUrl - The URL of the source archive.
     * @param {string} fileName   - The specific filename to target (e.g. 'dickens').
     * Note: If the archive extracts to subfolders, this
     * should be the relative path or the script will try to
     * find it recursively if simple lookup fails.
     */
    constructor(corpusName, archiveUrl, fileName) {
        // 1. Setup Paths
        const corpusDir = path.join(CACHE_ROOT, corpusName);

        // We initially assume the file is at the root of the corpus dir,
        // but we might need to resolve it later if nested.
        const initialPath = path.join(corpusDir, fileName);

        // 2. Initialize Parent
        super(initialPath);

        this.corpusName = corpusName;
        this.archiveUrl = archiveUrl;
        this.targetFileName = fileName;
        this.corpusDir = corpusDir;

        // Derive archive name from URL
        const urlPath = new URL(archiveUrl).pathname;
        this.archiveFilename = path.basename(urlPath) || 'archive.bin';
        this.localArchivePath = path.join(this.corpusDir, this.archiveFilename);
    }

    /**
     * Overrides SampleFile.load() to ensure the file exists (download/extract)
     * before attempting to read it.
     * @returns {Buffer}
     */
    load() {
        if (!this.exists) {
            this._prepareSync();
        }
        return super.load();
    }

    /**
     * Handles the "Cache Miss" logic.
     * Downloads and extracts the archive to ensure the file is present.
     * @private
     */
    _prepareSync() {
        console.log(`[CorpusFile] Cache miss for ${this.targetFileName}. Preparing corpus '${this.corpusName}'...`);

        if (!fs.existsSync(this.corpusDir)) {
            fs.mkdirSync(this.corpusDir, { recursive: true });
        }

        // 1. Download Archive (if missing)
        if (!fs.existsSync(this.localArchivePath)) {
            this._downloadSync();
        }

        // 2. Extract Archive (Always extract if the target file is missing,
        //    to handle cases where the archive exists but wasn't unpacked)
        this._extractSync();

        // 3. Path Resolution Strategy (Handling Nested Folders)
        // If the file wasn't found at the simple path (corpus/file),
        // we scan the folder to find it.
        if (!fs.existsSync(this.path)) {
            const foundPath = this._findFileSync(this.corpusDir, this.targetFileName);
            if (foundPath) {
                // Update the internal path used by SampleFile
                this.path = foundPath;
                // Re-resolve metadata
                this.dirname = path.dirname(this.path);
                this.extension = path.extname(this.path);
            } else {
                throw new Error(`File '${this.targetFileName}' not found in archive '${this.corpusName}' after extraction.`);
            }
        }
    }

    /**
     * Blocking Download using Child Process
     * @private
     */
    _downloadSync() {
        console.log(`  Downloading archive: ${this.archiveUrl}`);
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
                } catch (e) { process.exit(1); }
            })();
        `;
        const res = spawnSync(process.execPath, ['-e', workerCode, this.archiveUrl, this.localArchivePath], { stdio: 'inherit' });
        if (res.status !== 0) throw new Error('Download failed.');
    }

    /**
     * Blocking Extract using 'tar'
     * @private
     */
    _extractSync() {
        console.log(`  Extracting archive...`);
        // Simple extraction of everything. This is safer than partial extraction
        // when directory structures are unknown.
        const args = ['-xf', this.localArchivePath, '-C', this.corpusDir];
        const res = spawnSync('tar', args, { stdio: 'inherit' });
        if (res.status !== 0) throw new Error('Extraction failed.');
    }

    /**
     * Helper to find a file recursively if it wasn't where we expected.
     * @private
     */
    _findFileSync(dir, filename) {
        const list = fs.readdirSync(dir);
        for (const file of list) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                const found = this._findFileSync(fullPath, filename);
                if (found) return found;
            } else if (file === filename) {
                return fullPath;
            }
        }
        return null;
    }
}