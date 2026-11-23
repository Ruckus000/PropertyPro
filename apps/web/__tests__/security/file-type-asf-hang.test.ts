/**
 * GHSA-5v7r-6r5c-r473: file-type's ASF parser loops forever on a sub-header
 * whose size field is 0 (fixed in file-type 21.3.1). `detectFileTypeFromBytes`
 * runs on resident uploads, so a 55-byte file would stall the server.
 *
 * Why a worker thread: the vulnerable loop is pure promise microtasks, so it
 * starves the event loop of the thread it runs on. A `Promise.race` timer on
 * that same thread never fires, and neither does vitest's own test timeout:
 * the run would hang instead of failing. Detection therefore runs in a worker,
 * and the 2-second race runs here, on a thread the loop cannot starve. The
 * clock starts only after the worker has loaded the module, so the budget
 * measures detection, not tsx start-up.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TARGET = path.join(WEB_ROOT, 'src/lib/utils/file-validation.ts');
const DETECTION_BUDGET_MS = 2_000;

// CommonJS: an `eval: true` worker is not a module. It loads the TypeScript
// source through tsx (a root devDependency), resolving `@/` via the app's
// tsconfig, then waits for one buffer to classify.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  const { tsImport } = await import(workerData.tsxApi);
  const mod = await tsImport(workerData.target, {
    parentURL: workerData.parentURL,
    tsconfig: workerData.tsconfig,
  });
  const detect = mod.detectFileTypeFromBytes ?? mod.default?.detectFileTypeFromBytes;
  parentPort.once('message', async (bytes) => {
    parentPort.postMessage({ result: await detect(bytes) });
  });
  parentPort.postMessage({ ready: true });
})().catch((error) => parentPort.postMessage({ error: String(error?.stack ?? error) }));
`;

type WorkerMessage = { ready?: true; result?: unknown; error?: string };

function nextMessage(worker: Worker): Promise<WorkerMessage> {
  return new Promise((resolve, reject) => {
    worker.once('message', (message: WorkerMessage) =>
      message.error ? reject(new Error(message.error)) : resolve(message),
    );
    worker.once('error', reject);
  });
}

/** Detect `bytes` in a fresh worker; `'timeout'` if detection outlives the budget. */
async function detectInWorker(bytes: Uint8Array): Promise<unknown> {
  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    workerData: {
      tsxApi: pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm/api')).href,
      target: pathToFileURL(TARGET).href,
      parentURL: import.meta.url,
      tsconfig: path.join(WEB_ROOT, 'tsconfig.json'),
    },
  });
  try {
    await nextMessage(worker); // ready
    const reply = nextMessage(worker);
    worker.postMessage(bytes);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      reply.then((message) => ({ result: message.result })),
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), DETECTION_BUDGET_MS);
      }),
    ]);
    clearTimeout(timer);
    return outcome;
  } finally {
    // terminate() interrupts even a spinning isolate.
    await worker.terminate();
  }
}

/** The ASF header-object GUID, then one sub-header that declares size 0: 55 bytes. */
function zeroSizeAsfSubHeader(): Uint8Array {
  const bytes = new Uint8Array(55);
  bytes.set(
    [
      0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62,
      0xce, 0x6c,
    ],
    0,
  );
  // Bytes 16–29: header size, object count, reserved (the parser skips them).
  // Bytes 30–45: the sub-header's GUID; bytes 46–53: its UINT64 size, left 0.
  return bytes;
}

describe('file-type ASF zero-size sub-header (GHSA-5v7r-6r5c-r473)', () => {
  it('detectFileTypeFromBytes returns promptly on a zero-size ASF sub-header', async () => {
    await expect(detectInWorker(zeroSizeAsfSubHeader())).resolves.toEqual({ result: null });
  }, 30_000);

  it('the worker harness still detects an allowed type (control)', async () => {
    // Signature, a 13-byte IHDR chunk (1x1 RGBA, CRC not checked), then an
    // IDAT chunk header. file-type 21 requires the IHDR before it says PNG.
    const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 13, ...ascii('IHDR'), 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, ...ascii('IDAT'),
    ]);
    await expect(detectInWorker(png)).resolves.toEqual({
      result: { ext: 'png', mime: 'image/png' },
    });
  }, 30_000);
});
