import {BenchLib} from "./shared/benchLib.js";

import {V8JSFflate} from "./v8JS/v8JS.fflate.js";
import {V8JSLz4Browser} from "./v8JS/v8JS.lz4Browser.js";
import {V8JSLz4Divortio} from "./v8JS/v8JS.lz4Divortio.js";
import {V8JSLz4JS} from "./v8JS/v8JS.lz4JS.js";
import {V8JSPako} from "./v8JS/v8JS.pako.js";
import {V8JSSnappyJS} from "./v8JS/v8JS.snappyJS.js";


/**
 * @const V8JSLibs
 * @type {{fflate: BenchLib, lz4JS: BenchLib, lz4Browser: BenchLib, lz4Divortio: BenchLib, pako: BenchLib, snappyJS: BenchLib}}
 */
export const V8JSLibs = {
    fflate: new BenchLib( new V8JSFflate()),
    lz4JS: new BenchLib( new V8JSLz4JS()),
    lz4Browser: new BenchLib(new V8JSLz4Browser()),
    lz4Divortio: new BenchLib(new V8JSLz4Divortio()),
    pako: new BenchLib( new V8JSPako()),
    snappyJS: new BenchLib(new V8JSSnappyJS())
};

export default {V8JSLibs};
