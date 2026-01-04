import V8WASMLz4WasmWeb from "./v8WASM/v8WASM.lz4WasmWeb.js";


const V8WASMLibs = {
    lz4Napi: {
        name: 'lz4-wasm-web',
        library: 'lz4-wasm',
        environment: 'V8',
        language: 'WASM',
        class: V8WASMLz4WasmWeb
    },
};


export default {V8WASMLibs};