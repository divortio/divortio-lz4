import { LZ4 } from '../../src/lz4.js';

// --- Mock Cloudflare Worker Environment ---
// In a real worker, 'fetch' and 'Response' are globals.
// This example simulates a request handler.

console.log("--- LZ4 Cloudflare Worker (Edge) Example ---");

/**
 * Simulates a Cloudflare Worker 'fetch' event handler.
 * Proxies a request to an origin, compresses the response, and returns it.
 */
async function handleRequest(request) {
    // 1. Simulate fetching from an origin server (e.g., your S3 bucket or API)
    // We create a mock Response with a ReadableStream body.
    const originResponse = mockOriginResponse();

    console.log(`[Edge] Received response from origin: ${originResponse.status}`);

    // 2. Prepare Headers
    const newHeaders = new Headers(originResponse.headers);
    newHeaders.set('Content-Encoding', 'lz4');
    newHeaders.delete('Content-Length'); // Length is now unknown due to streaming

    // 3. Create a Transform Pipeline
    // origin -> compress -> user
    const compressedStream = originResponse.body.pipeThrough(LZ4.compressStream());

    // 4. Return new Response
    // The browser will receive this as a stream of LZ4 frames.
    return new Response(compressedStream, {
        status: originResponse.status,
        headers: newHeaders
    });
}

// --- Simulation Helpers ---

function mockOriginResponse() {
    // Create a stream that emits text data slowly
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();
            const text = "Edge computing allows for low-latency transformations... ";

            // Push 5 chunks
            for (let i = 0; i < 5; i++) {
                controller.enqueue(encoder.encode(text + `(Chunk ${i})\n`));
            }
            controller.close();
        }
    });

    return new Response(stream, { headers: { 'Content-Type': 'text/plain' } });
}

// --- Run Simulation ---
(async () => {
    const req = new Request('https://api.example.com/data');
    const res = await handleRequest(req);

    console.log(`[Client] Received Headers:`, Object.fromEntries(res.headers));

    // Client reads the stream (simulating a browser download)
    const reader = res.body.getReader();
    let totalBytes = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.length;
        console.log(`[Client] Received chunk: ${value.length} bytes`);
    }

    console.log(`[Client] Total LZ4 Download Size: ${totalBytes} bytes`);
})();