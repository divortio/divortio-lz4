import { describe, it } from 'node:test';

/**
 * Aggregates all tests.
 *
 * STRATEGY:
 * 1. Use STATIC imports. This executes the files immediately, registering their
 * tests with the global harness before the runner starts. This prevents
 * race conditions ("Unexpected node state").
 * 2. Include a placeholder `describe` block. This signals to IDEs (IntelliJ/VSCode)
 * that this file is a Test Suite, enabling the "Run" button.
 */

// --- 1. Utilities ---
import './utils.mjs';

// --- 2. Primitives ---
import './xxhash32/xxhash32.test.mjs';
import './xxhash32/xxhash32Stateful.test.mjs';

// --- 3. Shared Logic ---
import './shared/lz4Base.test.mjs';
import './shared/lz4Encode.test.mjs';
import './shared/lz4Decode.test.mjs';

// --- 4. Buffer API ---
import './buffer/bufferCompress.test.mjs';
import './buffer/bufferDecompress.test.mjs';

// --- 5. Stream API ---
import './stream/streamCompress.test.mjs';
import './stream/streamDecompress.test.mjs';

// --- 6. Advanced Features (NEW) ---
import './raw/raw.test.mjs';
import './async/async.test.mjs';
import './types/types.test.mjs';
import './dictionary/dictionary.test.mjs';

// --- 7. Compliance ---
import './golden.test.mjs';

// --- 8. IDE Discovery Anchor ---
describe('Divortio LZ4 Suite Aggregator', () => {
    it('should have registered all sub-modules successfully', () => {
        // This test exists solely to ensure IDEs recognize this file
        // as a valid test suite. The actual tests are registered
        // by the imports above.
    });
});