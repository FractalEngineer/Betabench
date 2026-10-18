import { useEffect, useState } from "react";
import { ComboBox } from "./ComboBox";
import data from "./targets.json";
import { resourceCli, resourcePads, type Pad } from "./resources";

export function ResourceSetup() {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [sckKey, setSck] = useState("");
  const [doutKey, setDout] = useState("");
  const [customSck, setCustomSck] = useState("");
  const [customDout, setCustomDout] = useState("");
  const [customResources, setCustomResources] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(
    () => setCopied(false),
    [name, sckKey, doutKey, customSck, customDout, customResources],
  );
  const target = data.targets.find((t) => t.name === name);
  const pads: Pad[] = target?.pads ?? resourcePads(customResources);
  const sck =
    target && sckKey !== "gpio"
      ? (pads.find((p) => p.label === sckKey) ?? pads[0])
      : { label: "SCK", resource: "", index: 1, pin: customSck.toUpperCase() };
  const dout =
    target && doutKey !== "gpio"
      ? (pads.find((p) => p.label === doutKey) ??
        pads.find((p) => p.pin !== sck.pin)!)
      : {
          label: "DOUT",
          resource: "",
          index: 1,
          pin: customDout.toUpperCase(),
        };
  function selectTarget(value: string) {
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
  if (name)
    try {
      cli = resourceCli(pads, sck, dout);
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
                ["HX711 clock (SCK)", sckKey, setSck],
                ["HX711 data (DOUT)", doutKey, setDout],
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
                    <option value="gpio">Custom GPIO…</option>
                    {pads.map((p) => (
                      <option key={p.label} value={p.label}>
                        {p.label} / {p.pin}
                      </option>
                    ))}
                  </select>
                  {value === "gpio" && (
                    <input
                      aria-label={
                        label === "HX711 clock (SCK)"
                          ? "Clock GPIO"
                          : "Data GPIO"
                      }
                      placeholder={
                        label === "HX711 clock (SCK)" ? "A00" : "A01"
                      }
                      value={
                        label === "HX711 clock (SCK)" ? customSck : customDout
                      }
                      onChange={(e) =>
                        (label === "HX711 clock (SCK)"
                          ? setCustomSck
                          : setCustomDout)(e.target.value)
                      }
                    />
                  )}
                </label>
              ))}
            </div>
          ) : (
            <>
              <label>
                Resource configuration
                <textarea
                  aria-label="Resource configuration"
                  placeholder="Paste resource output or a full CLI dump"
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
          <p className="subtle">
            Build with USE_HX711. Frees mapped resources on the selected GPIOs.
            Verify the mapping against your board revision.
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
