
import {NodeLz4Napi} from "./node/node.lz4Napi.js";
import {NodeLz4Wasm} from "./node/node.lz4Wasm.js";
import {NodeZlibDeflate} from "./node/node.zlibDeflate.js";
import {NodeZlibBrotli} from "./node/node.zlibBrotli.js";
import {NodeZlibGzip} from "./node/node.zlibGzip.js";
import {NodeSnappy} from "./node/node.snappy.js";

const NodeJSLibs =  {
    lz4Napi: {
        name: 'lz4-napi',
        library: 'lz4-napi',
        environment: 'NodeJS',
        language: 'Rust',
        class: NodeLz4Napi
    },
    lz4Wasm: {
        name: 'lz4-wasm',
        library: 'lz4-wasm-nodejs',
        environment: 'NodeJS',
        language: 'WASM',
        class: NodeLz4Wasm
    },
    deflate: {
        name: 'node:deflate',
        library: 'node:zlib',
        environment: 'NodeJS',
        language: 'C++',
        class: NodeZlibDeflate
    },
    brotli: {
        name: 'node:brotli',
        library: 'node:zlib',
        environment: 'NodeJS',
        language: 'C++',
        class: NodeZlibBrotli
    },
    gzip: {
        name: 'node:gzip',
        library: 'node:zlib',
        environment: 'NodeJS',
        language: 'C++',
        class: NodeZlibGzip
    },
    snappy: {
        name: 'snappy',
        library: 'snappy',
        environment: 'NodeJS',
        language: 'C++',
        class: NodeSnappy
    }
};

export default {NodeJSLibs};