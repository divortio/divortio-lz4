import V8JSLibs from "./libs.v8JS.js";
import V8WASMLibs from "./libs.v8WASM.js";
import NodeJSLibs from "./libs.node.js";

/**
 * @const BenchLibs
 * @type {{v8: {Javascript: {V8JSLibs: {fflate: BenchLib, lz4JS: BenchLib, lz4Browser: BenchLib, lz4Divortio: BenchLib, pako: BenchLib, snappyJS: BenchLib}}, WASM: {V8WASMLibs: {lz4Napi: BenchLib}}}, NodeJS: {NodeJSLibs: {lz4Napi: BenchLib, lz4Wasm: BenchLib, deflate: BenchLib, brotli: BenchLib, gzip: BenchLib, snappy: BenchLib}}}}
 */
export const BenchLibs = {
    v8: {
        Javascript: V8JSLibs,
        WASM: V8WASMLibs
    },
    NodeJS: NodeJSLibs
};

export default {BenchLibs};