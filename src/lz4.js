import {compressBuffer} from './buffer/bufferCompress.js';
import {decompressBuffer} from './buffer/bufferDecompress.js';
import {createCompressStream} from "./stream/streamCompress.js";
import {createDecompressStream} from "./stream/streamDecompress.js";

export const LZ4 = {
    compress: compressBuffer ,
    decompress: decompressBuffer,
    compressStream: createCompressStream,
    decompressStream: createDecompressStream
}