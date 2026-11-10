import { describe, expect, it, vi } from "vitest";
import { loadLatestAuditPage } from "@/components/recruitment/audit-request";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
describe("audit page request ordering", () => {
  it("keeps the most recently requested page when responses arrive in reverse order", async () => {
    const generation = { current: 0 };
    const older = deferred<number>();
    const newer = deferred<number>();
    const success = vi.fn();
    const failure = vi.fn();
    const a = loadLatestAuditPage(
      generation,
      () => older.promise,
      success,
      failure,
    );
    const b = loadLatestAuditPage(
      generation,
      () => newer.promise,
      success,
      failure,
    );
    newer.resolve(1);
    await b;
    older.resolve(3);
    await a;
    expect(success).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledWith(1);
    expect(failure).not.toHaveBeenCalled();
  });
  it("ignores a stale error and ignores replies after closing or unmounting", async () => {
    const generation = { current: 0 };
    const old = deferred<number>();
    const fresh = deferred<number>();
    const success = vi.fn();
    const failure = vi.fn();
    const a = loadLatestAuditPage(
      generation,
      () => old.promise,
      success,
      failure,
    );
    const b = loadLatestAuditPage(
      generation,
      () => fresh.promise,
      success,
      failure,
    );
    fresh.resolve(1);
    await b;
    old.reject(new Error("network"));
    await a;
    expect(failure).not.toHaveBeenCalled();
    const late = deferred<number>();
    const c = loadLatestAuditPage(
      generation,
      () => late.promise,
      success,
      failure,
    );
    generation.current++;
    late.resolve(2);
    await c;
    expect(success).toHaveBeenCalledTimes(1);
  });
  it("reports the latest request failure", async () => {
    const failure = vi.fn();
    await loadLatestAuditPage(
      { current: 0 },
      () => Promise.reject(new Error("network")),
      vi.fn(),
      failure,
    );
    expect(failure).toHaveBeenCalledOnce();
  });
});
