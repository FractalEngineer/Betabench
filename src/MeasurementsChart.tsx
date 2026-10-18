import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Sample } from "./types";
import { loadUnits, type LoadUnit } from "./calibration";
export const metrics = {
  current: { label: "Current", unit: "A", color: "#3599ff" },
  voltage: { label: "Voltage", unit: "V", color: "#ffbb00" },
  power: { label: "Power", unit: "W", color: "#ca83ed" },
  thrustG: { label: "Thrust", unit: "g", color: "#35c581" },
} as const;
export type Metric = keyof typeof metrics;
export function MetricSelector({
  selected,
  onChange,
  unit,
}: {
  selected: Metric[];
  onChange: (m: Metric[]) => void;
  unit: LoadUnit;
}) {
  return (
    <div className="metric-selector">
      {(Object.keys(metrics) as Metric[]).map((key) => (
        <label key={key} style={{ color: metrics[key].color }}>
          <input
            type="checkbox"
            aria-label={`Show ${metrics[key].label}`}
            checked={selected.includes(key)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...selected, key]
                  : selected.filter((k) => k !== key),
              )
            }
          />
          {metrics[key].label} ({key === "thrustG" ? unit : metrics[key].unit})
        </label>
      ))}
    </div>
  );
}
export function MeasurementsChart({
  series,
  selected,
  unit,
}: {
  series: { id: string; name: string; samples: Sample[] }[];
  selected: Metric[];
  unit: LoadUnit;
}) {
  return (
    <div className="chart">
      {series.some((s) => s.samples.length) ? (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 12, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 4"
              vertical={false}
            />
            <XAxis
              type="number"
              dataKey="seconds"
              domain={["dataMin", "dataMax"]}
              stroke="var(--muted)"
              tickFormatter={(v) => `${Number(v).toFixed(1)}s`}
            />
            {selected.map((key, i) => (
              <YAxis
                key={key}
                yAxisId={key}
                orientation={i % 2 ? "right" : "left"}
                stroke={metrics[key].color}
                width={46}
                tickCount={5}
                label={{
                  value: key === "thrustG" ? unit : metrics[key].unit,
                  position: "insideTop",
                  fill: metrics[key].color,
                }}
                tickFormatter={(v) =>
                  Number(v).toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                  })
                }
              />
            ))}
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
              labelFormatter={(v) => `${Number(v).toFixed(2)} s`}
              formatter={(v, name) => [
                typeof v === "number" ? v.toFixed(2) : v,
                name,
              ]}
            />
            {series.flatMap((s, index) =>
              selected.map((key) => (
                <Line
                  key={s.id + key}
                  name={`${s.name} · ${metrics[key].label} (${key === "thrustG" ? unit : metrics[key].unit})`}
                  data={s.samples
                    .filter(
                      (_, i, a) =>
                        i % Math.max(1, Math.ceil(a.length / 1000)) === 0,
                    )
                    .map((q) => ({
                      ...q,
                      seconds: q.t / 1000,
                      thrustG:
                        q.thrustG === undefined
                          ? undefined
                          : q.thrustG * loadUnits[unit].factor,
                    }))}
                  dataKey={key}
                  yAxisId={key}
                  stroke={metrics[key].color}
                  strokeDasharray={
                    index % 3 === 1
                      ? "7 4"
                      : index % 3 === 2
                        ? "2 3"
                        : undefined
                  }
                  dot={false}
                  strokeWidth={1.8}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              )),
            )}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="empty-chart">
          No samples. Run a profile to record measurements.
        </div>
      )}
    </div>
  );
}
