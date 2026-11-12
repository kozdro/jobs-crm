import { parentPort, workerData } from "node:worker_threads";
import { validateDocumentContent } from "../../src/modules/documents/application/validate-content.ts";

try {
  await validateDocumentContent(
    new Uint8Array(workerData.bytes),
    workerData.filename,
    workerData.mime,
  );
  parentPort?.postMessage({ valid: true });
} catch {
  parentPort?.postMessage({ valid: false });
}
