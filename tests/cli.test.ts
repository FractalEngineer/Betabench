import { afterEach, describe, expect, it, vi } from "vitest";
import { CliSession, type CliTransport } from "../src/cli";

const decoder = new TextDecoder();
class FakeTransport implements CliTransport {
  sink?: (text: string) => void;
  writes: string[] = [];
  ends = 0;
  beginRaw(sink: (text: string) => void) {
    this.sink = sink;
  }
  endRaw() {
    this.sink = undefined;
    this.ends++;
  }
  async write(bytes: Uint8Array) {
    this.writes.push(decoder.decode(bytes));
  }
  emit(text: string) {
    this.sink?.(text);
  }
}
const timers = () =>
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
afterEach(() => vi.useRealTimers());

describe("CLI session over the stock MSP port", () => {
  it("enters the CLI with '#', then returns echoed command output", async () => {
    timers();
    const transport = new FakeTransport();
    const session = new CliSession(transport);
    const opened = session.open(3000);
    expect(transport.writes).toEqual(["#\r"]);
    transport.emit("\r\nEntering CLI Mode, type 'exit' to reboot, or 'help'");
    transport.emit("\r\n# ");
    await vi.advanceTimersByTimeAsync(40);
    await expect(opened).resolves.toContain("Entering CLI Mode");

    const run = session.run("version");
    expect(transport.writes[1]).toBe("version\n");
    // The prompt left over from the previous command must not satisfy the wait.
    transport.emit("version");
    await vi.advanceTimersByTimeAsync(50);
    transport.emit("\r\n# Betaflight / CLRACINGF4\r\n# ");
    await vi.advanceTimersByTimeAsync(50);
    await expect(run).resolves.toBe("version\r\n# Betaflight / CLRACINGF4\r\n# ");
  });

  it("refuses to run before the session is open", async () => {
    timers();
    const session = new CliSession(new FakeTransport());
    await expect(session.run("status")).rejects.toThrow("not open");
  });

  it("times out with advice and releases the port when no prompt arrives", async () => {
    timers();
    const transport = new FakeTransport();
    const session = new CliSession(transport);
    const opened = session.open(100);
    const rejected = expect(opened).rejects.toThrow("No CLI prompt");
    await vi.advanceTimersByTimeAsync(200);
    await rejected;
    expect(transport.ends).toBe(1);
  });

  it("leaves the CLI with 'exit noreboot' and returns the port", async () => {
    timers();
    const transport = new FakeTransport();
    const session = new CliSession(transport);
    const opened = session.open(1000);
    transport.emit("\r\n# ");
    await vi.advanceTimersByTimeAsync(50);
    await opened;

    const closed = session.close(1000);
    expect(transport.writes.at(-1)).toBe("exit noreboot\n");
    transport.emit("exit noreboot\r\n### leaving CLI mode, no reboot\r\n");
    await vi.advanceTimersByTimeAsync(400);
    await expect(closed).resolves.toContain("leaving CLI mode");
    expect(transport.ends).toBe(1);
  });
});
