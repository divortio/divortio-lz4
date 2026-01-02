
import {V8JSFflate} from "./v8JS/v8JS.fflate.js";
import V8JSLz4Browser from "./v8JS/v8JS.lz4Browser.js";
import {V8JSLz4Divortio} from "./v8JS/v8JS.lz4Divortio.js";
import {V8JSLz4JS} from "./v8JS/v8JS.lz4JS.js";
import {V8JSPako} from "./v8JS/v8JS.pako.js";
import {V8JSSnappyJS} from "./v8JS/v8JS.snappyJS.js";


const v8JSLibs = {
    fflate: {
        name: 'fflate',
        library: 'fflate',
        environment: 'V8',
        language: 'Javascript',
        class: V8JSFflate
    },
    lz4Browser: {
        name: 'lz4-browser',
        library: 'lz4-browser',
        environment: 'V8',
        language: 'Javascript',
        class: V8JSLz4Browser
    },
    lz4Divortio: {
        name: 'lz4-divortio',
        library: '',
        environment: 'V8',
        language: 'Javascript',
        class: V8JSLz4Divortio
    },
    lz4JS: {
        name: 'lz4js',
        library: 'lz4js',
        environment: 'V8',
        language: 'Javascript',
        class: V8JSLz4JS
    },
    pako: {
        name: 'pako',
        library: 'pako',
        environment: 'V8',
        language: 'Javascript',
        class: V8JSPako
    },
    snappyJS: {
        name: 'snappyjs',
        library: 'V8',
        environment: 'V8',
        language: 'Javascript',
        class: V8JSSnappyJS
    }
};

export default {v8JSLibs};
