Here is the raw markdown content for `docs/EXAMPLES/EXAMPLE_WEB.md`.

```markdown
# Web & Browser Examples

The **Web Examples** demonstrate how to use LZ4-JS in modern browser environments. These examples cover common patterns like file processing, network streaming, persistent storage (OPFS), and multi-threaded Web Workers.

**Prerequisite:**
These examples require the included **Dev Server** to run correctly. Opening the HTML files directly (`file://`) will fail due to CORS and Security constraints.

---

## 1. The Development Server

A zero-dependency Node.js server designed specifically to test high-performance Web APIs.

* **File:** [`../../examples/web/lz4.web-server.js`](../../examples/web/lz4.web-server.js)
* **Usage:** `node examples/web/lz4.web-server.js`
* **Features:**
    * **Virtual Mapping:** Serves `examples/web` as the root, but maps `/src` to the project source.
    * **Security Headers:** Enforces `COOP` (Cross-Origin-Opener-Policy) and `COEP` (Cross-Origin-Embedder-Policy). This is **required** to unlock `SharedArrayBuffer` for the Web Worker example.
    * **HTTP/2 Support:** Automatically upgrades to HTTP/2 if SSL certificates are found (required for full-duplex upload streaming).

### Setting up HTTP/2 (Recommended)
Chrome requires secure connections (HTTPS) to enable full-duplex streaming (`duplex: 'half'`). Run this command in `examples/web/` to generate self-signed certificates:
```bash
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' \
  -keyout localhost-privkey.pem -out localhost-cert.pem

```

*When you visit `https://localhost:3000`, your browser will warn about the certificate. Click "Advanced -> Proceed" to accept it.*

---

## 2. Browser File Compression

A client-side tool that selects a local file, compresses it in the browser using a Stream, and offers the `.lz4` file for download. No data is sent to the server.

* **Example Code:**[`../../examples/web/lz4.stream.browser-file.html`](../../examples/web/lz4.stream.browser-file.html)
* **Core API:** `LZ4.compressStream()`
* **Primary Use Case:** Purely client-side tools, exporting compressed logs, or saving bandwidth before uploading.

## 3. Stream Upload (Client to Server)

Compresses a file on the fly as it is being uploaded to the server.

* **Example Code:** [`../../examples/web/lz4.stream.upload-server.html`](../../examples/web/lz4.stream.upload-server.html)
* **Server Logic:** Handles `POST /upload` requests and writes the incoming compressed stream to disk.
* **Core API:** `fetch(..., { body: stream, duplex: 'half' })`
* **Note:** If the server is running on HTTP/1.1 (Insecure), this example will fall back to a buffered upload because browsers block streaming requests on insecure origins.

## 4. Stream Download (Server to Client)

Fetches a compressed stream from the server and decompresses it instantly as bytes arrive. The server generates an infinite/large stream dynamically at `/sample.lz4`.

* **Example Code:**  [`../../examples/web/lz4.stream.fetch-download.html`](../../examples/web/lz4.stream.fetch-download.html)
* **Core API:** `response.body.pipeThrough(LZ4.decompressStream())`
* **Primary Use Case:** Consuming large compressed datasets or logs without waiting for the entire download to finish.

## 5. Origin Private File System (OPFS)

Demonstrates the modern **OPFS API**, which allows websites to store gigabytes of data persistently without blocking the main thread.

* **Example Code:** [`../../examples/web/lz4.stream.opfs.html`](../../examples/web/lz4.stream.opfs.html)
* **Core API:** `navigator.storage.getDirectory()`
* **Primary Use Case:** High-performance local caching, offline editing of large files, or saving application state.

## 6. Web Workers (Multi-Threading)

Offloads compression tasks to a background thread to keep the UI responsive. Includes a "jank test" spinner to prove the main thread remains unblocked.

* **Example Code:** [`../../examples/web/lz4.web-worker`](../../examples/web/lz4.web-worker.html)
* **Core API:** `LZ4.compressWorker()` / `LZ4.decompressWorker()`
* **Optimization:** If the server is sending the correct COOP/COEP headers, this example automatically uses `SharedArrayBuffer` for zero-copy data transfer.
