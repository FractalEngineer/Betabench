import { it, expect } from "vitest";
import { gpioPin, hx711Pins, resourceCli, resourcePads } from "../src/resources";
import targets from "../src/targets.json";
const target = targets.targets.find((t) => t.name === "CLRACINGF4")!;
const pad = (label: string) => target.pads.find((p) => p.label === label)!;

it("generates reassignment directly from target resources, without UART configuration", () => {
  expect(resourceCli(target.pads, pad("TX4"), pad("RX4"))).toBe(
    "resource SERIAL_TX 4 NONE\nresource SERIAL_RX 4 NONE\nresource HX711_SCK 1 A00\nresource HX711_DOUT 1 A01\nsave",
  );
});
it("releases every GPIO alias and leaves unrelated resources and settings alone", () => {
  const cli = resourceCli(target.pads, pad("M5"), pad("RX4"));
  expect(cli).toContain("resource MOTOR 5 NONE");
  expect(cli).toContain("resource LED_STRIP 1 NONE");
  expect(cli).not.toMatch(/SERIAL_TX 4|SERIAL_RX 1|^set |^serial /m);
  const duplicate = resourceCli(
    [...target.pads, pad("M5")],
    pad("M5"),
    pad("RX4"),
  );
  expect(duplicate.match(/resource MOTOR 5 NONE/g)).toHaveLength(1);
});
it("supports non-UART target resources and free GPIOs", () => {
  const cli = resourceCli(target.pads, pad("BEEPER"), pad("PINIO1"));
  expect(cli).toBe(
    "resource BEEPER 1 NONE\nresource PINIO 1 NONE\nresource HX711_SCK 1 B04\nresource HX711_DOUT 1 A14\nsave",
  );
  expect(
    resourceCli(
      target.pads,
      { ...pad("BEEPER"), pin: "PA0" },
      { ...pad("PINIO1"), pin: "B02" },
    ),
  ).toBe(
    "resource SERIAL_TX 4 NONE\nresource HX711_SCK 1 A00\nresource HX711_DOUT 1 B02\nsave",
  );
});
it("parses a custom resource dump, ignoring comments/settings and honoring remaps/NONE", () => {
  const pads = resourcePads(`
# resource MOTOR 1 A00
resource MOTOR 1 A01
resource MOTOR 1 NONE
resource MOTOR 3 B08
resource LED_STRIP 1 B08
resource SERIAL_RX 2 A03
resource SERIAL_RX 2 A04
resource PINIO 1 A99
set rx_uart = UART2
serial 1 0 115200 57600 0 115200
`);
  expect(pads.map((p) => p.pin)).toEqual(["B08", "B08", "A04"]);
  expect(resourceCli(pads, pads[0], pads[2])).toBe(
    "resource MOTOR 3 NONE\nresource LED_STRIP 1 NONE\nresource SERIAL_RX 2 NONE\nresource HX711_SCK 1 B08\nresource HX711_DOUT 1 A04\nsave",
  );
});
it("finds the HX711 pins in a detected resource dump", () => {
  const dump = [
    "# resource BEEPER 1 B04",
    "resource BEEPER 1 B04",
    "resource SERIAL_TX 4 A00",
    "resource SERIAL_RX 4 A01",
    "resource HX711_SCK 1 A00",
    "resource HX711_DOUT 1 A01",
  ].join("\n");
  expect(hx711Pins(dump)).toEqual({ sck: "A00", dout: "A01" });
  expect(
    hx711Pins("resource HX711_SCK 1 NONE\nresource HX711_DOUT 1 NONE"),
  ).toEqual({ sck: undefined, dout: undefined });
});
it("does not release the HX711 pins it is about to reassign", () => {
  const pads = resourcePads(
    "resource HX711_SCK 1 A00\nresource HX711_DOUT 1 A01\nresource SERIAL_TX 4 A00\nresource LED_STRIP 1 A05",
  );
  expect(resourceCli(pads, pad("TX4"), pad("RX4"))).toBe(
    "resource SERIAL_TX 4 NONE\nresource HX711_SCK 1 A00\nresource HX711_DOUT 1 A01\nsave",
  );
});
it("validates GPIO input and rejects equal pins after normalization", () => {
  expect(gpioPin(" pa0 ")).toBe("A00");
  expect(gpioPin("K15")).toBe("K15");
  for (const invalid of ["A16", "B99", "Z01", "A", "", "A01\nsave"])
    expect(() => gpioPin(invalid)).toThrow("GPIO");
  expect(() =>
    resourceCli(target.pads, pad("TX4"), { ...pad("RX4"), pin: "PA0" }),
  ).toThrow("different GPIO");
});
it("keeps generated target resources unique, valid and traceable to config headers", () => {
  expect(new Set(targets.targets.map((t) => t.name)).size).toBe(
    targets.targets.length,
  );
  for (const t of targets.targets) {
    expect(t.source).toMatch(/^configs\/[^/]+\/[^/]+\/config.h$/);
    expect(new Set(t.pads.map((p) => p.pin)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(t.pads.map((p) => `${p.resource} ${p.index}`)).size).toBe(
      t.pads.length,
    );
    expect(new Set(t.pads.map((p) => p.label)).size).toBe(t.pads.length);
    for (const p of t.pads) expect(gpioPin(p.pin)).toBe(p.pin);
  }
});
