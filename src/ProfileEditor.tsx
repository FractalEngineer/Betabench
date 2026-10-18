import { useRef, useState } from "react";
import type { Profile } from "./types";
import { duration, insertedPoint, movedPoint, removedPoint } from "./profiles";
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
    total: number;
    base: Profile;
    snapX?: number;
    snapY?: number;
  } | null>(null);
  const [selected, setSelected] = useState(0);
  const [, redraw] = useState(0);
  const total = drag.current?.total ?? duration(profile);
  function coords(clientX: number, clientY: number) {
    return new DOMPoint(clientX, clientY).matrixTransform(
      svg.current!.getScreenCTM()!.inverse(),
    );
  }
  function move(e: React.PointerEvent) {
    if (!drag.current || disabled) return;
    const d = drag.current;
    const q = coords(e.clientX, e.clientY);
    const rect = svg.current!.getBoundingClientRect();
    const scale = svg.current!.getScreenCTM()!.a;
    const time = ((q.x - 55) / 900) * d.total;
    const pct = ((250 - q.y) / 220) * 100;
    // Eight CSS pixels acquire a right-angle alignment; sixteen release it.
    const xThreshold =
      ((d.snapX === undefined ? 8 : 16) / scale / 900) * d.total;
    const yThreshold = ((d.snapY === undefined ? 8 : 16) / scale / 220) * 100;
    const next = movedPoint(
      d.base,
      d.index,
      time,
      pct,
      e.altKey ? 0 : xThreshold,
      e.altKey ? 0 : yThreshold,
    );
    const p = next.points[d.index];
    d.snapX = p.timeMs !== Math.round(time / 10) * 10 ? p.timeMs : undefined;
    d.snapY = p.throttle !== Math.round(pct * 10) / 10 ? p.throttle : undefined;
    if (rect.width) onChange(next);
  }
  function end() {
    drag.current = null;
    redraw((n) => n + 1);
  }
  return (
    <div className="editor">
      <div className="editor-caption">
        <span>Throttle (%)</span>
        <span>Drag points · double-click to add · Alt disables snapping</span>
      </div>
      <svg
        ref={svg}
        className="profile-svg"
        viewBox="0 0 1000 300"
        aria-label="Editable throttle profile"
        role="img"
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={(e) => {
          if (disabled || profile.points.length >= 500) return;
          const q = coords(e.clientX, e.clientY);
          onChange(
            insertedPoint(
              profile,
              ((q.x - 55) / 900) * total,
              ((250 - q.y) / 220) * 100,
            ),
          );
        }}
      >
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1="55"
              x2="955"
              y1={250 - v * 2.2}
              y2={250 - v * 2.2}
              className="grid"
            />
            <text x="40" y={254 - v * 2.2} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <text key={i} x={55 + i * 150} y="278" textAnchor="middle">
            {((total * i) / 6000).toFixed(1)}s
          </text>
        ))}
        <polyline
          points={profile.points
            .map(
              (p) =>
                `${55 + (p.timeMs / total) * 900},${250 - p.throttle * 2.2}`,
            )
            .join(" ")}
          fill="none"
          stroke="#ffbb00"
          strokeWidth="2.5"
        />
        {profile.points.map((p, i) => (
          <g key={p.id}>
            <circle
              className={"handle " + (i === selected ? "selected-point" : "")}
              cx={55 + (p.timeMs / total) * 900}
              cy={250 - p.throttle * 2.2}
              r="6"
              tabIndex={disabled ? -1 : 0}
              role="button"
              aria-label={`Curve point ${i + 1}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (disabled) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                setSelected(i);
                drag.current = {
                  index: i,
                  total: duration(profile),
                  base: structuredClone(profile),
                };
              }}
              onKeyDown={(e) => {
                if (disabled) return;
                if (
                  ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    e.key,
                  )
                ) {
                  e.preventDefault();
                  onChange(
                    movedPoint(
                      profile,
                      i,
                      p.timeMs +
                        (e.key === "ArrowRight"
                          ? 100
                          : e.key === "ArrowLeft"
                            ? -100
                            : 0),
                      p.throttle +
                        (e.key === "ArrowUp"
                          ? 1
                          : e.key === "ArrowDown"
                            ? -1
                            : 0),
                    ),
                  );
                }
              }}
            />
            {p.minimum && p.throttle === 0 && (
              <text
                className="minimum"
                x={58 + (p.timeMs / total) * 900}
                y="238"
              >
                MIN
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="point-table">
        <div className="point-row table-label">
          <span>Point</span>
          <span>Time (s)</span>
          <span>Throttle (%)</span>
          <span>Min run</span>
          <span />
        </div>
        {profile.points.map((p, i) => (
          <div
            key={p.id}
            className={
              "point-row " + (selected === i ? "active-point-row" : "")
            }
            onFocus={() => setSelected(i)}
          >
            <span>{i + 1}</span>
            <input
              aria-label={`Point ${i + 1} time`}
              type="number"
              min="0"
              max="3600"
              step="0.01"
              disabled={disabled || i === 0}
              value={p.timeMs / 1000}
              onChange={(e) =>
                onChange(
                  movedPoint(
                    profile,
                    i,
                    Number(e.target.value) * 1000,
                    p.throttle,
                  ),
                )
              }
            />
            <input
              aria-label={`Point ${i + 1} throttle`}
              type="number"
              min="0"
              max="100"
              step="0.1"
              disabled={disabled}
              value={p.throttle}
              onChange={(e) =>
                onChange(
                  movedPoint(profile, i, p.timeMs, Number(e.target.value)),
                )
              }
            />
            <input
              aria-label={`Point ${i + 1} minimum running`}
              type="checkbox"
              checked={!!p.minimum}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...profile,
                  points: profile.points.map((q, n) =>
                    n === i ? { ...q, minimum: e.target.checked } : q,
                  ),
                })
              }
            />
            <button
              className="icon"
              aria-label={`Delete point ${i + 1}`}
              disabled={disabled || profile.points.length <= 2 || i === 0}
              onClick={() => onChange(removedPoint(profile, i))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        disabled={disabled || profile.points.length >= 500}
        onClick={() => onChange(insertedPoint(profile))}
      >
        <Plus size={14} /> Add point
      </button>
    </div>
  );
}
