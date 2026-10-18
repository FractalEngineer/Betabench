import { useState } from "react";
import data from "./targets.json";
export type Pad = {
  label: string;
  resource: string;
  index: number;
  pin: string;
};
export function resourceCli(pads: Pad[], sck: Pad, dout: Pad) {
  if (sck.pin === dout.pin) throw Error("Choose different GPIO pads");
  const affected = pads.filter((p) => p.pin === sck.pin || p.pin === dout.pin);
  const uarts = [
    ...new Set(
      affected
        .filter((p) => p.resource.startsWith("SERIAL_"))
        .map((p) => p.index),
    ),
  ];
  return [
    ...uarts
      .sort((a, b) => a - b)
      .map((n) => `serial ${n - 1} 0 115200 57600 0 115200`),
    ...new Set(affected.map((p) => `resource ${p.resource} ${p.index} NONE`)),
    `resource HX711_SCK 1 ${sck.pin}`,
    `resource HX711_DOUT 1 ${dout.pin}`,
    "save",
  ].join("\n");
}
export function ResourceSetup() {
  const initial =
    data.targets.find((t) => t.name === "CLRACINGF4") ?? data.targets[0];
  const [name, setName] = useState(initial.name);
  const [sckKey, setSck] = useState("TX4");
  const [doutKey, setDout] = useState("RX4");
  const [customSck, setCustomSck] = useState("A00");
  const [customDout, setCustomDout] = useState("A01");
  const [customResources, setCustomResources] = useState(
    "resource SERIAL_TX 4 A00\nresource SERIAL_RX 4 A01",
  );
  const [copied, setCopied] = useState(false);
  const target = data.targets.find((t) => t.name === name);
  const pads: Pad[] =
    target?.pads ??
    customResources.split("\n").flatMap((line) => {
      const m = line.trim().match(/^resource\s+(\w+)\s+(\d+)\s+([A-Z]\d{2})$/i);
      return m
        ? [
            {
              label: `${m[1]} ${m[2]}`,
              resource: m[1].toUpperCase(),
              index: Number(m[2]),
              pin: m[3].toUpperCase(),
            },
          ]
        : [];
    });
  const sck = target
    ? (pads.find((p) => p.label === sckKey) ?? pads[0])
    : { label: "SCK", resource: "", index: 1, pin: customSck.toUpperCase() };
  const dout = target
    ? (pads.find((p) => p.label === doutKey) ??
      pads.find((p) => p.pin !== sck.pin)!)
    : { label: "DOUT", resource: "", index: 1, pin: customDout.toUpperCase() };
  let cli = "";
  let error = "";
  try {
    if (
      !sck ||
      !dout ||
      !/^([A-Z]\d{2})$/.test(sck.pin) ||
      !/^([A-Z]\d{2})$/.test(dout.pin)
    )
      throw Error("Enter GPIO pins such as A00 and A01");
    cli = resourceCli(pads, sck, dout);
  } catch (e) {
    error = String(e);
  }
  return (
    <section className="panel wiring">
      <div className="section-heading">
        <h2>HX711 resources</h2>
      </div>
      <label className="field-label">
        Target
        <select
          aria-label="Flight controller target"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            const t = data.targets.find((t) => t.name === e.target.value);
            const clock =
              t?.pads.find((p) => p.resource === "SERIAL_TX") ?? t?.pads[0];
            const input =
              t?.pads.find(
                (p) => p.resource === "SERIAL_RX" && p.pin !== clock?.pin,
              ) ?? t?.pads.find((p) => p.pin !== clock?.pin);
            setSck(clock?.label ?? "");
            setDout(input?.label ?? "");
            setCopied(false);
          }}
        >
          {data.targets.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
          <option value="custom">Custom / current resource dump</option>
        </select>
      </label>
      {target ? (
        <div className="pad-selects">
          {[
            ["HX711 clock (SCK)", sck.label, setSck],
            ["HX711 data (DOUT)", dout.label, setDout],
          ].map(([label, value, setter]) => (
            <label key={String(label)}>
              {String(label)}
              <select
                aria-label={String(label)}
                value={String(value)}
                onChange={(e) =>
                  (setter as (s: string) => void)(e.target.value)
                }
              >
                {pads.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label} / {p.pin}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : (
        <>
          <label>
            Current CLI resources
            <textarea
              aria-label="Current resource assignments"
              value={customResources}
              onChange={(e) => setCustomResources(e.target.value)}
            />
          </label>
          <div className="pad-selects">
            <label>
              Clock GPIO
              <input
                aria-label="Clock GPIO"
                value={customSck}
                onChange={(e) => setCustomSck(e.target.value)}
              />
            </label>
            <label>
              Data GPIO
              <input
                aria-label="Data GPIO"
                value={customDout}
                onChange={(e) => setCustomDout(e.target.value)}
              />
            </label>
          </div>
        </>
      )}
      <p className="subtle">
        Build with USE_HX711. Selected resources and their UART functions are
        disabled. Verify the mapping against the flashed target and board
        revision.
      </p>
      <table>
        <thead>
          <tr>
            <th>FC pad</th>
            <th>HX711</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {sck.label} / {sck.pin}
            </td>
            <td>PD_SCK</td>
          </tr>
          <tr>
            <td>
              {dout.label} / {dout.pin}
            </td>
            <td>DOUT</td>
          </tr>
        </tbody>
      </table>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <pre data-testid="resource-cli">{cli}</pre>
          <button
            onClick={() =>
              void navigator.clipboard
                .writeText(cli)
                .then(() => setCopied(true))
            }
          >
            {copied ? "Copied" : "Copy CLI"}
          </button>
        </>
      )}
      <p className="subtle">
        Save reboots the FC. Target mappings: {data.revision.slice(0, 8)}. Use
        Custom to match an existing resource remap.
      </p>
    </section>
  );
}
