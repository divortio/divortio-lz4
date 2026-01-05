import {BaseLib} from "./baseLib.js";

export class BenchLib {

    /**
     * @param {BaseLib} libClass
     */
    constructor(libClass) {
        this.name = libClass.name;
        this.library = libClass.library;
        this.environment = libClass.environment;
        this.language = libClass.language;
        this.class = libClass;
    }
}

export default {BenchLib};