import "fake-indexeddb/auto";
import { afterEach, describe, it, expect, vi } from "vitest";
import { RunController } from "../src/runner";
import { presets } from "../src/profiles";
import { Simulator } from "../src/device";
class FakeWorker {
  static last: FakeWorker;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage() {}
  terminate() {}
  send(data: unknown) {
    this.onmessage?.({ data });
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("run lifecycle", () => {
  it("stops a cancelled countdown without subsequently starting motors", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const d = new Simulator();
    const begin = vi.spyOn(d, "begin");
    const stopped = vi.spyOn(d, "stop");
    const r = new RunController(d, presets[1], [0], "", () => {});
    const start = r.start();
    await r.stop("Cancelled");
    await start;
    expect(begin).not.toHaveBeenCalled();
    expect(stopped).toHaveBeenCalled();
    expect(r.run.state).toBe("aborted");
  });
  it("rejects an empty motor selection before beginning", () => {
    expect(
      () => new RunController(new Simulator(), presets[0], [], "", () => {}),
    ).toThrow();
  });
});
