// Betaflight switches its MSP port into the CLI as soon as it receives '#' while
// disarmed (msp_serial.c: MSP_PENDING_CLI, guarded by tasks.c skipping non-MSP
// data while armed). The CLI then echoes input and prints "\r\n# " after every
// command. This is the same trick the Configurator's CLI tab uses, so it works on
// stock firmware with no extra build flags.
export const CLI_PROMPT = "\r\n# ";
const encoder = new TextEncoder();

export type CliTransport = {
  beginRaw(sink: (text: string) => void): void;
  endRaw(): void;
  write(bytes: Uint8Array): Promise<void>;
};

export class CliSession {
  private text = "";
  private consumed = 0;
  private opened = false;
  constructor(private transport: CliTransport) {}

  private append = (chunk: string) => {
    this.text += chunk;
  };

  private take() {
    const output = this.text.slice(this.consumed);
    this.consumed = this.text.length;
    return output;
  }

  private async waitForPrompt(from: number, timeoutMs: number) {
    const deadline = performance.now() + timeoutMs;
    for (;;) {
      if (this.text.length > from && this.text.endsWith(CLI_PROMPT)) return;
      if (performance.now() >= deadline)
        throw Error(
          "No CLI prompt from the flight controller. Disarm it, make sure nothing else is using the port, and retry",
        );
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  // Wait until the CLI stops talking, so a closing command cannot be confused
  // with the next session's output.
  private async settle(timeoutMs: number, quietMs = 200) {
    const deadline = performance.now() + timeoutMs;
    let seen = this.text.length;
    let since = performance.now();
    while (performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      if (this.text.length !== seen) {
        seen = this.text.length;
        since = performance.now();
      } else if (performance.now() - since >= quietMs) return;
    }
  }

  async open(timeoutMs = 4000) {
    if (this.opened) return "";
    this.text = "";
    this.consumed = 0;
    this.transport.beginRaw(this.append);
    try {
      await this.transport.write(encoder.encode("#\r"));
      await this.waitForPrompt(0, timeoutMs);
    } catch (e) {
      this.transport.endRaw();
      throw e;
    }
    this.opened = true;
    return this.take();
  }

  async run(command: string, timeoutMs = 8000) {
    if (!this.opened) throw Error("The CLI session is not open");
    const line = command.trim();
    if (!line) return "";
    const from = this.text.length;
    await this.transport.write(encoder.encode(`${line}\n`));
    await this.waitForPrompt(from, timeoutMs);
    return this.take();
  }

  // "exit noreboot" leaves the FC running instead of rebooting it. Betaflight
  // keeps arming disabled after that until the next reboot, which the UI states.
  async close(timeoutMs = 2000) {
    if (!this.opened) {
      this.transport.endRaw();
      return this.take();
    }
    this.opened = false;
    await this.transport
      .write(encoder.encode("exit noreboot\n"))
      .catch(() => {});
    await this.settle(timeoutMs);
    this.transport.endRaw();
    return this.take();
  }
}
