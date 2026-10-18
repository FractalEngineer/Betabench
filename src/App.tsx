import {
  MeasurementsChart,
  MetricSelector,
  type Metric,
} from "./MeasurementsChart";
import { loadUnits, type LoadUnit } from "./calibration";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Cable,
  Check,
  CircleStop,
  Copy,
  FlaskConical,
  Gauge,
  Moon,
  Play,
  Plus,
  Radio,
  Save,
  Scale,
  SlidersHorizontal,
  Sun,
  Trash2,
  Unplug,
  Zap,
} from "lucide-react";
import type { BenchDevice, Profile, Run, Sample } from "./types";
import { presets, duplicate, duration, validateProfile } from "./profiles";
import { FlightController, SerialLink, Simulator } from "./device";
import { RunController } from "./runner";
import { store, download, csv, validateRun } from "./storage";
import { ProfileEditor } from "./ProfileEditor";
import { ComboBox } from "./ComboBox";

const ResourceSetup = lazy(() =>
  import("./ResourceSetup").then((m) => ({ default: m.ResourceSetup })),
);

const fmt = (v: number | undefined, d = 2) =>
  v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(d);
export default function App() {
  const [tab, setTab] = useState<"bench" | "history" | "loadcell">("bench");
  const [profiles, setProfiles] = useState<Profile[]>(presets);
  const [profile, setProfile] = useState<Profile>(structuredClone(presets[0]));
  const [device, setDevice] = useState<BenchDevice>();
  const [selected, setSelected] = useState<number[]>([0]);
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [sample, setSample] = useState<Partial<Sample>>({});
  const [activeRun, setActiveRun] = useState<Run>();
  const [runs, setRuns] = useState<Run[]>([]);
  const [overlays, setOverlays] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<Metric[]>([
    "current",
    "voltage",
    "power",
    "thrustG",
  ]);
  const [loadUnit, setLoadUnit] = useState<LoadUnit>(() =>
    (localStorage.getItem("load-unit") as LoadUnit) in loadUnits
      ? (localStorage.getItem("load-unit") as LoadUnit)
      : "g",
  );
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "dark",
  );
  const [mass, setMass] = useState(100);
  const controller = useRef<RunController | undefined>(undefined);
  const deviceRef = useRef<BenchDevice | undefined>(undefined);
  const runningRef = useRef(false);
  const busyRef = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const renderAt = useRef(0);
  async function refresh() {
    setRuns(await store.runs());
  }
  useEffect(() => {
    void Promise.all([store.profiles(), store.runs()])
      .then(([p, r]) => {
        setProfiles([
          ...presets,
          ...p.filter((x) => !presets.some((s) => s.id === x.id)),
        ]);
        setRuns(r);
      })
      .catch((e) => setError(`Local storage unavailable: ${e}`));
    return () => {
      void deviceRef.current?.close();
    };
  }, []);
  useEffect(() => {
    deviceRef.current = device;
  }, [device]);
  useEffect(() => {
    const stop = () => {
      if (document.hidden && controller.current)
        void controller.current.stop("Page hidden");
    };
    const unload = () => {
      void deviceRef.current?.stop();
    };
    document.addEventListener("visibilitychange", stop);
    window.addEventListener("pagehide", unload);
    return () => {
      document.removeEventListener("visibilitychange", stop);
      window.removeEventListener("pagehide", unload);
    };
  }, []);
  useEffect(() => {
    if (!device) return;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        if (!runningRef.current && !busyRef.current) {
          try {
            const s = await device.sample();
            if (!cancelled && !runningRef.current) setSample(s);
          } catch (e) {
            if (!cancelled) {
              setError(String(e));
              await device.stop().catch(() => {});
              return;
            }
          }
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [device]);
  async function action(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    busyRef.current = true;
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  async function connect(simulated = false) {
    await action(async () => {
      if (deviceRef.current) await deviceRef.current.close();
      setEnabled(false);
      setSample({});
      if (simulated) {
        const d = new Simulator();
        setDevice(d);
        setStatus("Simulator connected");
        return;
      }
      if (!("serial" in navigator))
        throw Error(
          "Web Serial requires desktop Chrome or Edge on HTTPS or localhost",
        );
      const port = await navigator.serial.requestPort();
      const link = new SerialLink(port);
      await link.open();
      const d = new FlightController(link);
      try {
        await d.discover();
      } catch (e) {
        await link.close();
        throw e;
      }
      link.onFault = (e) => {
        setError(e.message);
        setEnabled(false);
        if (controller.current) void controller.current.stop(e.message);
      };
      setDevice(d);
      setStatus("Flight controller connected");
    });
  }
  async function disconnect() {
    await action(async () => {
      if (controller.current)
        await controller.current.stop("Disconnected by user");
      await device?.close();
      setDevice(undefined);
      deviceRef.current = undefined;
      setEnabled(false);
      setSample({});
      setStatus("Disconnected");
    });
  }
  async function start() {
    if (!device || !enabled || runningRef.current) return;
    setError("");
    try {
      validateProfile(profile);
      runningRef.current = true;
      setRunning(true);
      setTab("bench");
      const c = new RunController(
        device,
        profile,
        selected,
        notes,
        (run, message) => {
          if (
            performance.now() - renderAt.current > 80 ||
            run.state !== "running" ||
            message !== "Running"
          ) {
            renderAt.current = performance.now();
            setActiveRun({ ...run, samples: [...run.samples] });
            setStatus(message);
            setSample(run.samples.at(-1) ?? {});
          }
          if (run.state !== "running") {
            runningRef.current = false;
            setRunning(false);
            setEnabled(false);
          }
        },
      );
      controller.current = c;
      setActiveRun(c.run);
      await c.start();
    } catch (e) {
      runningRef.current = false;
      setRunning(false);
      setEnabled(false);
      setError(String(e));
    }
  }
  async function stop() {
    if (controller.current) {
      await controller.current.stop("Emergency stop");
      setRuns(await store.runs());
    } else
      await action(async () => {
        await device?.stop();
        setEnabled(false);
        setStatus("Outputs stopped");
      });
  }
  async function saveProfile() {
    await action(async () => {
      const p = presets.some((s) => s.id === profile.id)
        ? duplicate(profile)
        : profile;
      const preset = presets.find((s) => s.id === profile.id);
      if (preset && profile.name !== preset.name) p.name = profile.name;
      await store.saveProfile(p);
      setProfile(p);
      setProfiles([...presets, ...(await store.profiles())]);
      setStatus("Profile saved locally");
    });
  }
  async function importFile(file: File) {
    await action(async () => {
      if (file.size > 50 * 1024 * 1024)
        throw Error("Import must be under 50 MB");
      const value = JSON.parse(await file.text());
      if (Array.isArray(value.samples)) {
        const r = validateRun(value);
        r.id = crypto.randomUUID();
        await store.saveRun(r);
        await refresh();
        setTab("history");
      } else {
        const p = validateProfile(value);
        p.id = crypto.randomUUID();
        await store.saveProfile(p);
        setProfiles([...presets, ...(await store.profiles())]);
        setProfile(p);
        setTab("bench");
      }
      setStatus("Imported successfully");
    });
  }
  const samples = activeRun?.samples ?? [];
  const elapsed = samples.at(-1)?.t ?? 0;
  const rate =
    samples.length > 1
      ? ((samples.length - 1) * 1000) / (samples.at(-1)!.t - samples[0].t)
      : 0;
  const maxGap =
    samples.length > 1
      ? samples
          .slice(1)
          .reduce((gap, s, i) => Math.max(gap, s.t - samples[i].t), 0)
      : 0;
  const identity = device?.identity;
  const efficiency =
    sample.thrustG !== undefined &&
    sample.power !== undefined &&
    sample.power > 0
      ? sample.thrustG / sample.power
      : undefined;
  function switchTab(value: typeof tab) {
    setTab(value);
    if (value === "history" && !runningRef.current)
      void refresh().catch((e) => setError(String(e)));
  }
  const stat = (
    title: string,
    value: number | undefined,
    unit: string,
    icon: React.ReactNode,
    d = 2,
  ) => (
    <div className="stat">
      <div className="stat-label">
        {icon}
        {title}
      </div>
      <div className="stat-value">
        {fmt(value, d)}
        <small>{unit}</small>
      </div>
    </div>
  );

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <img
            className="brand-wordmark"
            src={`${import.meta.env.BASE_URL}brand/betabench-wordmark${theme === "light" ? "-light" : ""}.svg`}
            alt="BetaBench"
            width="156"
            height="34"
          />
        </a>
        <nav>
          {(
            [
              ["bench", "Test bench", <SlidersHorizontal size={17} />],
              ["history", "Run history", <Activity size={17} />],
              ["loadcell", "Load cell", <Scale size={17} />],
            ] as const
          ).map(([key, label, icon]) => (
            <button
              key={key}
              className={tab === key ? "nav-active" : ""}
              onClick={() => switchTab(key)}
            >
              {icon}
              {label}
              {key === "history" && (
                <span className="count">{runs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <a
          className="source-link"
          href="https://github.com/FractalEngineer/Betabench"
          target="_blank"
          rel="noreferrer"
        >
          Source
        </a>
      </aside>
      <main>
        <header className="topbar">
          <h1>
            {tab === "bench"
              ? "Test bench"
              : tab === "history"
                ? "Run history"
                : "Load cell"}
          </h1>
          <div className="actions">
            <span className="pill">
              {device
                ? identity?.simulated
                  ? "Simulator"
                  : "Connected"
                : "Disconnected"}
            </span>
            <button
              className="icon"
              aria-label={theme === "dark" ? "Light theme" : "Dark theme"}
              title={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              onClick={() => {
                const next = theme === "dark" ? "light" : "dark";
                setTheme(next);
                localStorage.setItem("theme", next);
              }}
            >
              {theme === "dark" ? (
                <Sun size={17} aria-hidden="true" />
              ) : (
                <Moon size={17} aria-hidden="true" />
              )}
            </button>
          </div>
        </header>
        <div className="content">
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          <section className="connection panel">
            <Cable size={20} />
            <div className="connection-details">
              <strong>{device ? identity?.name : "Flight controller"}</strong>
              <span>
                {device
                  ? `Betaflight ${identity?.version} · MSP ${identity?.api} · ${identity?.motorCount} motors${identity?.hx711 ? " · HX711" : ""}`
                  : "USB MSP · Chrome / Edge"}
              </span>
            </div>
            <div className="actions">
              {device ? (
                <button
                  disabled={busy || running}
                  onClick={() => void disconnect()}
                >
                  <Unplug size={14} /> Disconnect
                </button>
              ) : (
                <>
                  <button disabled={busy} onClick={() => void connect(true)}>
                    <FlaskConical size={14} /> Try simulator
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void connect()}
                  >
                    <Plus size={14} /> Connect FC
                  </button>
                </>
              )}
            </div>
          </section>
          {device && !identity?.simulated && (
            <div className="notice warning">
              Motor output persists after USB or browser loss. Keep a physical
              power cutoff available.
            </div>
          )}
          {tab === "bench" && (
            <>
              <div className="bench-grid">
                <section className="panel profile-panel">
                  <div className="section-heading">
                    <h2>Throttle profile</h2>
                    <span>{(duration(profile) / 1000).toFixed(2)} s</span>
                  </div>
                  <div className="profile-toolbar">
                    <ComboBox
                      label="Throttle profile"
                      value={profile.name}
                      selectedId={profile.id}
                      options={profiles.map((p) => ({
                        id: p.id,
                        label: p.name,
                      }))}
                      editable
                      disabled={running}
                      onChange={(name) => setProfile({ ...profile, name })}
                      onSelect={(id) =>
                        setProfile(
                          structuredClone(profiles.find((p) => p.id === id)!),
                        )
                      }
                    />
                    <button
                      className="icon"
                      aria-label="Duplicate profile"
                      disabled={running}
                      onClick={() => setProfile(duplicate(profile))}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      disabled={running || busy}
                      onClick={() => void saveProfile()}
                    >
                      <Save size={14} /> Save
                    </button>
                    <button
                      className="icon"
                      aria-label="Export profile"
                      onClick={() =>
                        download(
                          `${profile.name}.json`,
                          JSON.stringify(profile, null, 2),
                        )
                      }
                    >
                      <ArrowDownToLine size={16} />
                    </button>
                    <button
                      className="icon"
                      aria-label="Import profile or run"
                      disabled={running || busy}
                      onClick={() => input.current?.click()}
                    >
                      <ArrowUpFromLine size={16} />
                    </button>
                  </div>
                  <ProfileEditor
                    profile={profile}
                    onChange={setProfile}
                    disabled={running}
                  />
                </section>
                <section className="panel setup-panel">
                  <div className="section-heading">
                    <h2>Run setup</h2>
                  </div>
                  <label className="field-label">Motor outputs</label>
                  <div className="motor-buttons">
                    {Array.from(
                      { length: identity?.motorCount ?? 4 },
                      (_, i) => (
                        <button
                          key={i}
                          disabled={running}
                          aria-pressed={selected.includes(i)}
                          className={selected.includes(i) ? "selected" : ""}
                          onClick={() =>
                            setSelected(
                              selected.includes(i)
                                ? selected.filter((n) => n !== i)
                                : [...selected, i],
                            )
                          }
                        >
                          M{i + 1}
                          {selected.includes(i) && <Check size={12} />}
                        </button>
                      ),
                    )}
                  </div>
                  <label className="field-label" htmlFor="notes">
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    rows={3}
                    disabled={running}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Motor, ESC, propeller, battery"
                  />
                  <label className="enable-check">
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={!device || running || busy}
                      onChange={(e) => setEnabled(e.target.checked)}
                    />
                    <span>
                      Bench is secured and ready.
                      <small>Enable motor outputs for this run.</small>
                    </span>
                  </label>
                  <button
                    className="primary run-button"
                    disabled={
                      !device || !enabled || !selected.length || running || busy
                    }
                    onClick={() => void start()}
                  >
                    <Play size={14} /> Run profile
                  </button>
                  <button
                    className="stop-button"
                    disabled={!device}
                    onClick={() => void stop()}
                  >
                    <CircleStop size={16} /> STOP ALL MOTORS
                  </button>
                  <p className="subtle">
                    Selected motors share the curve. Other outputs stay stopped.
                  </p>
                  <p className="subtle">
                    Hiding this page or losing telemetry aborts the test.
                  </p>
                </section>
              </div>
              <section className="panel telemetry-panel">
                <div className="section-heading">
                  <h2>Measurements</h2>
                  <span className="pill">
                    {running
                      ? status === "Running"
                        ? "● RECORDING"
                        : status.startsWith("Starting")
                          ? "COUNTDOWN"
                          : "STOPPING"
                      : "LIVE VIEW"}
                  </span>
                  <span>
                    {rate.toFixed(1)} Hz · maximum gap {maxGap.toFixed(0)} ms
                  </span>
                </div>
                <div className="stats">
                  {stat("Voltage", sample.voltage, "V", <Zap size={13} />)}
                  {stat("Current", sample.current, "A", <Activity size={13} />)}
                  {stat("Power", sample.power, "W", <Gauge size={13} />)}
                  {stat(
                    "Thrust",
                    sample.thrustG === undefined
                      ? undefined
                      : sample.thrustG * loadUnits[loadUnit].factor,
                    loadUnit,
                    <Scale size={13} />,
                    2,
                  )}
                  {stat("Efficiency", efficiency, "g/W", <Radio size={13} />)}
                  {stat(
                    "Throttle",
                    sample.throttle ?? 0,
                    "%",
                    <SlidersHorizontal size={13} />,
                    1,
                  )}
                </div>
                <div className="chart-toolbar">
                  <MetricSelector
                    selected={selectedMetrics}
                    onChange={setSelectedMetrics}
                    unit={loadUnit}
                  />
                </div>
                <MeasurementsChart
                  series={[
                    {
                      id: "live",
                      name: identity?.simulated ? "Simulator" : "Run",
                      samples: samples.slice(-3000),
                    },
                  ]}
                  selected={selectedMetrics}
                  unit={loadUnit}
                />
                <div className="telemetry-footer">
                  <span>{status}</span>
                  <span>{(elapsed / 1000).toFixed(2)} s</span>
                  {activeRun && (
                    <div className="actions">
                      <button
                        disabled={running}
                        onClick={() =>
                          download(
                            `${activeRun.id}.csv`,
                            csv(activeRun),
                            "text/csv",
                          )
                        }
                      >
                        CSV
                      </button>
                      <button
                        disabled={running}
                        onClick={() =>
                          download(
                            `${activeRun.id}.json`,
                            JSON.stringify(activeRun),
                          )
                        }
                      >
                        JSON
                      </button>
                    </div>
                  )}
                </div>
                <p className="subtle">
                  Current and thrust are totals for all selected motors. FC
                  current includes board consumption.
                </p>
              </section>
            </>
          )}
          {tab === "history" && (
            <section className="panel history-panel">
              <div className="section-heading">
                <h2>Saved runs</h2>
                <button
                  disabled={running || busy}
                  onClick={() => input.current?.click()}
                >
                  <ArrowUpFromLine size={14} /> Import JSON
                </button>
              </div>
              {!runs.length ? (
                <p>No saved runs.</p>
              ) : (
                <>
                  <div className="run-list">
                    {runs.map((r) => (
                      <article className="run-row" key={r.id}>
                        <input
                          aria-label={`Overlay ${r.profile.name} ${r.startedAt}`}
                          type="checkbox"
                          checked={overlays.includes(r.id)}
                          onChange={(e) =>
                            setOverlays(
                              e.target.checked
                                ? [...overlays, r.id]
                                : overlays.filter((id) => id !== r.id),
                            )
                          }
                        />
                        <div>
                          <strong>
                            {r.profile.name}
                            {r.identity.simulated && (
                              <span className="pill">SIM</span>
                            )}
                          </strong>
                          <p>
                            {new Date(r.startedAt).toLocaleString()} · M
                            {r.selected.map((n) => n + 1).join(", M")} ·{" "}
                            {r.samples.length} samples
                          </p>
                          <small>
                            {r.notes || r.identity.name} · {r.reason}
                          </small>
                        </div>
                        <span className={"state state-" + r.state}>
                          {r.state}
                        </span>
                        <div className="actions">
                          <button
                            onClick={() =>
                              download(`${r.id}.csv`, csv(r), "text/csv")
                            }
                          >
                            CSV
                          </button>
                          <button
                            onClick={() =>
                              download(`${r.id}.json`, JSON.stringify(r))
                            }
                          >
                            JSON
                          </button>
                          <button
                            className="icon"
                            aria-label={`Delete run ${r.id}`}
                            disabled={running}
                            onClick={() =>
                              void action(async () => {
                                await store.deleteRun(r.id);
                                await refresh();
                              })
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {overlays.length > 0 && (
                    <>
                      <h3>Run comparison</h3>
                      <MetricSelector
                        selected={selectedMetrics}
                        onChange={setSelectedMetrics}
                        unit={loadUnit}
                      />
                      <MeasurementsChart
                        series={runs
                          .filter((r) => overlays.includes(r.id))
                          .map((r) => ({
                            id: r.id,
                            name: `${r.profile.name} ${new Date(r.startedAt).toLocaleTimeString()}`,
                            samples: r.samples,
                          }))}
                        selected={selectedMetrics}
                        unit={loadUnit}
                      />
                    </>
                  )}
                </>
              )}
            </section>
          )}
          {tab === "loadcell" && (
            <div className="loadcell-grid">
              <section className="panel">
                <div className="section-heading">
                  <h2>Calibration</h2>
                  <label>
                    Units{" "}
                    <select
                      aria-label="Load cell units"
                      value={loadUnit}
                      onChange={(e) => {
                        const unit = e.target.value as LoadUnit;
                        setLoadUnit(unit);
                        localStorage.setItem("load-unit", unit);
                      }}
                    >
                      {Object.keys(loadUnits).map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="loadcell-reading">
                  {fmt(
                    sample.thrustG === undefined
                      ? undefined
                      : sample.thrustG * loadUnits[loadUnit].factor,
                    3,
                  )}{" "}
                  <span>{loadUnit}</span>
                </div>
                <p className="subtle">
                  {sample.hxValid
                    ? "Fresh measurement"
                    : identity?.hx711
                      ? "Waiting for valid samples and calibration"
                      : "Requires USE_HX711 firmware"}
                </p>
                <div className="calibration-steps">
                  <div>
                    <div>
                      <h3>Tare</h3>
                      <p>Remove the load and let the stand settle.</p>
                    </div>
                    <button
                      disabled={!identity?.hx711 || running || busy}
                      onClick={() =>
                        void action(async () => {
                          await device!.tare();
                          setSample(await device!.sample());
                          setStatus("Tare complete — calibration is unsaved");
                        })
                      }
                    >
                      Tare
                    </button>
                  </div>
                  <div>
                    <div>
                      <h3>Known load</h3>
                      <label className="mass-input">
                        <input
                          aria-label="Known calibration load"
                          type="number"
                          min="0.001"
                          step="any"
                          value={Number(
                            (mass * loadUnits[loadUnit].factor).toPrecision(8),
                          )}
                          disabled={running || busy}
                          onChange={(e) =>
                            setMass(
                              Number(e.target.value) /
                                loadUnits[loadUnit].factor,
                            )
                          }
                        />{" "}
                        {loadUnit}
                      </label>
                    </div>
                    <button
                      disabled={
                        !identity?.hx711 || running || busy || mass <= 0
                      }
                      onClick={() =>
                        void action(async () => {
                          await device!.calibrate(mass);
                          setSample(await device!.sample());
                          setStatus("Calibration complete — save to retain it");
                        })
                      }
                    >
                      Calibrate
                    </button>
                  </div>
                  <div>
                    <div>
                      <h3>Save calibration</h3>
                      <p>Stored in this browser for this FC. Logs use grams.</p>
                    </div>
                    <button
                      disabled={!identity?.hx711 || running || busy}
                      onClick={() =>
                        void action(async () => {
                          await device!.saveCalibration();
                          setSample(await device!.sample());
                          setStatus("Calibration saved and verified");
                        })
                      }
                    >
                      <Save size={14} /> Save
                    </button>
                  </div>
                </div>
                <dl className="calibration-info">
                  <div>
                    <dt>Raw counts</dt>
                    <dd>{sample.raw ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Counts / gram</dt>
                    <dd>{fmt(device?.calibration?.countsPerGram, 3)}</dd>
                  </div>
                  <div>
                    <dt>Offset</dt>
                    <dd>{device?.calibration?.offset ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Saved in browser</dt>
                    <dd>{device?.calibration?.saved ? "Yes" : "No"}</dd>
                  </div>
                  <div>
                    <dt>Sample age</dt>
                    <dd>{sample.hxAgeMs ?? "—"} ms</dd>
                  </div>
                </dl>
                <p className="status">{busy ? "Capturing samples…" : status}</p>
              </section>
              <Suspense
                fallback={<section className="panel">Loading targets…</section>}
              >
                <ResourceSetup />
              </Suspense>
            </div>
          )}
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importFile(file);
            }}
          />
        </div>
      </main>
      {running && (
        <button className="floating-stop" onClick={() => void stop()}>
          <CircleStop size={20} /> STOP ALL MOTORS
        </button>
      )}
    </div>
  );
}
