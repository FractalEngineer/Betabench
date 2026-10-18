import { it, expect } from "vitest";
import { resourceCli } from "../src/ResourceSetup";
import targets from "../src/targets.json";
it("releases UART functions and all resource aliases for the chosen pads", () => {
  const target = targets.targets.find((t) => t.name === "CLRACINGF4")!;
  const sck = target.pads.find((p) => p.label === "TX4")!,
    dout = target.pads.find((p) => p.label === "RX4")!;
  expect(resourceCli(target.pads, sck, dout)).toBe(
    "serial 3 0 115200 57600 0 115200\nresource SERIAL_TX 4 NONE\nresource SERIAL_RX 4 NONE\nresource HX711_SCK 1 A00\nresource HX711_DOUT 1 A01\nsave",
  );
  const motor = target.pads.find((p) => p.label === "M5")!;
  const cli = resourceCli(target.pads, motor, dout);
  expect(cli).toContain("resource MOTOR 5 NONE");
  expect(cli).toContain("resource LED_STRIP 1 NONE");
  expect(() => resourceCli(target.pads, sck, sck)).toThrow();
});
it("offers unique target names and at least two distinct pads per target", () => {
  expect(new Set(targets.targets.map((t) => t.name)).size).toBe(
    targets.targets.length,
  );
  for (const t of targets.targets)
    expect(new Set(t.pads.map((p) => p.pin)).size).toBeGreaterThanOrEqual(2);
});
