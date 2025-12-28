# Test Suite Reference

This document indexes the test coverage for **LZ4-JS**. The suite is built using the native Node.js Test Runner (`node:test`).

**How to Run Tests:**
```bash
npm test
```

*(Executes `tests/runAll.test.mjs`)*

---

## 1. Buffer API Tests (Synchronous)

Tests for the high-level blocking API used for simple buffer-to-buffer operations.

| Test File                                                                                | Source File                                                              | Description                                                                                                                                |
|------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| [`../tests/buffer/bufferCompress.test.mjs`](../tests/buffer/bufferCompress.test.mjs)     | [`../src/buffer/bufferCompress.js`](../src/buffer/bufferCompress.js)     | Validates that compression produces valid LZ4 frames with correct headers and magic numbers. Checks compression ratios on repetitive data. |
| [`../tests/buffer/bufferDecompress.test.mjs`](../tests/buffer/bufferDecompress.test.mjs) | [`../src/buffer/bufferDecompress.js`](../src/buffer/bufferDecompress.js) | Verifies round-trip integrity (Compress -> Decompress). Ensures errors are thrown for invalid magic numbers or corrupted data.             |

## 2. Stream API Tests (Web Streams)

Tests for the `TransformStream` implementations used in pipelines and network requests.

| Test File | Source File | Description |
| --- | --- | --- |
| [`../tests/stream/streamCompress.test.mjs`](../tests/stream/streamCompress.test.mjs) | [`../src/stream/streamCompress.js`](../src/stream/streamCompress.js) | Tests the compression stream by piping data through it and verifying the output matches valid frames. |
| [`../tests/stream/streamDecompress.test.mjs`](../tests/stream/streamDecompress.test.mjs) | [`../src/stream/streamDecompress.js`](../src/stream/streamDecompress.js) | Tests the decompression stream, specifically focusing on handling chunked/fragmented inputs (e.g., split headers) correctly. |

## 3. Shared Core Tests (Low-Level)

Unit tests for the internal logic shared across all execution modes (Sync, Stream, Async).

| Test File | Source File | Description |
| --- | --- | --- |
| [`../tests/shared/lz4Base.test.mjs`](../tests/shared/lz4Base.test.mjs) | [`../src/shared/lz4Base.js`](../src/shared/lz4Base.js) | Unit tests for binary utilities: Little-Endian integer reading/writing, input normalization, and Frame Header generation. |
| [`../tests/shared/lz4Encode.test.mjs`](../tests/shared/lz4Encode.test.mjs) | [`../src/shared/lz4Encode.js`](../src/shared/lz4Encode.js) | Tests the stateful Encoder class. Verifies it buffers data correctly until a block size is reached before emitting chunks. |
| [`../tests/shared/lz4Decode.test.mjs`](../tests/shared/lz4Decode.test.mjs) | [`../src/shared/lz4Decode.js`](../src/shared/lz4Decode.js) | Tests the stateful Decoder FSM (Finite State Machine). Crucial for verifying that partial inputs (byte-by-byte) don't break parsing. |

## 4. Checksum Tests (xxHash32)

Verification of the hashing algorithm required by the LZ4 Frame Specification.

| Test File | Source File | Description |
| --- | --- | --- |
| [`../tests/xxhash32/xxhash32.test.mjs`](../tests/xxhash32/xxhash32.test.mjs) | [`../src/xxhash32/xxhash32.js`](../src/xxhash32/xxhash32.js) | Validates the static hash function against known test vectors (e.g., "Hello World", Empty Buffer) to ensure standard compliance. |
| [`../tests/xxhash32/xxhash32.stream.test.mjs`](../tests/xxhash32/xxhash32.stream.test.mjs) | [`../src/xxhash32/xxhash32.stream.js`](../src/xxhash32/xxhash32.stream.js) | Ensures the streaming hasher produces the exact same output as the static hasher when data is fed in random chunks. |

## 5. Compliance & Utilities

Integration tests and helpers.

| Test File | Description |
| --- | --- |
| [`../tests/golden.test.mjs`](../tests/golden.test.mjs) | **Spec Compliance.** Tests against "Golden" hex vectors derived strictly from the official LZ4 Frame Format specification. Ensures interoperability with C/C++ tools. |
| [`../tests/runAll.test.mjs`](../tests/runAll.test.mjs) | The main entry point. Imports all other test files to register them with the global test harness. |
| [`../tests/utils.mjs`](../tests/utils.mjs) | Helper functions for generating random test data and asserting buffer equality. |
