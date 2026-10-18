import { useRef } from "react";
import type { Profile } from "./types";
import { duration, newSegment } from "./profiles";
import { Plus, Trash2 } from "lucide-react";
export function ProfileEditor({
  profile,
  onChange,
  disabled = false,
}: {
  profile: Profile;
  onChange: (p: Profile) => void;
  disabled?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    index: number;
    end: boolean;
    startX: number;
    duration: number;
    total: number;
  } | null>(null);
  const total = duration(profile);
  let t = 0;
  const segments = profile.segments.map((s, i) => {
    const start = t;
    t += s.durationMs;
    return { ...s, index: i, start, end: t };
  });
  function patch(index: number, values: Partial<Profile["segments"][number]>) {
    onChange({
      ...profile,
      segments: profile.segments.map((s, i) =>
        i === index ? { ...s, ...values } : s,
      ),
    });
  }
  function move(event: React.PointerEvent) {
    if (!drag.current || disabled || !svg.current) return;
    const d = drag.current;
    const rect = svg.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 1000;
    const y = ((event.clientY - rect.top) / rect.height) * 260;
    const pct = Math.max(
      0,
      Math.min(100, Math.round(((210 - y) / 1.7) * 10) / 10),
    );
    const values: Partial<Profile["segments"][number]> = d.end
      ? {
          to: pct,
          durationMs: Math.max(
            100,
            Math.min(
              600000,
              Math.round(
                (d.duration + ((x - d.startX) / 900) * d.total) / 100,
              ) * 100,
            ),
          ),
        }
      : { from: pct };
    if (profile.segments[d.index].kind === "hold")
      values.to = values.from ?? pct;
    if (profile.segments[d.index].kind === "hold" && d.end) values.from = pct;
    patch(d.index, values);
  }
  return (
    <div className="editor">
      <div className="editor-caption">
        <span>THROTTLE / %</span>
        <span>
          Drag points to shape throttle · drag end points to change time
        </span>
      </div>
      <svg
        ref={svg}
        className="profile-svg"
        viewBox="0 0 1000 260"
        role="img"
        aria-label="Editable throttle profile"
        onPointerMove={move}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b6f36a" stopOpacity=".18" />
            <stop offset="100%" stopColor="#b6f36a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1="55"
              x2="955"
              y1={210 - v * 1.7}
              y2={210 - v * 1.7}
              className="grid"
            />
            <text x="35" y={214 - v * 1.7} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {segments.map((s) => {
          const x = 55 + (s.start / total) * 900;
          const end = 55 + (s.end / total) * 900;
          const from = s.kind === "stop" ? 0 : s.from;
          const to = s.kind === "linear" ? s.to : from;
          const y = 210 - from * 1.7;
          const y2 = 210 - to * 1.7;
          return (
            <g key={s.id}>
              <path
                d={`M${x} 210 L${x} ${y} L${end} ${y2} L${end} 210Z`}
                fill="url(#fill)"
              />
              <path
                d={`M${x} ${y} L${end} ${y2}`}
                stroke={s.kind === "stop" ? "#627085" : "#b6f36a"}
                strokeWidth="2.5"
              />
              {s.index > 0 && (
                <line
                  x1={x}
                  x2={x}
                  y1={
                    210 -
                    (segments[s.index - 1].kind === "stop"
                      ? 0
                      : segments[s.index - 1].kind === "linear"
                        ? segments[s.index - 1].to
                        : segments[s.index - 1].from) *
                      1.7
                  }
                  y2={y}
                  stroke="#b6f36a"
                  strokeDasharray="3 3"
                />
              )}
              {s.kind !== "stop" &&
                [false, true].map((endPoint) => (
                  <circle
                    key={String(endPoint)}
                    cx={endPoint ? end : x}
                    cy={endPoint ? y2 : y}
                    r="5"
                    className="handle"
                    onPointerDown={(e) => {
                      if (disabled) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      const r = svg.current!.getBoundingClientRect();
                      drag.current = {
                        index: s.index,
                        end: endPoint,
                        startX: ((e.clientX - r.left) / r.width) * 1000,
                        duration: s.durationMs,
                        total,
                      };
                    }}
                  />
                ))}
              <text x={x + 3} y="235">
                {(s.start / 1000).toFixed(1)}s
              </text>
              {s.minimum && (
                <text x={x + 5} y="200" className="minimum">
                  MIN
                </text>
              )}
            </g>
          );
        })}
        <text x="955" y="235" textAnchor="end">
          {total / 1000}s
        </text>
      </svg>
      <div className="segment-table">
        <div className="segment-row table-label">
          <span>SEGMENT</span>
          <span>SECONDS</span>
          <span>FROM %</span>
          <span>TO %</span>
          <span>MIN RUN</span>
          <span />
        </div>
        {profile.segments.map((s, i) => (
          <div className="segment-row" key={s.id}>
            <select
              aria-label={`Segment ${i + 1} type`}
              disabled={disabled}
              value={s.kind}
              onChange={(e) =>
                patch(i, { kind: e.target.value as typeof s.kind })
              }
            >
              <option value="hold">{i + 1}. Hold</option>
              <option value="linear">{i + 1}. Ramp</option>
              <option value="stop">{i + 1}. Stop</option>
            </select>
            <input
              aria-label={`Segment ${i + 1} seconds`}
              type="number"
              min="0.1"
              max="600"
              step="0.1"
              disabled={disabled}
              value={s.durationMs / 1000}
              onChange={(e) =>
                patch(i, {
                  durationMs: Math.max(
                    100,
                    Math.min(600000, Number(e.target.value) * 1000),
                  ),
                })
              }
            />
            <input
              aria-label={`Segment ${i + 1} from percent`}
              type="number"
              min="0"
              max="100"
              step="0.1"
              disabled={disabled || s.kind === "stop"}
              value={s.from}
              onChange={(e) =>
                patch(i, {
                  from: Math.max(0, Math.min(100, Number(e.target.value))),
                })
              }
            />
            <input
              aria-label={`Segment ${i + 1} to percent`}
              type="number"
              min="0"
              max="100"
              step="0.1"
              disabled={disabled || s.kind !== "linear"}
              value={s.to}
              onChange={(e) =>
                patch(i, {
                  to: Math.max(0, Math.min(100, Number(e.target.value))),
                })
              }
            />
            <input
              aria-label={`Segment ${i + 1} minimum running at zero`}
              type="checkbox"
              disabled={disabled || s.kind === "stop"}
              checked={!!s.minimum}
              onChange={(e) => patch(i, { minimum: e.target.checked })}
            />
            <button
              aria-label={`Delete segment ${i + 1}`}
              className="icon"
              disabled={disabled || profile.segments.length === 1}
              onClick={() =>
                onChange({
                  ...profile,
                  segments: profile.segments.filter((_, n) => n !== i),
                })
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        className="quiet"
        disabled={disabled || profile.segments.length >= 200}
        onClick={() =>
          onChange({
            ...profile,
            segments: [...profile.segments, newSegment()],
          })
        }
      >
        <Plus size={15} /> Add segment
      </button>
    </div>
  );
}
