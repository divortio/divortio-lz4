# Stream API Examples

The **Streaming API** allows for memory-efficient processing of datasets larger than available RAM. It uses the standard **Web Streams API** (`TransformStream`), making it compatible with Node.js, Browsers, Deno, and Edge environments (like Cloudflare Workers).

**Best for:**
* Large file I/O (Gigabytes of data).
* Network requests (HTTP Streaming).
* Cloudflare Workers / Edge computing.
* Preventing UI freezing on the main thread (via Async wrappers).

---

## 1. Node.js File System (Standard Pipe)

The classic Node.js pattern. Reads a file from disk, compresses it through a stream, and writes it back to disk.

* **Example Code:** [`../../examples/stream/lz4.stream.node-fs.js`](../../examples/stream/lz4.stream.node-fs.js)
* **Core Implementation:**
    * [`../../src/stream/streamCompress.js`](../../src/stream/streamCompress.js)
    * [`../../src/stream/streamDecompress.js`](../../src/stream/streamDecompress.js)
* **Primary Use Case:** Server-side file processing, log rotation compression, or backups.

## 2. Node.js Blob Streaming (Modern)

Demonstrates compatibility with Node.js 19.8+ `fs.openAsBlob()`. This treats a file on disk as a Web-standard `Blob`, allowing it to be streamed using Web APIs instead of legacy Node streams.

* **Example Code:** [`../../examples/stream/lz4.stream.node-blob.js`](../../examples/stream/lz4.stream.node-blob.js)
* **Core Implementation:** [`../../src/stream/streamCompress.js`](../../src/stream/streamCompress.js)
* **Primary Use Case:** Modern Node.js applications that share logic with frontend code (Universal JS).

## 3. Cloudflare Worker (Edge Computing)

A simulation of a Cloudflare Worker request handler. It intercepts a `fetch` request, compresses the response body on-the-fly using `TransformStream`, and forwards it to the client.

* **Example Code:** [`../../examples/stream/lz4.stream.cloudflare-worker.js`](../../examples/stream/lz4.stream.cloudflare-worker.js)
* **Core Implementation:** [`../../src/stream/streamCompress.js`](../../src/stream/streamCompress.js)
* **Primary Use Case:** Reducing bandwidth costs and improving load times at the Edge (CDN).

## 4. In-Memory Stream Pipeline

Shows how to use `stream/promises` (`pipeline`) to manage stream flow control and error handling robustly in Node.js.

* **Example Code:** [`../../examples/stream/lz4.stream.bytes.js`](../../examples/stream/lz4.stream.bytes.js)
* **Core Implementation:** [`../../src/stream/streamCompress.js`](../../src/stream/streamCompress.js)
* **Primary Use Case:** Processing data generated in memory (reports, exports) before sending it over the network.

## 5. Asynchronous Time-Slicing (Non-Blocking)

Demonstrates the **Async API** (`compressAsync` / `decompressAsync`). Unlike standard streams, this example processes a buffer in chunks and yields to the event loop (every ~12ms) to prevent freezing the main thread.

* **Example Code:** [`../../examples/stream/lz4.stream.async-bytes.js`](../../examples/stream/lz4.stream.async-bytes.js)
* **Core Implementation:**
    * [`../../src/stream/streamAsyncCompress.js`](../../src/stream/streamAsyncCompress.js)
    * [`../../src/stream/scheduler.js`](../../src/stream/scheduler.js)
* **Primary Use Case:** Compressing medium-sized data (e.g., 50MB) in the browser's main thread without causing "Jank" (UI stutter).