
import {NodeJSLz4Napi} from "./nodeJS/nodeJS.lz4Napi.js";
import {NodeJSLz4Wasm} from "./nodeJS/nodeJS.lz4Wasm.js";
import {NodeJSZlibDeflate} from "./nodeJS/nodeJS.zlibDeflate.js";
import {NodeJSZlibBrotli} from "./nodeJS/nodeJS.zlibBrotli.js";
import {NodeJSZlibGzip} from "./nodeJS/nodeJS.zlibGzip.js";
import {NodeJSSnappy} from "./nodeJS/nodeJS.snappy.js";

import {BenchLib} from "./shared/benchLib.js";


export const NodeJSLibs =  {
    lz4Napi: new BenchLib( new NodeJSLz4Napi()),
    lz4Wasm: new BenchLib( new NodeJSLz4Wasm()),
    deflate: new BenchLib(new NodeJSZlibDeflate()),
    brotli: new BenchLib(new NodeJSZlibBrotli()),
    gzip: new BenchLib(new NodeJSZlibGzip()),
    snappy: new BenchLib(new NodeJSSnappy())
};

export default {NodeJSLibs};