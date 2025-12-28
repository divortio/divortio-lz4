# LZ4-JS API Reference

This document provides a detailed reference for the **LZ4-JS** library. It is divided into five main categories based on the execution model:

**Format:** [LZ4 Frame Format](https://github.com/lz4/lz4/blob/dev/doc/lz4_Frame_format.md).

**Compatibility:** Fully compatible with the `lz4` command-line utility.

1.  [Synchronous API](#1-synchronous-api) (Blocking, fastest for small data)
2.  [Streaming API](#2-streaming-api) (Memory efficient, Node & Web Streams)
3.  [Asynchronous API](#3-asynchronous-api) (Time-sliced, keeps UI responsive)
4.  [Raw API](#4-raw-api) (True parallelism, off-main-thread)
5. [Web Worker API](#5-web-worker-api) ( Raw LZ4 Blocks ie. No headers, no checksums)
6. [Type Handling Helpers](#6-type-handling-helpers) (Strings & Objects)


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
| `input` | `Uint8Array` | The raw binary data. |
| `options` | `Object` | (Optional) `{ blockIndependence: true, contentChecksum: true }` |

**Returns:** `Uint8Array` (Compressed LZ4 data)

**Bytes**
```javascript
import { LZ4 } from '../src/lz4.js';
const compressed = LZ4.compress(new Uint8Array([1, 2, 3]));

```
**String (Encoded)**
```javascript
import { LZ4 } from '../src/lz4.js';
const input = new TextEncoder().encode("Hello World");
const compressed = LZ4.compress(input);

```

### `LZ4.decompress(input)`

Decompresses LZ4 data synchronously.

**Note:** Unlike the Raw API, this **does not** require `originalSize` because the Frame format handles block sizing dynamically.


* **Source:** [`../src/buffer/bufferDecompress.js`](../src/buffer/bufferDecompress.js)
* **Example:** [`../examples/buffer/lz4.buffer.bytes.js`](../examples/buffer/lz4.buffer.bytes.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `Uint8Array` | The compressed LZ4 data. |

**Returns:** `Uint8Array` (Restored raw data)

```javascript
const restored = LZ4.decompress(compressed);
console.log(new TextDecoder().decode(restored)); // "Hello World"

```

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

**Stream File Compress & Upload**
```javascript
// Browser: Stream file upload
const fileStream = file.stream();
const compressedStream = fileStream.pipeThrough(LZ4.compressStream());
await fetch('/upload', { method: 'POST', body: compressedStream, duplex: 'half' });
```

**Stream File Download & Compress**

```javascript
const response = await fetch('data.json');
// Compress stream on the fly
const stream = response.body.pipeThrough(LZ4.compressStream());
```

### `LZ4.decompressStream()`

Creates a transform stream that decompresses data chunk-by-chunk.

* **Source:** [`../src/stream/streamDecompress.js`](../src/stream/streamDecompress.js)
* **Example:** [`../examples/web/lz4.stream.fetch-download.html`](../examples/web/lz4.stream.fetch-download.html)

**Returns:** `TransformStream<Uint8Array, Uint8Array>`

```javascript
const response = await fetch('data.lz4');
// Decompress stream on the fly
const decompressedStream = response.body.pipeThrough(LZ4.decompressStream());

```

---

## 3. Asynchronous API

**Best for:** Browser Main Thread (prevents UI freezing).

**Mechanism:** "Time Slicing" — processes data in small blocks and yields to the event loop to keep the UI responsive.

### `LZ4.compressAsync(input)`

Compresses data asynchronously without freezing the UI.

* **Source:** [`../src/stream/streamAsyncCompress.js`](../src/stream/streamAsyncCompress.js)
* **Example:** [`../examples/stream/lz4.stream.async-bytes.js`](../examples/stream/lz4.stream.async-bytes.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `Uint8Array` | The raw binary data. |

**Returns:** `Promise<Uint8Array>`

```javascript
const compressed = await LZ4.compressAsync(largeBuffer);

```

### `LZ4.decompressAsync(input)`

Decompresses data asynchronously without freezing the UI.

* **Source:** [`../src/stream/streamAsyncDecompress.js`](../src/stream/streamAsyncDecompress.js)
* **Example:** [`../examples/stream/lz4.stream.async-bytes.js`](../examples/stream/lz4.stream.async-bytes.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `Uint8Array` | The compressed LZ4 data. |


**Returns:** `Promise<Uint8Array>`

```javascript
const restored = await LZ4.decompressAsync(compressed);
```

---


## 4. Raw API

**Format:** Raw LZ4 Blocks (No headers, no checksums).

**Best for:** Advanced users, custom protocols, or embedding inside other container formats.

### `LZ4.compressRaw(input, output, hashTable)`

Compresses a single block directly into a destination buffer.

* **Source:** [`../src/block/blockCompress.js`](../src/block/blockCompress.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `Uint8Array` | Raw data. |
| `output` | `Uint8Array` | Destination buffer (must be large enough). |
| `hashTable` | `Uint16Array` | A reusable 16KB hash table (`new Uint16Array(16384)`). |

**Returns:** `number` (Bytes written to output).

```javascript
const hashTable = new Uint16Array(16384);
const output = new Uint8Array(LZ4.compressBound(input.length));
const written = LZ4.compressRaw(input, output, hashTable);
const validOutput = output.subarray(0, written);
```

### `LZ4.decompressRaw(input, output)`

Decompresses a single block directly into a destination buffer.

* **Source:** [`../src/block/blockDecompress.js`](../src/block/blockDecompress.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `Uint8Array` | Compressed block data. |
| `output` | `Uint8Array` | Destination buffer (must be allocated to exactly `originalSize`). |

**Returns:** `number` (Bytes written).

```javascript
const output = new Uint8Array(originalSize); // You must know this size!
const bytesWritten = LZ4.decompressRaw(compressedBlock, output);
```

----

## 5. Web Worker API

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

### `LZ4.decompressWorker(input)`

Spawns (or reuses) a background worker to decompress data.

* **Client Logic:** [`../src/webWorker/workerClient.js`](../src/webWorker/workerClient.js)
* **Worker Logic:** [`../src/webWorker/lz4.worker.js`](../src/webWorker/lz4.worker.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `Uint8Array` | The compressed LZ4 data. |


**Returns:** `Promise<Uint8Array>`

---

## 6. Type Handling Helpers

Batteries-included wrappers for handling non-binary types: `String`, `Array`, `Object`, `Number`

### `LZ4.compressString(str)`

Encodes a string to UTF-8 and compresses it.

* **Source:** [`../src/shared/typeHandling.js`](../src/shared/typeHandling.js)
* **Example:** [`../examples/buffer/lz4.buffer.string.js`](../examples/buffer/lz4.buffer.string.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `str` | `string` | The text to compress. |

**Returns:** `Uint8Array`

```javascript
const bytes = LZ4.compressString("Hello World");
```

### `LZ4.decompressString(input, )`

Decompresses LZ4 data and decodes the UTF-8 bytes to a string.

* **Source:** [`../src/shared/typeHandling.js`](../src/shared/typeHandling.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `Uint8Array` | Compressed data. |


**Returns:** `string`

```javascript
const str = LZ4.decompressString(bytes);
```

### `LZ4.compressObject(obj)`

Serializes an object/array to JSON, encodes to UTF-8, and compresses.

* **Source:** [`../src/shared/typeHandling.js`](../src/shared/typeHandling.js)
* **Example:** [`../examples/buffer/lz4.buffer.object.js`](../examples/buffer/lz4.buffer.object.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `obj` | `object` | JSON-serializable object or array. |

**Returns:** `Uint8Array`

```javascript
const bytes = LZ4.compressObject({ id: 1, name: "Test" });
```

### `LZ4.decompressObject(input)`

Decompresses, decodes, and parses JSON back into an object.

* **Source:** [`../src/shared/typeHandling.js`](https://www.google.com/search?q=../src/shared/typeHandling.js)

| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `Uint8Array` | Compressed data. |

**Returns:** `object`

```javascript
const obj = LZ4.decompressObject(bytes);
```



-----