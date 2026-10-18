import { it, expect } from "vitest";
import { resourceCli, uartAssignments } from "../src/ResourceSetup";
import targets from "../src/targets.json";
it("releases UART functions and all resource aliases for the chosen pads", () => {
  const target = targets.targets.find((t) => t.name === "CLRACINGF4")!;
  const sck = target.pads.find((p) => p.label === "TX4")!,
    dout = target.pads.find((p) => p.label === "RX4")!;
  expect(
    resourceCli(
      target.pads,
      sck,
      dout,
      "gps_uart = UART4\nmsp_1_uart = VCP\nrx_uart = UART1",
    ),
  ).toBe(
    "set gps_uart = NONE\nresource SERIAL_TX 4 NONE\nresource SERIAL_RX 4 NONE\nresource HX711_SCK 1 A00\nresource HX711_DOUT 1 A01\nsave",
  );
  const motor = target.pads.find((p) => p.label === "M5")!;
  const cli = resourceCli(target.pads, motor, dout, "gps_uart = UART4");
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

it("parses active get/dump assignments, ignores defaults and uses the final value", () => {
  expect([
    ...uartAssignments(`
# get _uart
rx_uart = UART1
Allowed values: NONE, VCP, UART1, UART4
Default value: UART4
# set rx_uart = UART4
set gps_uart = UART4
SET MSP_1_UART = vcp
set gps_uart = NONE
serial 3 0 115200 57600 0 115200
`),
  ]).toEqual([
    ["rx_uart", "UART1"],
    ["gps_uart", "NONE"],
    ["msp_1_uart", "VCP"],
  ]);
});
it("unsets all matching features across both pads while preserving unrelated ports and selectors", () => {
  const pads = [
    { label: "TX1", resource: "SERIAL_TX", index: 1, pin: "A09" },
    { label: "RX4", resource: "SERIAL_RX", index: 4, pin: "A01" },
  ];
  const cli = resourceCli(
    pads,
    pads[0],
    pads[1],
    `
set msp_1_uart = VCP
set msp_2_uart = UART1
rx_uart = UART4
telemetry_1_uart = UART4
gps_uart = UART10
vtx_uart = NONE
set telemetry_1_protocol = CRSF
set gps_baudrate = 115200
`,
  );
  expect(cli.split("\n").slice(0, 3)).toEqual([
    "set msp_2_uart = NONE",
    "set rx_uart = NONE",
    "set telemetry_1_uart = NONE",
  ]);
  expect(cli).not.toMatch(/msp_1|gps_|vtx_|protocol|baudrate|^serial /m);
});
it("requires current assignments for UART pads, including aliases, and allows an unused UART", () => {
  const pads = [
    { label: "M1", resource: "MOTOR", index: 1, pin: "A09" },
    { label: "TX1", resource: "SERIAL_TX", index: 1, pin: "A09" },
    { label: "M2", resource: "MOTOR", index: 2, pin: "B00" },
  ];
  for (const settings of [
    "",
    "# rx_uart = UART1",
    "serial 0 0 115200 57600 0 115200",
  ])
    expect(() => resourceCli(pads, pads[0], pads[2], settings)).toThrow(
      "get _uart",
    );
  const cli = resourceCli(
    pads,
    pads[0],
    pads[2],
    "msp_1_uart = VCP\nrx_uart = UART2",
  );
  expect(cli).toContain("resource SERIAL_TX 1 NONE");
  expect(cli).not.toMatch(/^set |^serial /m);
  expect(resourceCli([pads[0], pads[2]], pads[0], pads[2])).toContain(
    "resource HX711_DOUT 1 B00",
  );
});
