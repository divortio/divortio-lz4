/**
 * benchmark/corpus/silesia.js
 * * Definition of the Silesia Compression Corpus.
 * * Source: https://sun.aei.polsl.pl//~sdeor/index.php?page=silesia
 */

import { CorpusURLArchive } from '../base/corpusURLArchive.js';
import { CorpusURLArchiveFile } from '../base/corpusURLArchiveFile.js';

const SILESIA_URL = 'https://github.com/DataCompression/corpus-collection/raw/refs/heads/main/Silesia-Corpus/silesia.tar.gz';
const SILESIA_NAME = 'silesia';

// The list of expected files in the corpus
const FILE_LIST = [
    'dickens', 'mozilla', 'mr', 'nci', 'ooffice',
    'osdb', 'reymont', 'samba', 'sao', 'webster',
    'x-ray', 'xml'
];

/**
 * 1. The Corpus Class (Iterable)
 * Usage: for (const file of new CorpusSilesia()) { ... }
 * @class CorpusSilesia
 * @extends CorpusURLArchive
 */
export class CorpusSilesia extends CorpusURLArchive {
    constructor() {
        super(SILESIA_NAME, SILESIA_URL, FILE_LIST);
    }
}

/**
 * 2. The Individual Files Object (Direct Access)
 * Usage: import { SilesiaFiles } from ...; SilesiaFiles.dickens.load();
 */
export const CorpusSilesiaFiles = {
    dickens: new CorpusURLArchiveFile(SILESIA_NAME, SILESIA_URL, 'dickens'),
    mozilla: new CorpusURLArchiveFile(SILESIA_NAME, SILESIA_URL, 'mozilla'),
    mr:      new CorpusURLArchiveFile(SILESIA_NAME, SILESIA_URL, 'mr'),
    nci:     new CorpusURLArchiveFile(SILESIA_NAME, SILESIA_URL, 'nci'),
    ooffice: new CorpusURLArchiveFile(SILESIA_NAME, SILESIA_URL, 'ooffice'),
    osdb:    new CorpusURLArchiveFile(SILESIA_NAME, SILESIA_URL, 'osdb'),
    reymont: new CorpusURLArchiveFile(SILESIA_NAME, SILESIA_URL, 'reymont'),
    samba:   new CorpusURLArchiveFile(SILESIA_NAME, SILESIA_URL, 'samba'),
    sao:     new CorpusURLArchiveFile(SILESIA_NAME, SILESIA_URL, 'sao'),
    webster: new CorpusURLArchiveFile(SILESIA_NAME, SILESIA_URL, 'webster'),
    xray:    new CorpusURLArchiveFile(SILESIA_NAME, SILESIA_URL, 'x-ray'),
    xml:     new CorpusURLArchiveFile(SILESIA_NAME, SILESIA_URL, 'xml'),
};

export default {CorpusSilesiaFiles, CorpusSilesia};