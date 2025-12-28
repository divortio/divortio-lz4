#!/usr/bin/env node

/**
 * @fileoverview
 * LZ4 Web Development Server (HTTP/2 Enabled)
 * ============================================================================
 * A zero-dependency Node.js server designed to test LZ4 JS implementations.
 *
 * FEATURES:
 * 1. Adaptive Protocols: Automatically upgrades to HTTP/2 (HTTPS) if
 * 'localhost-privkey.pem' and 'localhost-cert.pem' are present.
 * Otherwise falls back to standard HTTP/1.1.
 * 2. Upload Handling: Accepts streaming POST uploads to /upload.
 * 3. Dynamic Streams: Generates infinite/large streams at /sample.lz4.
 * 4. Security Headers: Enforces COOP/COEP for SharedArrayBuffer.
 *
 * USAGE:
 * 1. (Optional) Generate Certs in this folder for HTTP/2 support:
 * openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' \
 * -keyout localhost-privkey.pem -out localhost-cert.pem
 * * 2. Run:
 * node examples/web/lz4.web-server.js
 *
 * @author LZ4-JS Team
 */

import http from 'http';
import http2 from 'http2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

// Import library source for server-side generation
import { LZ4 } from '../../src/lz4.js';

// --- Configuration ---
const PORT = 3000;
const UPLOAD_DIR_NAME = 'uploads';

// --- Environment Setup (ESM) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Directory Mappings ---
const WEB_ROOT = __dirname;                         // examples/web
const SRC_ROOT = path.join(__dirname, '../../src'); // root/src
const UPLOAD_DIR = path.join(process.cwd(), UPLOAD_DIR_NAME);
const CERT_KEY = path.join(__dirname, 'localhost-privkey.pem');
const CERT_CERT = path.join(__dirname, 'localhost-cert.pem');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// --- MIME Types ---
const MIME_TYPES = {
    '.html': 'text/html',
    '.js':   'text/javascript',
    '.mjs':  'text/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.lz4':  'application/octet-stream',
    '.map':  'application/json',
    '.ico':  'image/x-icon',
    '.svg':  'image/svg+xml'
};

const SECURITY_HEADERS = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cache-Control': 'no-store'
};

function writeHead(res, statusCode, headers = {}) {
    res.writeHead(statusCode, { ...headers, ...SECURITY_HEADERS });
}

// ============================================================================
// REQUEST HANDLER (Shared logic for HTTP/1.1 and HTTP/2)
// ============================================================================
const handleRequest = (req, res) => {
    // Log Request
    const protocol = req.httpVersionMajor >= 2 ? 'HTTP/2' : 'HTTP/1.1';
    console.log(`[${protocol}] ${req.method} ${req.url}`);

    const reqUrl = req.url.split('?')[0];

    // 1. POST /upload (Streaming)
    if (reqUrl === '/upload' && req.method === 'POST') {
        const timestamp = Date.now();
        const filename = `upload-${timestamp}.lz4`;
        const filePath = path.join(UPLOAD_DIR, filename);
        const fileStream = fs.createWriteStream(filePath);

        req.pipe(fileStream);

        req.on('end', () => {
            writeHead(res, 200, { 'Content-Type': 'text/plain' });
            res.end(`Upload complete: ${filename}`);
            console.log(`[INFO] File saved to: ${filePath}`);
        });

        req.on('error', (err) => {
            console.error(`[ERROR] Upload failed:`, err);
            writeHead(res, 500, { 'Content-Type': 'text/plain' });
            res.end('Upload failed.');
        });
        return;
    }

    // 2. GET /sample.lz4 (Dynamic Stream)
    else if (reqUrl === '/sample.lz4') {
        writeHead(res, 200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="server-stream.lz4"'
        });

        const nodeSourceStream = new Readable({
            read() {
                for (let i = 0; i < 1000; i++) {
                    this.push(`Line ${i}: This is some data generated live by the server.\n`);
                }
                this.push(null);
            }
        });

        try {
            // Bridge Node -> Web Streams -> LZ4 -> Node
            const webReadable = Readable.toWeb(nodeSourceStream);
            const compressedWebStream = webReadable.pipeThrough(LZ4.compressStream());
            const nodeCompressedStream = Readable.fromWeb(compressedWebStream);
            nodeCompressedStream.pipe(res);
            console.log('[INFO] Serving dynamic /sample.lz4 stream');
        } catch (err) {
            console.error('[ERROR] Stream Bridge Failed:', err);
            res.end();
        }
        return;
    }

    // 3. Static File Serving
    let filePath;
    if (reqUrl === '/') {
        filePath = path.join(WEB_ROOT, 'index.html');
    } else if (reqUrl.startsWith('/src/')) {
        filePath = path.join(SRC_ROOT, reqUrl.replace('/src/', ''));
    } else {
        filePath = path.join(WEB_ROOT, reqUrl);
    }

    const extname = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                writeHead(res, 404, { 'Content-Type': 'text/plain' });
                res.end(`404 Not Found: ${reqUrl}`);
            } else {
                writeHead(res, 500, { 'Content-Type': 'text/plain' });
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            writeHead(res, 200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
};

// ============================================================================
// SERVER STARTUP LOGIC
// ============================================================================
let server;
let protocol = 'http';
let secure = false;

// Check for SSL Certificates
if (fs.existsSync(CERT_KEY) && fs.existsSync(CERT_CERT)) {
    try {
        // Create HTTP/2 Secure Server
        server = http2.createSecureServer({
            key: fs.readFileSync(CERT_KEY),
            cert: fs.readFileSync(CERT_CERT),
            allowHTTP1: true // Important: Allows browsers to fallback if H2 fails
        }, handleRequest);
        protocol = 'https';
        secure = true;
    } catch (e) {
        console.error("Failed to load SSL keys, falling back to HTTP/1.1");
        server = http.createServer(handleRequest);
    }
} else {
    // Fallback to Standard HTTP/1.1
    server = http.createServer(handleRequest);
}

server.listen(PORT, () => {
    const url = `${protocol}://localhost:${PORT}`;
    console.log('=======================================================');
    console.log(`🚀 LZ4 Web Dev Server Running`);
    console.log('=======================================================');
    console.log(`• Protocol:      ${secure ? '\x1b[32mHTTP/2 (Secure)\x1b[0m' : '\x1b[33mHTTP/1.1 (Insecure)\x1b[0m'}`);
    console.log(`• Web Root:      ${WEB_ROOT}`);
    console.log(`• Source Root:   ${SRC_ROOT}`);
    console.log(`• Uploads:       ${UPLOAD_DIR}`);
    if (!secure) {
        console.log(`\x1b[33m[WARN] SSL certificates not found. Stream Uploads (duplex: 'half')`);
        console.log(`       will fail in Chrome. Using fallback mode.\x1b[0m`);
    }
    console.log('-------------------------------------------------------');
    console.log(`\x1b[36m👉 Open Browser: ${url}\x1b[0m`);
    console.log('=======================================================');
});