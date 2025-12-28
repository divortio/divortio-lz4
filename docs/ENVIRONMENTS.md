# Environment Support Guide

**LZ4-JS** is designed to be "Universal," meaning it runs seamlessly across **Node.js**, **Browsers**, and **Edge Runtimes** (like Cloudflare Workers). However, each environment has unique constraints and capabilities. This guide recommends the best APIs for each target.

---

## 1. Node.js

Node.js allows for both high-performance synchronous operations (simple scripts) and memory-efficient streaming (servers/pipelines).

### Recommended APIs
* **File System / Server:** Use **Streaming API**.
* **Simple Scripts:** Use **Sync API**.

| Method | Best For | Source | Example |
| :--- | :--- | :--- | :--- |
| `LZ4.compressStream()` | Piping large files (`fs`), HTTP responses, or processing data larger than RAM. | [`src/stream/streamCompress.js`](../src/stream/streamCompress.js) | [`examples/stream/lz4.stream.node-fs.js`](../examples/stream/lz4.stream.node-fs.js) |
| `LZ4.compress()` | Compressing small buffers (< 5MB) in memory immediately. | [`src/buffer/bufferCompress.js`](../src/buffer/bufferCompress.js) | [`examples/buffer/lz4.buffer.bytes.js`](../examples/buffer/lz4.buffer.bytes.js) |

**Note on Node Streams:**
Since Node.js v16+, the native `stream/web` API allows you to use standard `TransformStream` (which this library exports) directly in Node pipelines.
* **Modern Node (18+):** Use `Readable.toWeb(nodeStream)` or passing Web Streams to `pipeline`.
* **Files:** Use `fs.openAsBlob()` to get a Web-compatible `ReadableStream` from disk.

---

## 2. Browser (Web)

The browser environment is sensitive to main-thread blocking ("Jank"). We provide three distinct strategies to handle this.

### Strategy A: Web Workers (⭐⭐ Recommended)
**True Parallelism.** Moves all CPU-intensive work off the main thread.
* **Benefit:** Zero UI freezing, regardless of file size.
* **Battery Included:** We provide a drop-in Worker Client that handles spawning and message passing.
* **Optimization:** If you serve your page with `COOP` / `COEP` headers, we automatically use `SharedArrayBuffer` for **Zero-Copy** transfer (instant speed).

| API | Link |
| :--- | :--- |
| **Method** | `LZ4.compressWorker(data)` |
| **Source** | [`src/webWorker/lz4.worker.js`](../src/webWorker/lz4.worker.js) |
| **Example** | [`examples/web/lz4.web-worker.html`](../examples/web/lz4.web-worker.html) |

### Strategy B: Asynchronous (Time-Sliced)
**Main-Thread Safety.** If you cannot use Web Workers, this API processes data in small chunks (e.g., 512KB) and yields to the event loop every ~12ms.
* **Benefit:** Keeps the UI responsive (spinners keep spinning) without the complexity of Workers.
* **Trade-off:** Slower than Sync or Worker methods due to scheduling overhead.

| API | Link |
| :--- | :--- |
| **Method** | `LZ4.compressAsync(data)` |
| **Source** | [`src/stream/streamAsyncCompress.js`](../src/stream/streamAsyncCompress.js) |
| **Example** | [`examples/stream/lz4.stream.async-bytes.js`](../examples/stream/lz4.stream.async-bytes.js) |

### Strategy C: Synchronous
**Blocking.** Fastest execution but freezes the browser tab.
* **Recommendation:** Only use for very small data (< 1MB), such as strings or small JSON objects.

---

## 3. Cloudflare Workers / Edge

Edge environments have strict execution time limits and low memory ceilings. **Streaming is critical here.**

### Recommended API
* **Streaming API (`TransformStream`)**
* **Do NOT use:** Web Workers (usually unsupported) or large Sync buffers (OOM risk).

Cloudflare Workers natively support the `TransformStream` API. You can pipe a `fetch` response directly through LZ4 and back out to the client with minimal memory usage.

| Feature | Method | Source | Example |
| :--- | :--- | :--- | :--- |
| **Passthrough** | `fetch(url).body.pipeThrough(LZ4.compressStream())` | [`src/stream/streamCompress.js`](../src/stream/streamCompress.js) | [`examples/stream/lz4.stream.cloudflare-worker.js`](../examples/stream/lz4.stream.cloudflare-worker.js) |

---

## 4. Origin Private File System (OPFS)

For high-performance local storage in the browser, **OPFS** allows direct streaming to disk. This is superior to `localStorage` (which is synchronous and string-only).

* **Approach:** Use `LZ4.compressStream()` piped to a `FileSystemWritableFileStream`.
* **Benefit:** Store Gigabytes of compressed data locally without blocking the UI.

| Example File | Description |
| :--- | :--- |
| [`examples/web/lz4.stream.opfs.html`](../examples/web/lz4.stream.opfs.html) | Demonstrates writing compressed streams directly to the browser's private file system. |