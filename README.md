# Divortio LZ4

A high-performance, spec-compliant LZ4 implementation for the modern JavaScript ecosystem. 

**Divortio LZ4** is designed to be universal, operating seamlessly across **Node.js**, **Browsers**, **Web Workers**, and **Edge Runtimes** (Cloudflare Workers).

Maximizes performance through V8-specific optimizations (Smi 32-bit math), memory efficiency (Zero-Copy SharedArrayBuffer), and architectural flexibility (Sync, Async, Streaming).

---

## 🚀 Key Capabilities

* **Universal Compatibility:** Runs in Node.js (16+), Deno, Browsers, and Cloudflare Workers.
* **Complete I/O Suite:** * **[Synchronous](./docs/API.md#1-synchronous-api):** Fastest for small data.
    * **[Streaming](./docs/API.md#2-streaming-api):** Web Streams (`TransformStream`) for unlimited dataset sizes.
    * **[Asynchronous](./docs/API.md#3-asynchronous-api):** Time-sliced processing to prevent UI freezing on the main thread.
    * **[Web Worker](./docs/API.md#4-web-worker-api):** True multi-threaded offloading with `SharedArrayBuffer` support.
* **Spec Compliant:** Produces and consumes official [LZ4 Frames](https://github.com/lz4/lz4/blob/dev/doc/lz4_Frame_format.md), compatible with standard C tools.
* **Zero Dependencies:** Lightweight and focused.

👉 **[Read the Full Feature Breakdown](./docs/FEATURES.md)**

---

## 📦 Installation

```bash
npm install divortio-lz4

```

---

## ⚡ Quick Start

### 1. Synchronous (Simple Buffers)

Best for small payloads, scripts, or when simplicity is required.

```javascript
import { LZ4 } from 'divortio-lz4';

const input = new TextEncoder().encode("Hello LZ4!");
const compressed = LZ4.compress(input);
const restored = LZ4.decompress(compressed);

```

### 2. Streaming (Files & Network)

Best for large files, HTTP responses, or memory-constrained environments.

```javascript
// Node.js Example
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { LZ4 } from 'divortio-lz4';

await pipeline(
    createReadStream('input.log'),
    LZ4.compressStream(), // Web TransformStream
    createWriteStream('input.log.lz4')
);

```

---

## 📚 Documentation

We provide extensive documentation to help you integrate LZ4 into any environment.

| Document | Description |
| --- | --- |
| **[API Reference](./docs/API.md)** | Technical details for all methods (Sync, Stream, Async, Raw). |
| **[Environment Guide](./docs/ENVIRONMENTS.md)** | Best practices for Node.js vs. Web vs. Edge. |
| **[Features & Internals](./docs/FEATURES.md)** | Deep dive into V8 optimizations and spec compliance. |
| **[Test Coverage](./docs/TESTS.md)** | Overview of our testing strategy and spec validation. |

---

## 🧪 Examples

We have compiled a library of "recipes" for common use cases.

* **[Buffer Examples](./examples/buffer/):** Simple bytes, Strings, JSON Objects, LocalStorage.
* **[Stream Examples](./examples/stream/):** Node.js Pipelines, Cloudflare Workers, Async Time-Slicing.
* **[Web Examples](./examples/web/):** Browser File Processing, Fetch Streaming, OPFS, Web Workers.

👉 **[View the Examples Index](./docs/EXAMPLES.md)**

---

## 📂 Project Structure

This project is organized to separate concerns between the core logic, environment-specific adapters, and documentation.

```text
/
├── src/
│   ├── block/       # Low-level LZ4 Block processing (Raw)
│   ├── buffer/      # Synchronous Frame API
│   ├── stream/      # Web Streams & Async Schedulers
│   ├── webWorker/   # Worker Controller & Client
│   ├── shared/      # Common utilities (Constants, Encoding)
│   └── xxhash32/    # Checksum implementation
├── docs/            # Detailed documentation & guides
├── examples/        # Runnable demos for Node & Web
└── tests/           # Unit & Integration tests

```

---

## 🛠️ Development & Testing

This project uses the native Node.js Test Runner.

```bash
# Run all tests
npm test

# Run the Web Development Server (for Browser examples)
npm start

```

### Web Dev Server

Some browser features (like `SharedArrayBuffer` or Full-Duplex Streaming) require specific HTTP headers (`COOP`, `COEP`) or HTTPS. We provide a zero-dependency server to test these features locally.

* **Source:** [`examples/web/lz4.web-server.js`](./examples/web/lz4.web-server.js)
* **Documentation:** [`docs/EXAMPLES/EXAMPLE_WEB.md`](./docs/EXAMPLES/EXAMPLE_WEB.md)

---

