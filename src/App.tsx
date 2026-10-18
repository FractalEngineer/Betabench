import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Cable,
  Check,
  ChevronRight,
  CircleStop,
  Copy,
  FlaskConical,
  Gauge,
  GitBranch,
  Play,
  Plus,
  Radio,
  Save,
  Scale,
  SlidersHorizontal,
  Trash2,
  Unplug,
  Zap,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BenchDevice, Profile, Run, Sample } from "./types";
import { presets, duplicate, duration, validateProfile } from "./profiles";
import { FlightController, SerialLink, Simulator } from "./device";
import { RunController } from "./runner";
import { store, download, csv, validateRun } from "./storage";
import { ProfileEditor } from "./ProfileEditor";

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
  const [status, setStatus] = useState("Ready when you are");
  const [error, setError] = useState("");
  const [sample, setSample] = useState<Partial<Sample>>({});
  const [activeRun, setActiveRun] = useState<Run>();
  const [runs, setRuns] = useState<Run[]>([]);
  const [overlays, setOverlays] = useState<string[]>([]);
  const [metric, setMetric] = useState<
    "current" | "thrustG" | "voltage" | "power"
  >("current");
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
  const points = samples
    .slice(-3000)
    .filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 600)) === 0)
    .map((s) => ({ ...s, seconds: s.t / 1000 }));
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
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <div className="brand-icon">
            <Activity size={24} />
          </div>
          <span>
            beta<span className="brand-light">bench</span>
            <small>MOTOR & ESC LAB</small>
          </span>
        </a>
        <div className="workspace-tag">
          <span className="dot" /> WORKSPACE / LOCAL
        </div>
        <nav>
          {(
            [
              ["bench", "Test bench", <SlidersHorizontal size={18} />],
              ["history", "Run history", <Activity size={18} />],
              ["loadcell", "Load cell", <Scale size={18} />],
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
        <div className="sidebar-bottom">
          <div>
            <GitBranch size={14} /> v0.1 · open source
          </div>
          <a
            href="https://github.com/FractalEngineer/Betabench"
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub <ChevronRight size={13} />
          </a>
          <p>
            Your hardware. Your data.
            <br />
            Everything stays in this browser.
          </p>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} />{" "}
            {tab === "bench"
              ? "Test bench"
              : tab === "history"
                ? "Run history"
                : "Load cell"}
          </span>
          <span className="local-badge">
            <span className={"dot " + (device ? "green" : "")} />
            {device
              ? identity?.simulated
                ? "SIMULATION"
                : "FC CONNECTED"
              : "NO DEVICE"}
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div className="eyebrow">
              BETAfLIGHT POWERED · BROWSER CONTROLLED
            </div>
            <h1>
              {tab === "bench"
                ? "The motor lab."
                : tab === "history"
                  ? "Every run, recorded."
                  : "Measure the pull."}
            </h1>
            <p>
              {tab === "bench"
                ? "Shape a sweep. Spin it up. See what your setup can do."
                : tab === "history"
                  ? "Compare setups and take your measurements with you."
                  : "Zero, calibrate, and capture thrust with an HX711 load cell."}
            </p>
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          <section className="connection panel">
            <div className="connection-icon">
              <Cable size={22} />
            </div>
            <div className="connection-details">
              <strong>
                {device ? identity?.name : "Connect your flight controller"}
              </strong>
              <span>
                {device
                  ? `${identity?.simulated ? "SIMULATED · " : ""}Betaflight ${identity?.version} · MSP ${identity?.api} · ${identity?.motorCount} motors · ${identity?.enhanced ? "500 ms FC watchdog" : "Stock firmware"}`
                  : "USB serial · Betaflight API 1.42+ · desktop Chrome or Edge"}
              </span>
            </div>
            <div className="actions">
              {device ? (
                <button
                  disabled={busy || running}
                  onClick={() => void disconnect()}
                >
                  <Unplug size={15} /> Disconnect
                </button>
              ) : (
                <>
                  <button disabled={busy} onClick={() => void connect(true)}>
                    <FlaskConical size={15} /> Try simulator
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void connect()}
                  >
                    <Plus size={16} /> Connect FC
                  </button>
                </>
              )}
            </div>
          </section>
          {device && !identity?.enhanced && (
            <div className="notice warning">
              Stock firmware retains the last motor command if the browser
              crashes or USB disconnects. Use a physical power cutoff; enhanced
              firmware adds a 500 ms command watchdog.
            </div>
          )}
          {identity?.simulated && (
            <div className="simulation-label">
              <FlaskConical size={14} /> Simulation mode · Measurements are
              generated, no hardware is connected.
            </div>
          )}
          {tab === "bench" && (
            <>
              <div className="bench-grid">
                <section className="panel profile-panel">
                  <div className="section-heading">
                    <div>
                      <span className="section-number">01</span>
                      <h2>Throttle profile</h2>
                    </div>
                    <span className="pill">
                      {(duration(profile) / 1000).toFixed(1)} s
                    </span>
                  </div>
                  <div className="profile-toolbar">
                    <select
                      aria-label="Choose preset or saved profile"
                      disabled={running}
                      value={
                        profiles.some((p) => p.id === profile.id)
                          ? profile.id
                          : ""
                      }
                      onChange={(e) =>
                        setProfile(
                          structuredClone(
                            profiles.find((p) => p.id === e.target.value)!,
                          ),
                        )
                      }
                    >
                      {!profiles.some((p) => p.id === profile.id) && (
                        <option value="">Unsaved profile</option>
                      )}
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="icon"
                      title="Duplicate profile"
                      aria-label="Duplicate profile"
                      disabled={running}
                      onClick={() => setProfile(duplicate(profile))}
                    >
                      <Copy size={16} />
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
                  </div>
                  <input
                    className="profile-name"
                    aria-label="Profile name"
                    value={profile.name}
                    disabled={running}
                    maxLength={120}
                    onChange={(e) =>
                      setProfile({ ...profile, name: e.target.value })
                    }
                  />
                  <p className="subtle profile-description">
                    {profile.description}
                  </p>
                  <ProfileEditor
                    profile={profile}
                    onChange={setProfile}
                    disabled={running}
                  />
                  <div className="profile-foot">
                    <span>
                      <span className="legend-line" /> THROTTLE
                    </span>
                    <button
                      className="text-button"
                      disabled={running || busy}
                      onClick={() => input.current?.click()}
                    >
                      <ArrowUpFromLine size={13} /> Import profile / run
                    </button>
                  </div>
                </section>
                <section className="panel setup-panel">
                  <div className="section-heading">
                    <div>
                      <span className="section-number">02</span>
                      <h2>Run setup</h2>
                    </div>
                    <Gauge size={18} />
                  </div>
                  <label className="field-label">MOTOR OUTPUTS</label>
                  <div className="motor-buttons">
                    {Array.from(
                      { length: identity?.motorCount ?? 4 },
                      (_, i) => (
                        <button
                          key={i}
                          disabled={running}
                          aria-pressed={selected.includes(i)}
                          onClick={() =>
                            setSelected(
                              selected.includes(i)
                                ? selected.filter((v) => v !== i)
                                : [...selected, i],
                            )
                          }
                          className={selected.includes(i) ? "selected" : ""}
                        >
                          <span className="motor-symbol">✣</span>M{i + 1}
                          {selected.includes(i) && <Check size={12} />}
                        </button>
                      ),
                    )}
                  </div>
                  <p className="subtle">
                    Selected motors follow the same curve. Others stay stopped.
                  </p>
                  <label className="field-label" htmlFor="notes">
                    SETUP NOTES
                  </label>
                  <textarea
                    id="notes"
                    rows={3}
                    disabled={running}
                    placeholder="Motor, ESC, propeller, battery…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <div className="run-summary">
                    <span>
                      Profile duration
                      <strong>{(duration(profile) / 1000).toFixed(1)} s</strong>
                    </span>
                    <span>
                      Motor selection
                      <strong>
                        {selected.length} output
                        {selected.length === 1 ? "" : "s"}
                      </strong>
                    </span>
                    <span>
                      Measurements
                      <strong>
                        {identity?.hx711 ? "Electrical + thrust" : "Electrical"}
                      </strong>
                    </span>
                  </div>
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
                    <Play size={16} /> Run profile{" "}
                    <span>{(duration(profile) / 1000).toFixed(0)}s</span>
                  </button>
                  <button
                    className="stop-button"
                    disabled={!device}
                    onClick={() => void stop()}
                  >
                    <CircleStop size={16} /> STOP ALL MOTORS
                  </button>
                  <p className="fine-print">
                    Stay on this tab during a run. Switching tabs or losing
                    telemetry stops the test.
                  </p>
                </section>
              </div>
              <section className="panel telemetry-panel">
                <div className="section-heading">
                  <div>
                    <span className="section-number">03</span>
                    <h2>Live measurements</h2>
                    <span className={"pill " + (running ? "active-pill" : "")}>
                      {running
                        ? status === "Running"
                          ? "● RECORDING"
                          : status.startsWith("Starting")
                            ? "COUNTDOWN"
                            : "STOPPING"
                        : "LIVE VIEW"}
                    </span>
                  </div>
                  <span className="subtle">
                    {rate.toFixed(1)} Hz measured · {maxGap.toFixed(0)} ms max
                    gap
                  </span>
                </div>
                <div className="stats">
                  {stat("VOLTAGE", sample.voltage, "V", <Zap size={13} />)}
                  {stat("CURRENT", sample.current, "A", <Activity size={13} />)}
                  {stat("POWER", sample.power, "W", <Gauge size={13} />)}
                  {stat("THRUST", sample.thrustG, "g", <Scale size={13} />, 1)}
                  {stat("EFFICIENCY", efficiency, "g/W", <Radio size={13} />)}
                  {stat(
                    "THROTTLE",
                    sample.throttle ?? 0,
                    "%",
                    <SlidersHorizontal size={13} />,
                    1,
                  )}
                </div>
                <div className="chart-toolbar">
                  <span className="subtle">
                    {selected.length > 1
                      ? "Current and thrust are aggregate measurements."
                      : "FC current includes board consumption."}
                  </span>
                  <select
                    aria-label="Chart measurement"
                    value={metric}
                    onChange={(e) => setMetric(e.target.value as typeof metric)}
                  >
                    <option value="current">Current / A</option>
                    <option value="voltage">Voltage / V</option>
                    <option value="power">Power / W</option>
                    <option value="thrustG">Thrust / g</option>
                  </select>
                </div>
                <div className="chart">
                  {points.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={points}>
                        <CartesianGrid
                          stroke="#26303b"
                          strokeDasharray="3 5"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="seconds"
                          tickFormatter={(v) => `${v.toFixed(0)}s`}
                          stroke="#748293"
                          minTickGap={35}
                        />
                        <YAxis
                          yAxisId="measurement"
                          stroke="#748293"
                          width={45}
                        />
                        <YAxis
                          yAxisId="throttle"
                          orientation="right"
                          domain={[0, 100]}
                          stroke="#748293"
                          unit="%"
                          width={45}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#141b24",
                            border: "1px solid #354253",
                            borderRadius: 8,
                          }}
                          labelFormatter={(v) => `${Number(v).toFixed(2)}s`}
                        />
                        <Line
                          yAxisId="measurement"
                          dataKey={metric}
                          stroke="#77b7ff"
                          dot={false}
                          strokeWidth={2}
                          isAnimationActive={false}
                          connectNulls={false}
                        />
                        <Line
                          yAxisId="throttle"
                          dataKey="throttle"
                          stroke="#b6f36a"
                          dot={false}
                          strokeWidth={1.5}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="empty-chart">
                      <Activity size={30} />
                      <strong>Your next test starts here</strong>
                      <span>
                        Run a profile to plot throttle and measurements over
                        time.
                      </span>
                    </div>
                  )}
                </div>
                <div className="telemetry-footer">
                  <span className="status">
                    <span className={"dot " + (running ? "green" : "")} />
                    {status}
                  </span>
                  <span>
                    {(elapsed / 1000).toFixed(1)} s /{" "}
                    {(duration(activeRun?.profile ?? profile) / 1000).toFixed(
                      1,
                    )}{" "}
                    s
                  </span>
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
                        <ArrowDownToLine size={13} /> CSV
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
              </section>
            </>
          )}
          {tab === "history" && (
            <section className="panel history-panel">
              <div className="section-heading">
                <div>
                  <Activity size={18} />
                  <h2>Saved runs</h2>
                </div>
                <button
                  disabled={busy || running}
                  onClick={() => input.current?.click()}
                >
                  <ArrowUpFromLine size={14} /> Import JSON
                </button>
              </div>
              {!runs.length ? (
                <div className="empty-chart">
                  <Activity size={30} />
                  <strong>A clean slate</strong>
                  <span>
                    Your completed and interrupted tests will appear here.
                  </span>
                </div>
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
                            {r.selected.map((i) => i + 1).join(", M")} ·{" "}
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
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {overlays.length > 0 && (
                    <>
                      <div className="chart-toolbar">
                        <h3>Run comparison · seconds from start</h3>
                        <select
                          aria-label="Comparison measurement"
                          value={metric}
                          onChange={(e) =>
                            setMetric(e.target.value as typeof metric)
                          }
                        >
                          <option value="current">Current / A</option>
                          <option value="voltage">Voltage / V</option>
                          <option value="power">Power / W</option>
                          <option value="thrustG">Thrust / g</option>
                        </select>
                      </div>
                      <div className="chart">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart>
                            <CartesianGrid stroke="#26303b" vertical={false} />
                            <XAxis
                              type="number"
                              dataKey="seconds"
                              domain={["dataMin", "dataMax"]}
                              stroke="#748293"
                              unit="s"
                            />
                            <YAxis stroke="#748293" />
                            <Tooltip
                              contentStyle={{
                                background: "#141b24",
                                border: "1px solid #354253",
                              }}
                            />
                            {runs
                              .filter((r) => overlays.includes(r.id))
                              .map((r, i) => (
                                <Line
                                  key={r.id}
                                  name={`${r.profile.name} · ${new Date(r.startedAt).toLocaleTimeString()}`}
                                  data={r.samples
                                    .filter(
                                      (_, n) =>
                                        n %
                                          Math.max(
                                            1,
                                            Math.floor(r.samples.length / 1000),
                                          ) ===
                                        0,
                                    )
                                    .map((s) => ({
                                      ...s,
                                      seconds: s.t / 1000,
                                    }))}
                                  dataKey={metric}
                                  stroke={
                                    [
                                      "#b6f36a",
                                      "#77b7ff",
                                      "#f6bb75",
                                      "#cd99f6",
                                    ][i % 4]
                                  }
                                  dot={false}
                                  isAnimationActive={false}
                                  connectNulls={false}
                                />
                              ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="comparison-legend">
                        {runs
                          .filter((r) => overlays.includes(r.id))
                          .map((r, i) => (
                            <span
                              key={r.id}
                              style={{
                                color: [
                                  "#b6f36a",
                                  "#77b7ff",
                                  "#f6bb75",
                                  "#cd99f6",
                                ][i % 4],
                              }}
                            >
                              ● {r.profile.name} ·{" "}
                              {new Date(r.startedAt).toLocaleTimeString()}
                            </span>
                          ))}
                      </div>
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
                  <div>
                    <Scale size={19} />
                    <h2>HX711 calibration</h2>
                  </div>
                  <span className="pill">
                    {identity?.hx711 ? "SUPPORTED" : "OPTIONAL FIRMWARE"}
                  </span>
                </div>
                <div className="loadcell-reading">
                  {fmt(sample.thrustG, 2)}
                  <span>grams</span>
                </div>
                <p className="subtle">
                  {sample.hxValid
                    ? "Fresh, calibrated measurement"
                    : identity?.hx711
                      ? "Waiting for a valid calibrated sample"
                      : "Connect an FC built with USE_HX711, or try the simulator."}
                </p>
                <div className="calibration-steps">
                  <div>
                    <span className="step">1</span>
                    <div>
                      <h3>Zero the empty stand</h3>
                      <p>Remove external loads and let the stand settle.</p>
                    </div>
                    <button
                      disabled={!identity?.hx711 || running || busy}
                      onClick={() =>
                        void action(async () => {
                          await device!.tare();
                          setStatus("Tare complete — calibration is unsaved");
                        })
                      }
                    >
                      Tare
                    </button>
                  </div>
                  <div>
                    <span className="step">2</span>
                    <div>
                      <h3>Apply a known weight</h3>
                      <p>Use the same load direction as the measured thrust.</p>
                      <label className="mass-input">
                        <input
                          aria-label="Known weight in grams"
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={mass}
                          disabled={running || busy}
                          onChange={(e) => setMass(Number(e.target.value))}
                        />{" "}
                        g
                      </label>
                    </div>
                    <button
                      disabled={
                        !identity?.hx711 || running || busy || mass <= 0
                      }
                      onClick={() =>
                        void action(async () => {
                          await device!.calibrate(mass);
                          setStatus("Calibration complete — save to retain it");
                        })
                      }
                    >
                      Calibrate
                    </button>
                  </div>
                  <div>
                    <span className="step">3</span>
                    <div>
                      <h3>Save to the flight controller</h3>
                      <p>Tare and scale are retained after power cycling.</p>
                    </div>
                    <button
                      disabled={!identity?.hx711 || running || busy}
                      onClick={() =>
                        void action(async () => {
                          await device!.saveCalibration();
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
                    <dt>Saved to FC</dt>
                    <dd>{device?.calibration?.saved ? "Yes" : "No"}</dd>
                  </div>
                  <div>
                    <dt>Sample age</dt>
                    <dd>{sample.hxAgeMs ?? "—"} ms</dd>
                  </div>
                </dl>
                <p className="status">
                  {busy ? "Capturing stable samples…" : status}
                </p>
              </section>
              <section className="panel wiring">
                <div className="section-heading">
                  <div>
                    <Cable size={18} />
                    <h2>CLRACINGF4 wiring</h2>
                  </div>
                </div>
                <p>
                  Build with <code>USE_HX711</code>. USB remains the MSP
                  connection; the UART4 pads become GPIO resources.
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
                      <td>TX4 / PA0</td>
                      <td>PD_SCK</td>
                    </tr>
                    <tr>
                      <td>RX4 / PA1</td>
                      <td>DOUT / DT</td>
                    </tr>
                    <tr>
                      <td>GND</td>
                      <td>GND</td>
                    </tr>
                    <tr>
                      <td>Compatible supply</td>
                      <td>VCC / VDD</td>
                    </tr>
                  </tbody>
                </table>
                <p className="subtle">
                  FC GPIO uses 3.3 V logic. Check your module’s supply and logic
                  requirements; do not feed a 5 V DOUT into the FC.
                </p>
                <h3>Betaflight CLI</h3>
                <p>
                  Disable UART4 functions, release its resources, then assign
                  and save:
                </p>
                <pre>
                  {
                    "serial 3 0 115200 57600 0 115200\nresource SERIAL_TX 4 NONE\nresource SERIAL_RX 4 NONE\nresource HX711_SCK 1 A00\nresource HX711_DOUT 1 A01\nsave"
                  }
                </pre>
                <p className="subtle">
                  This reboots the FC. HX711 RATE selects 10 or 80 samples/s on
                  the module. Capture requires stopped motors and stable fresh
                  samples.
                </p>
                <a
                  href="https://github.com/FractalEngineer/Betabench/tree/main/firmware"
                  target="_blank"
                  rel="noreferrer"
                >
                  Firmware build and restoration guide{" "}
                  <ChevronRight size={14} />
                </a>
              </section>
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
          <footer>
            <span>
              <Activity size={13} /> BETABENCH
            </span>
            <span>Built for the bench. Made to measure.</span>
            <span>LOCAL STORAGE · NO CLOUD UPLOADS</span>
          </footer>
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
