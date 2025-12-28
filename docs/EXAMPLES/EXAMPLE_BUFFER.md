# Buffer API Examples

The **Buffer API** provides synchronous, blocking compression methods. These examples demonstrate how to handle raw binary data, strings, and JSON objects efficiently.

**Best for:**
* Small datasets (under 1MB).
* Node.js scripts or CLI tools.
* Situations where simplicity is preferred over non-blocking behavior.

---

## 1. Basic Bytes Compression

The fundamental usage of the library. Compresses a raw `Uint8Array` into an LZ4 Frame and decompresses it back.

* **Example Code:** [`../../examples/buffer/lz4.buffer.bytes.js`](../../examples/buffer/lz4.buffer.bytes.js)
* **Core Implementation:**
    * [`../../src/buffer/bufferCompress.js`](../../src/buffer/bufferCompress.js)
    * [`../../src/buffer/bufferDecompress.js`](../../src/buffer/bufferDecompress.js)
* **Primary Use Case:** Handling raw binary protocols, image data, or generic buffers in Node.js.

## 2. String Compression

Demonstrates the `compressString` helper, which automatically handles UTF-8 encoding/decoding. This removes the need to manually manage `TextEncoder` and `TextDecoder`.

* **Example Code:** [`../../examples/buffer/lz4.buffer.string.js`](../../examples/buffer/lz4.buffer.string.js)
* **Core Implementation:** [`../../src/shared/typeHandling.js`](../../src/shared/typeHandling.js)
* **Primary Use Case:** Compressing large text logs, XML/HTML documents, or long strings before database insertion.

## 3. JSON Object Compression

Demonstrates the `compressObject` helper. It serializes a JavaScript Object (or Array) to JSON, encodes it, and compresses it in a single pass.

* **Example Code:** [`../../examples/buffer/lz4.buffer.object.js`](../../examples/buffer/lz4.buffer.object.js)
* **Core Implementation:** [`../../src/shared/typeHandling.js`](../../src/shared/typeHandling.js)
* **Primary Use Case:** Snapshotting application state (e.g., Redux stores), caching complex API responses, or saving game save files.

## 4. LocalStorage Optimization

A real-world recipe showing how to compress a large object and encode it (Base64) for storage in the browser's `localStorage`.

* **Example Code:** [`../../examples/buffer/lz4.buffer.localstorage.js`](../../examples/buffer/lz4.buffer.localstorage.js)
* **Core Implementation:** [`../../src/lz4.js`](../../src/lz4.js)
* **Primary Use Case:** Storing large user sessions, preferences, or offline caches in the browser without hitting the 5MB string quota limit.