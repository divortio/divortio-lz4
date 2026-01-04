


class SampleData {

    /**
     * @param corpus {string}
     * @param name {string}
     * @param size {number}
     */
    constructor(corpus,
                name,
                size
    ) {

        this.corpus = corpus;
        this.name = name;
        this.size = size;
    }
}


class FileData extends SampleData {

    constructor(path, corpus, name, size, description) {
        super(corpus, name, description);
    }
}

