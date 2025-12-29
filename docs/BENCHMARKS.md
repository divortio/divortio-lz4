# Performance Benchmarks

**Divortio LZ4** is engineered for raw speed. By strictly adhering to 32-bit integer arithmetic ("Smi") and eliminating garbage collection in the hot path, we have achieved a Pure JavaScript implementation that rivals—and often exceeds—native C++ bindings.

## 💻 Test Environment
We intentionally benchmark on **legacy hardware** to demonstrate efficiency. If it flies on a 10-year-old laptop, it will perform instant-speed operations on modern server architecture.

* **Machine:** MacBook Pro (Retina, 15-inch, Mid 2015)
* **CPU:** 2.5 GHz Quad-Core Intel Core i7 (Haswell architecture)
* **Runtime:** Node.js v24.10.0 (V8 JIT enabled)
* **Comparison:** `divortio-lz4` (Pure JS) vs `zlib` (Node.js C++ bindings)

---

## 🚀 Summary: The "Pure JS" Advantage

Despite the overhead typically associated with JavaScript, **Divortio LZ4** outperforms native Gzip bindings by nearly **2x** in compression speeds. This is due to the heavy cost of crossing the C++/JS boundary (context switching) in Node.js, which our Pure JS implementation avoids entirely.

| Operation | Input Size | LZ4 (Pure JS) | Gzip (C++ Native) | Delta |
| :--- | :--- | :--- | :--- | :--- |
| **Compression** | 25 MB | **484 MB/s** | 257 MB/s | <mark>**1.9x Faster**</mark> |
| **Decompression** | 25 MB | **459 MB/s** | 583 MB/s | *0.8x Slower* |
| **Round Trip** | 10 MB | **224 MB/s** | 182 MB/s | **1.2x Faster** |

---

## 🔍 Deep Dive & Insights

### 1. Compression (Encoding)
*Scenario: Real-time logging, metrics firehoses, or high-throughput HTTP streams.*

**Insight:** This is our strongest win. V8's TurboFan optimizer is able to inline our Smi-based arithmetic directly into machine code. Conversely, `zlib` forces Node.js to serialize data, cross into C++, compress, and copy back—a massive penalty for high-frequency operations.

| Input Size | Engine | Time (ms) | Throughput |
| :--- | :--- | :--- | :--- |
| **1 MB** | **Divortio LZ4** | **2.23 ms** | **449 MB/s** |
| | Gzip (C++) | 3.95 ms | 253 MB/s |
| **25 MB** | **Divortio LZ4** | **51.62 ms** | **484 MB/s** |
| | Gzip (C++) | 97.17 ms | 257 MB/s |

### 2. Decompression (Decoding)
*Scenario: Reading configuration, restoring cache state, or processing incoming network packets.*

**Insight:** While Native C++ holds a slight edge here (due to raw `memcpy` optimizations available to C++), Divortio LZ4 maintains a consistent **450+ MB/s** throughput. On this 2015 hardware, that saturates the SATA SSD limits; on modern NVMe drives, this bottleneck effectively disappears.

| Input Size | Engine | Time (ms) | Throughput |
| :--- | :--- | :--- | :--- |
| **25 MB** | Divortio LZ4 | 54.42 ms | 459 MB/s |
| | **Gzip (C++)** | 42.85 ms | 583 MB/s |

### 3. Round-Trip Latency
*Scenario: The full Request/Response lifecycle.*

**Insight:** For the complete cycle (Compress -> Decompress), LZ4 wins. The massive gains in compression speed outweigh the slight lag in decompression, resulting in a **20% overall faster lifecycle** compared to Gzip.

| Input Size | Engine | Total Time | Verdict |
| :--- | :--- | :--- | :--- |
| **10 MB** | **Divortio LZ4** | **44.55 ms** | 🏆 **Winner** |
| | Gzip (C++) | 54.78 ms | |

---

## 🧪 Reproduce these benchmarks

Performance varies by hardware. On modern Apple Silicon (M1/M2/M3) or high-end Intel/AMD server chips, we expect these numbers to be significantly higher.

Run the suite on your machine:

```bash
# Run all benchmarks
npm run benchmark