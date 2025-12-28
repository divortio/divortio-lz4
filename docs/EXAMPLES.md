# LZ4-JS Examples Index

Welcome to the **LZ4-JS** example library. This directory contains a comprehensive set of "recipes" demonstrating how to use the library across different environments (Node.js, Browsers, Workers, Edge).

The examples are organized into three main categories:

1.  [**Buffer Examples**](#1-buffer-examples-synchronous) (Synchronous, In-Memory)
2.  [**Stream Examples**](#2-stream-examples-pipeline) (Streaming, Edge, Async)
3.  [**Web Examples**](#3-web-examples-browser) (DOM, Workers, OPFS)

---

## 1. Buffer Examples (Synchronous)

**Documentation:** [`EXAMPLES/EXAMPLE_BUFFER.md`](./EXAMPLES/EXAMPLE_BUFFER.md)

Best for small datasets (< 1MB), simple Node.js scripts, or when you need immediate results. These methods block the main thread.

* **Basic Bytes** (`lz4.buffer.bytes.js`): Simple compression of raw `Uint8Array` buffers.
* **Strings** (`lz4.buffer.string.js`): Automatic UTF-8 encoding and compression of text.
* **JSON Objects** (`lz4.buffer.object.js`): One-step serialization and compression of JS objects.
* **LocalStorage Optimization** (`lz4.buffer.localstorage.js`): How to store large user sessions in the browser by compressing to Base64.

---

## 2. Stream Examples (Pipeline)

**Documentation:** [`EXAMPLES/EXAMPLE_STREAM.md`](./EXAMPLES/EXAMPLE_STREAM.md)

Best for large files, network I/O, Cloudflare Workers, or preventing memory spikes. Uses the standard **Web Streams API** (`TransformStream`).

* **Node.js File System** (`lz4.stream.node-fs.js`): Piping files from disk to disk.
* **Node.js Blobs** (`lz4.stream.node-blob.js`): Using modern Node 19+ `fs.openAsBlob()` for web-standard streams.
* **Cloudflare Workers** (`lz4.stream.cloudflare-worker.js`): Edge computing example intercepting and compressing HTTP responses.
* **In-Memory Pipelines** (`lz4.stream.bytes.js`): Managing flow control for generated data.
* **Async Time-Slicing** (`lz4.stream.async-bytes.js`): "Non-blocking" compression on the main thread using micro-yields.

---

## 3. Web Examples (Browser)

**Documentation:** [`EXAMPLES/EXAMPLE_WEB.md`](./EXAMPLES/EXAMPLE_WEB.md)

Best for modern web applications. These examples require the included **Dev Server** (`examples/web/lz4.web-server.js`) to handle headers like `COOP`/`COEP` and HTTP/2.

* **Browser File Compression** (`lz4.stream.browser-file.html`): Compress a local file and download it without uploading to a server.
* **Streaming Upload** (`lz4.stream.upload-server.html`): POST a stream directly to the server (requires HTTP/2).
* **Streaming Download** (`lz4.stream.fetch-download.html`): Fetch a compressed stream and decompress it on the fly.
* **OPFS Storage** (`lz4.stream.opfs.html`): High-performance persistent storage using the Origin Private File System.
* **Web Workers** (`lz4.web-worker.html`): True multi-threaded compression using `SharedArrayBuffer` for zero-copy transfers.