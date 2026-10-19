import { useEffect, useState } from "react";
import { Search, Upload } from "lucide-react";
import { ComboBox } from "./ComboBox";
import data from "./targets.json";
import { hx711Pins, resourceCli, resourcePads, type Pad } from "./resources";

export function ResourceSetup({
  writeCli,
  detect,
}: {
  writeCli?: (lines: string[]) => Promise<void>;
  detect?: () => Promise<string>;
}) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [sckKey, setSck] = useState("");
  const [doutKey, setDout] = useState("");
  const [customSck, setCustomSck] = useState("");
  const [customDout, setCustomDout] = useState("");
  const [customResources, setCustomResources] = useState("");
  const [copied, setCopied] = useState(false);
  const [writing, setWriting] = useState(false);
  const [writeStatus, setWriteStatus] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState("");
  useEffect(() => {
    setCopied(false);
    setWriteStatus("");
  }, [name, sckKey, doutKey, customSck, customDout, customResources]);
  const target = data.targets.find((t) => t.name === name);
  const pads: Pad[] = customResources
    ? resourcePads(customResources)
    : (target?.pads ?? []);
  const sck =
    sckKey && sckKey !== "gpio"
      ? (pads.find((p) => p.label === sckKey) ?? pads[0])
      : { label: "SCK", resource: "", index: 1, pin: customSck.toUpperCase() };
  const dout =
    doutKey && doutKey !== "gpio"
      ? (pads.find((p) => p.label === doutKey) ??
        pads.find((p) => p.pin !== sck.pin) ??
        pads[0] ?? {
          label: "DOUT",
          resource: "",
          index: 1,
          pin: customDout.toUpperCase(),
        })
      : {
          label: "DOUT",
          resource: "",
          index: 1,
          pin: customDout.toUpperCase(),
        };
  function selectTarget(value: string) {
    setName(value);
    setQuery(value === "custom" ? "Custom / current resource dump" : value);
    setCustomResources("");
    setCustomSck("");
    setCustomDout("");
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
  async function runDetect() {
    if (!detect) return;
    setDetecting(true);
    setDetectStatus("");
    try {
      const text = await detect();
      const pads = resourcePads(text);
      if (!pads.length)
        throw Error("The FC did not report any resource assignments");
      const pins = hx711Pins(text);
      setCustomResources(text);
      if (!name) {
        setName("custom");
        setQuery("Custom / current resource dump");
      }
      setCustomSck(pins.sck ?? "");
      setCustomDout(pins.dout ?? "");
      const sckPad =
        pads.find((p) => p.resource === "HX711_SCK" && p.pin === pins.sck) ??
        pads.find((p) => p.pin === pins.sck);
      const doutPad =
        pads.find((p) => p.resource === "HX711_DOUT" && p.pin === pins.dout) ??
        pads.find((p) => p.pin === pins.dout);
      if (pins.sck) setSck(sckPad?.label ?? "gpio");
      if (pins.dout) setDout(doutPad?.label ?? "gpio");
      if (!name) {
        if (!pins.sck) setSck("gpio");
        if (!pins.dout) setDout("gpio");
      }
      setDetectStatus(
        pins.sck || pins.dout
          ? `HX711 already assigned: clock ${pins.sck ?? "—"}, data ${pins.dout ?? "—"}. Writing again keeps these pins.`
          : `Read ${pads.length} resource assignments. HX711_SCK and HX711_DOUT are not assigned yet, so pick the two pads to use.`,
      );
    } catch (e) {
      setDetectStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setDetecting(false);
    }
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
        <div className="target-row">
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
              setCustomResources("");
              setCustomSck("");
              setCustomDout("");
            }}
            onSelect={selectTarget}
          />
          <button
            type="button"
            disabled={!detect || detecting}
            title="Read the current resource assignments from the flight controller"
            onClick={() => void runDetect()}
          >
            <Search size={14} /> {detecting ? "Detecting…" : "Detect"}
          </button>
        </div>
        {detectStatus && <p className="status">{detectStatus}</p>}
      </div>
      {!name ? (
        <p className="subtle">
          Choose a target or select Custom to use your current resource
          assignments.
        </p>
      ) : (
        <>
          {!target && (
            <label>
              Resource configuration
              <textarea
                aria-label="Resource configuration"
                placeholder="Paste resource output or a full CLI dump"
                value={customResources}
                onChange={(e) => setCustomResources(e.target.value)}
              />
            </label>
          )}
          {pads.length > 0 ? (
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
              <div className="actions">
                <button
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(cli)
                      .then(() => setCopied(true))
                  }
                >
                  {copied ? "Copied" : "Copy CLI"}
                </button>
                {writeCli && (
                  <button
                    className="primary"
                    disabled={writing}
                    onClick={() =>
                      void (async () => {
                        if (!writeCli) return;
                        setWriting(true);
                        setWriteStatus("");
                        try {
                          await writeCli(cli.split("\n"));
                          setWriteStatus(
                            "Written and saved. Reboot the FC to apply the new pins.",
                          );
                        } catch (e) {
                          setWriteStatus(
                            e instanceof Error ? e.message : String(e),
                          );
                        } finally {
                          setWriting(false);
                        }
                      })()
                    }
                  >
                    <Upload size={14} /> {writing ? "Writing…" : "Write to FC"}
                  </button>
                )}
              </div>
              {writeStatus && <p className="status">{writeStatus}</p>}
            </>
          )}
          <p className="subtle">
            Target mappings: {data.revision.slice(0, 8)}. Use Custom to match an
            existing resource remap. Reboot the FC after writing or pasting
            before the new pins are used.
          </p>
        </>
      )}
    </section>
  );
}
