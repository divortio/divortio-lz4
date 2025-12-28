# Divortio LZ4 Documentation

Welcome to the documentation for **Divortio LZ4**, a high-performance, spec-compliant LZ4 implementation for the modern JavaScript ecosystem. This library is designed to be "Universal," running seamlessly across Node.js, Browsers, Web Workers, and Edge Runtimes.

Below is an index of the available documentation to help you get started, optimize your usage, and understand the library's capabilities.

---

## 📚 Documentation Index

### 1. [Features & Capabilities](./FEATURES.md)
Start here to understand what makes this library unique.
* **Highlights:** V8 optimizations, Spec Compliance, Zero-Copy Web Workers, and "Batteries-Included" helpers.
* **Why use this?** Learn about our architectural decisions and performance engineering.

### 2. [API Reference](./API.md)
The complete technical reference for all public methods.
* **Standard API:** `compress`, `decompress` (Frame Format).
* **Streaming API:** `compressStream`, `decompressStream` (Web Streams).
* **Async API:** Non-blocking methods for the main thread.
* **Raw API:** Low-level block access.

### 3. [Environment Guide](./ENVIRONMENTS.md)
Best practices and recommended APIs for your specific runtime.
* **Node.js:** When to use Streams vs. Buffers.
* **Browser:** Strategies for preventing UI freezing (Workers vs. Async).
* **Edge:** Using TransformStreams in Cloudflare Workers.

### 4. [Examples Library](./EXAMPLES.md)
A curated list of "recipes" and runnable demos.
* **Buffer Examples:** Simple synchronous usage.
* **Stream Examples:** Node.js pipelines and Edge workers.
* **Web Examples:** File processing, Uploads, OPFS, and Web Workers.

### 5. [Test Suite](./TESTS.md)
Information about our testing methodology.
* **Coverage:** Unit tests, Stream tests, and "Golden Vector" spec compliance verification.
* **Usage:** How to run the test runner.

---

## Quick Links

* **Source Code:** [`../src/`](../src/)
* **Examples Source:** [`../examples/`](../examples/)
* **Project Root:** [`../`](../)