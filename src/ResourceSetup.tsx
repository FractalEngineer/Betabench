import { useEffect, useState } from "react";
import { ComboBox } from "./ComboBox";
import data from "./targets.json";
export type Pad = {
  label: string;
  resource: string;
  index: number;
  pin: string;
};
export function uartAssignments(text: string) {
  const assignments = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = line
      .trim()
      .match(
        /^(?:set\s+)?([a-z][a-z0-9_]*_uart)\s*=\s*(NONE|VCP|UART\d+|LPUART\d+|PIOUART\d+|SOFT\d+)\s*$/i,
      );
    if (match) assignments.set(match[1].toLowerCase(), match[2].toUpperCase());
  }
  return assignments;
}

function affectedPads(pads: Pad[], sck: Pad, dout: Pad) {
  return pads.filter((p) => p.pin === sck.pin || p.pin === dout.pin);
}

export function resourceCli(pads: Pad[], sck: Pad, dout: Pad, settings = "") {
  if (sck.pin === dout.pin) throw Error("Choose different GPIO pads");
  const affected = affectedPads(pads, sck, dout);
  const uarts = new Set(
    affected
      .filter((p) => p.resource === "SERIAL_TX" || p.resource === "SERIAL_RX")
      .map((p) => `UART${p.index}`),
  );
  const assignments = uartAssignments(settings);
  if (uarts.size && !assignments.size)
    throw Error(
      "Paste the complete output of get _uart to identify functions using these UART pads",
    );
  return [
    ...[...assignments]
      .filter(([, port]) => uarts.has(port))
      .map(([setting]) => `set ${setting} = NONE`),
    ...new Set(affected.map((p) => `resource ${p.resource} ${p.index} NONE`)),
    `resource HX711_SCK 1 ${sck.pin}`,
    `resource HX711_DOUT 1 ${dout.pin}`,
    "save",
  ].join("\n");
}

export function ResourceSetup() {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [sckKey, setSck] = useState("");
  const [doutKey, setDout] = useState("");
  const [customSck, setCustomSck] = useState("");
  const [customDout, setCustomDout] = useState("");
  const [customResources, setCustomResources] = useState("");
  const [uartSettings, setUartSettings] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(
    () => setCopied(false),
    [
      name,
      sckKey,
      doutKey,
      customSck,
      customDout,
      customResources,
      uartSettings,
    ],
  );
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
  function selectTarget(value: string) {
    setUartSettings("");
    setName(value);
    setQuery(value === "custom" ? "Custom / current resource dump" : value);
    const t = data.targets.find((t) => t.name === value);
    const clock = t?.pads.find((p) => p.resource === "SERIAL_TX") ?? t?.pads[0];
    const input =
      t?.pads.find(
        (p) =>
          p.resource === "SERIAL_RX" &&
          p.index === clock?.index &&
          p.pin !== clock?.pin,
      ) ?? t?.pads.find((p) => p.pin !== clock?.pin);
    setSck(clock?.label ?? "");
    setDout(input?.label ?? "");
  }
  let cli = "",
    error = "";
  const needsUartSettings =
    sck &&
    dout &&
    affectedPads(pads, sck, dout).some(
      (p) => p.resource === "SERIAL_TX" || p.resource === "SERIAL_RX",
    );
  if (name)
    try {
      if (
        !sck ||
        !dout ||
        !/^([A-Z]\d{2})$/.test(sck.pin) ||
        !/^([A-Z]\d{2})$/.test(dout.pin)
      )
        throw Error("Enter GPIO pins such as A00 and A01");
      cli = resourceCli(
        pads,
        sck,
        dout,
        `${target ? "" : customResources}\n${uartSettings}`,
      );
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  return (
    <section className="panel wiring">
      <div className="section-heading">
        <h2>HX711 resources</h2>
      </div>
      <div className="field-label">
        <span>Target</span>
        <ComboBox
          label="Flight controller target"
          value={query}
          selectedId={name}
          options={[
            ...data.targets.map((t) => ({ id: t.name, label: t.name })),
            { id: "custom", label: "Custom / current resource dump" },
          ]}
          placeholder="Search targets…"
          onChange={(value) => {
            setQuery(value);
            setName("");
            setSck("");
            setDout("");
            setUartSettings("");
          }}
          onSelect={selectTarget}
        />
      </div>
      {!name ? (
        <p className="subtle">
          Choose a target or select Custom to use your current resource
          assignments.
        </p>
      ) : (
        <>
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
                  placeholder="Paste the output of resource"
                  value={customResources}
                  onChange={(e) => setCustomResources(e.target.value)}
                />
              </label>
              <div className="pad-selects">
                <label>
                  Clock GPIO
                  <input
                    aria-label="Clock GPIO"
                    placeholder="A00"
                    value={customSck}
                    onChange={(e) => setCustomSck(e.target.value)}
                  />
                </label>
                <label>
                  Data GPIO
                  <input
                    aria-label="Data GPIO"
                    placeholder="A01"
                    value={customDout}
                    onChange={(e) => setCustomDout(e.target.value)}
                  />
                </label>
              </div>
            </>
          )}
          {needsUartSettings && (
            <label>
              Current UART assignments
              <textarea
                aria-label="Current UART assignments"
                placeholder="Paste the complete output of get _uart"
                value={uartSettings}
                onChange={(e) => setUartSettings(e.target.value)}
              />
              <span className="subtle">
                Run <code>get _uart</code> in the FC CLI. A full{" "}
                <code>dump</code> is also accepted. Only features assigned to
                the selected UARTs will be unset.
              </span>
            </label>
          )}
          <p className="subtle">
            Build with USE_HX711. Selected resource aliases and assigned UART
            functions are released. Verify the mapping against the flashed
            target and board revision.
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
                  {sck.label} / {sck.pin || "—"}
                </td>
                <td>PD_SCK</td>
              </tr>
              <tr>
                <td>
                  {dout.label} / {dout.pin || "—"}
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
            Save reboots the FC. Target mappings: {data.revision.slice(0, 8)}.
            Use Custom to match an existing resource remap.
          </p>
        </>
      )}
    </section>
  );
}
