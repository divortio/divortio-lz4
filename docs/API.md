# LZ4-JS API Reference

This document provides a detailed reference for the **LZ4-JS** library. It is divided into five main categories based on the execution model:

1.  [Synchronous API](#1-synchronous-api) (Blocking, fastest for small data)
2.  [Streaming API](#2-streaming-api) (Memory efficient, Node & Web Streams)
3.  [Asynchronous API](#3-asynchronous-api) (Time-sliced, keeps UI responsive)
4.  [Web Worker API](#4-web-worker-api) (True parallelism, off-main-thread)
5.  [Type Handling Helpers](#5-type-handling-helpers) (Strings & Objects)

---

## 1. Synchronous API

**Best for:** Node.js scripts, small buffers (< 1MB), or inside Workers.
**Warning:** Blocks the event loop. Do not use for large files on the UI thread.

### `LZ4.compress(input)`

Compresses a raw buffer synchronously.

* **Source:** [`../src/buffer/bufferCompress.js`](../src/buffer/bufferCompress.js)
* **Example:** [`../examples/buffer/lz4.buffer.bytes.js`](../examples/buffer/lz4.buffer.bytes.js)

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `input` | `Uint8Array` | The raw binary data to compress. |

**Returns:** `Uint8Array` (Compressed LZ4 data)

```javascript
import { LZ4 } from '../src/lz4.js';
const compressed = LZ4.compress(new Uint8Array([1, 2, 3]));

```

### `LZ4.decompress(input, originalSize)`

Decompresses LZ4 data synchronously.

* **Source:** [`../src/buffer/bufferDecompress.js`](../src/buffer/bufferDecompress.js)
* **Example:** [`../examples/buffer/lz4.buffer.bytes.js`](../examples/buffer/lz4.buffer.bytes.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `Uint8Array` | The compressed LZ4 data. |
| `originalSize` | `number` | **Required.** The byte length of the uncompressed data. |

**Returns:** `Uint8Array` (Restored raw data)

---

## 2. Streaming API

**Best for:** Processing huge files, Network requests (Fetch), Node.js pipelines, Cloudflare Workers.
**Standard:** Uses Web Streams API (`TransformStream`).

### `LZ4.compressStream()`

Creates a transform stream that compresses data chunk-by-chunk.

* **Source:** [`../src/stream/streamCompress.js`](../src/stream/streamCompress.js)
* **Example (Browser):** [`../examples/web/lz4.stream.upload-server.html`](../examples/web/lz4.stream.upload-server.html)
* **Example (Node):** [`../examples/stream/lz4.stream.fs.js`](../examples/stream/lz4.stream.fs.js)

**Returns:** `TransformStream<Uint8Array, Uint8Array>`

```javascript
// Browser: Stream file upload
const fileStream = file.stream();
const compressedStream = fileStream.pipeThrough(LZ4.compressStream());
await fetch('/upload', { method: 'POST', body: compressedStream, duplex: 'half' });

```

### `LZ4.decompressStream()`

Creates a transform stream that decompresses data chunk-by-chunk.

* **Source:** [`../src/stream/streamDecompress.js`](../src/stream/streamDecompress.js)
* **Example:** [`../examples/web/lz4.stream.fetch-download.html`](../examples/web/lz4.stream.fetch-download.html)

**Returns:** `TransformStream<Uint8Array, Uint8Array>`

---

## 3. Asynchronous API

**Best for:** Browser Main Thread when Web Workers are overkill or unavailable.
**Mechanism:** "Time Slicing" — processes data in small blocks and yields to the event loop to keep the UI responsive.

### `LZ4.compressAsync(input)`

Compresses data asynchronously without freezing the UI.

* **Source:** [`../src/stream/streamAsyncCompress.js`](../src/stream/streamAsyncCompress.js)
* **Example:** [`../examples/stream/lz4.stream.async-bytes.js`](../examples/stream/lz4.stream.async-bytes.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `Uint8Array` | The raw binary data. |

**Returns:** `Promise<Uint8Array>`

### `LZ4.decompressAsync(input, originalSize)`

Decompresses data asynchronously without freezing the UI.

* **Source:** [`../src/stream/streamAsyncDecompress.js`](../src/stream/streamAsyncDecompress.js)
* **Example:** [`../examples/stream/lz4.stream.async-bytes.js`](../examples/stream/lz4.stream.async-bytes.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `Uint8Array` | The compressed LZ4 data. |
| `originalSize` | `number` | The uncompressed byte length. |

**Returns:** `Promise<Uint8Array>`

---

## 4. Web Worker API

**Best for:** Heavy CPU tasks in browsers. True parallelism.
**Optimization:** Automatically uses `SharedArrayBuffer` if `Cross-Origin-Opener-Policy` headers are present (Zero-Copy).

### `LZ4.compressWorker(input)`

Spawns (or reuses) a background worker to compress data.

* **Client Logic:** [`../src/webWorker/workerClient.js`](../src/webWorker/workerClient.js)
* **Worker Logic:** [`../src/webWorker/lz4.worker.js`](../src/webWorker/lz4.worker.js)
* **Example:** [`../examples/web/lz4.web-worker.html`](../examples/web/lz4.web-worker.html)

| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `Uint8Array` | The raw binary data. |

**Returns:** `Promise<Uint8Array>`

### `LZ4.decompressWorker(input, originalSize)`

Spawns (or reuses) a background worker to decompress data.

* **Client Logic:** [`../src/webWorker/workerClient.js`](../src/webWorker/workerClient.js)
* **Worker Logic:** [`../src/webWorker/lz4.worker.js`](../src/webWorker/lz4.worker.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `Uint8Array` | The compressed LZ4 data. |
| `originalSize` | `number` | The uncompressed byte length. |

**Returns:** `Promise<Uint8Array>`

---

## 5. Type Handling Helpers

Batteries-included wrappers for handling non-binary types like Strings and JSON Objects.

### `LZ4.compressString(str)`

Encodes a string to UTF-8 and compresses it.

* **Source:** [`../src/shared/typeHandling.js`](../src/shared/typeHandling.js)
* **Example:** [`../examples/buffer/lz4.buffer.string.js`](../examples/buffer/lz4.buffer.string.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `str` | `string` | The text to compress. |

**Returns:** `Uint8Array`

### `LZ4.decompressString(input, originalByteLength)`

Decompresses LZ4 data and decodes the UTF-8 bytes to a string.

* **Source:** [`../src/shared/typeHandling.js`](../src/shared/typeHandling.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `Uint8Array` | Compressed data. |
| `originalByteLength` | `number` | The length of the **UTF-8 buffer** (not character count). |

**Returns:** `string`

### `LZ4.compressObject(obj)`

Serializes an object/array to JSON, encodes to UTF-8, and compresses.

* **Source:** [`../src/shared/typeHandling.js`](../src/shared/typeHandling.js)
* **Example:** [`../examples/buffer/lz4.buffer.object.js`](../examples/buffer/lz4.buffer.object.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `obj` | `object` | JSON-serializable object or array. |

**Returns:** `Uint8Array`

### `LZ4.decompressObject(input, originalByteLength)`

Decompresses, decodes, and parses JSON back into an object.

* **Source:** [`../src/shared/typeHandling.js`](https://www.google.com/search?q=../src/shared/typeHandling.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `Uint8Array` | Compressed data. |
| `originalByteLength` | `number` | The length of the serialized JSON buffer. |

**Returns:** `object`

