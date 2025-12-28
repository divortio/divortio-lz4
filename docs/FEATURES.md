# Features & Capabilities

**LZ4-JS** is not just a port of the C reference; it is a re-imagining of how a compression library should behave in the modern JavaScript ecosystem. We have exhausted nearly every optimization and convenience feature a developer might need, ensuring seamless operation across **Node.js**, **Browsers**, and **Edge Runtimes**.

---

## 1. Complete I/O Versatility

We provide four distinct execution models to fit any application architecture, from simple scripts to complex UI applications.

| Model | Description | Source Proof |
| :--- | :--- | :--- |
| **Synchronous** | The fastest option. Blocks the thread. Ideal for Node.js scripts or small data. | [`src/buffer/`](../src/buffer/) |
| **Streaming** | Uses standard **Web Streams** (`TransformStream`). Ideal for piping gigabytes of data with constant memory usage. | [`src/stream/`](../src/stream/) |
| **Asynchronous** | **Unique Feature.** Uses "Time Slicing" to compress data on the main thread without freezing the UI. | [`src/stream/scheduler.js`](../src/stream/scheduler.js) |
| **Web Worker** | True parallelism. Offloads CPU-intensive work to a background thread. | [`src/webWorker/`](../src/webWorker/) |

---

## 2. Extreme Performance Engineering

This library is heavily optimized for V8 (Chrome/Node.js) and SpiderMonkey (Firefox) JIT compilers.

### V8 "Smi" Optimization
We strictly enforce **32-bit integer math** using bitwise hints (`| 0`) and `Math.imul`. This ensures the JS engine uses "Small Integers" (Smi) instead of heap-allocated Doubles, drastically reducing garbage collection overhead.
* **Proof:** [`src/block/blockCompress.js`](../src/block/blockCompress.js) (See local aliases and bitwise shifts)
* **Proof:** [`src/xxhash32/xxhash32.js`](../src/xxhash32/xxhash32.js) (Hybrid 32-bit math)

### Zero-Copy Memory (SharedArrayBuffer)
Our Web Worker implementation automatically detects if `Cross-Origin-Opener-Policy` headers are active. If so, it upgrades to **SharedArrayBuffer**, allowing the worker to read data directly from the main thread's memory without copying it.
* **Proof:** [`src/webWorker/workerClient.js`](../src/webWorker/workerClient.js) ("Memory Optimization Strategy")
* **Example:** [`examples/web/lz4.web-worker.html`](../examples/web/lz4.web-worker.html)

### Hot Workspace Re-use
Streaming encoders maintain internal "scratch buffers" that are allocated once and reused for the lifetime of the stream. This prevents allocation thrashing (creating/destroying thousands of arrays per second) during high-throughput operations.
* **Proof:** [`src/shared/lz4Encode.js`](../src/shared/lz4Encode.js) (`this.scratchBuffer`)

---

## 3. Spec Compliance & Interoperability

We do not use a proprietary container format. We implement the official **LZ4 Frame Format**, ensuring your data is compatible with the standard C command-line tools.

* **LZ4 Frame Support:** Handles Magic Bytes, Block Independence flags, and Content Sizes.
    * **Source:** [`src/shared/lz4Base.js`](../src/shared/lz4Base.js)
* **Checksum Verification:** Includes a full implementation of **xxHash32** to verify data integrity (Header and Content checksums).
    * **Source:** [`src/xxhash32/xxhash32.js`](../src/xxhash32/xxhash32.js)
* **Golden Tests:** We validate our output against "Golden Vectors" derived directly from the spec.
    * **Proof:** [`tests/golden.test.mjs`](../tests/golden.test.mjs)

---

## 4. "Batteries Included" Developer Experience

We believe you shouldn't have to write boilerplate code for common tasks.

### Auto-Type Handling
Don't worry about `TextEncoder` or `JSON.stringify`. We provide helpers that handle serialization and encoding automatically.
* **Methods:** `compressString`, `compressObject`
* **Source:** [`src/shared/typeHandling.js`](../src/shared/typeHandling.js)
* **Example:** [`examples/buffer/lz4.buffer.object.js`](../examples/buffer/lz4.buffer.object.js)

### Zero-Config Web Worker
Usually, using a Web Worker requires creating a separate file, setting up message listeners, and managing `postMessage` complexity. We bundled all of that into a **Singleton Client** that exposes a simple Promise-based API.
* **Usage:** `await LZ4.compressWorker(data)`
* **Source:** [`src/webWorker/workerClient.js`](../src/webWorker/workerClient.js)

---

## 5. Universal Compatibility

One library, every environment.

* **Node.js:** Supports `Buffer`, `fs`, and modern `fs.openAsBlob`.
    * **Example:** [`examples/stream/lz4.stream.node-blob.js`](../examples/stream/lz4.stream.node-blob.js)
* **Browsers:** Works with DOM streams, `fetch`, and OPFS.
    * **Example:** [`examples/web/lz4.stream.opfs.html`](../examples/web/lz4.stream.opfs.html)
* **Edge (Cloudflare):** Fully compatible with lightweight Edge runtimes via standard APIs.
    * **Example:** [`examples/stream/lz4.stream.cloudflare-worker.js`](../examples/stream/lz4.stream.cloudflare-worker.js)