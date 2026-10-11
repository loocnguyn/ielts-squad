"use client";

import { useState, type PointerEvent } from "react";
import { ArrowDown } from "lucide-react";
import type { ChartSpec } from "@/lib/tests/types";

// Series colors come from the validated categorical slots in globals.css,
// assigned in fixed order. Text always uses text tokens, never a series color.
const SERIES = [1, 2, 3, 4, 5, 6].map((slot) => `var(--series-${slot})`);

type XYSpec = Extract<ChartSpec, { categories: string[] }>;

const W = 640;
const H = 340;
const M = { top: 16, right: 20, bottom: 44, left: 52 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function withUnit(value: number, unit?: string) {
  const text = fmt.format(value);
  if (!unit) return text;
  return /^[%°]/.test(unit) ? `${text}${unit}` : `${text} ${unit}`;
}

/** A clean axis: 0 (or below the data, if negative) up to a round maximum. */
function niceScale(values: number[]) {
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const rough = span / 5;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? rough;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Number(t.toFixed(10)));
  return { lo, hi, ticks };
}

function Legend({ names, mark }: { names: string[]; mark: "line" | "rect" }) {
  if (names.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      {names.map((name, i) => (
        <li key={name} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={mark === "line" ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-[3px]"}
            style={{ background: SERIES[i % SERIES.length] }}
          />
          {name}
        </li>
      ))}
    </ul>
  );
}

type TooltipState = { x: number; y: number; title: string; rows: { name: string; value: string; color?: string }[] };

function Tooltip({ tip }: { tip: TooltipState | null }) {
  if (!tip) return null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-32 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg"
      style={{ left: `${tip.x}%`, top: `${tip.y}%` }}
    >
      <p className="mb-1 font-medium text-muted-foreground">{tip.title}</p>
      {tip.rows.map((row) => (
        <p key={row.name} className="flex items-center gap-2">
          {row.color && <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: row.color }} />}
          <span className="font-semibold text-foreground tabular-nums">{row.value}</span>
          <span className="text-muted-foreground">{row.name}</span>
        </p>
      ))}
    </div>
  );
}

function Axes({
  ticks,
  y,
  categories,
  x,
  spec,
}: {
  ticks: number[];
  y: (v: number) => number;
  categories: string[];
  x: (i: number) => number;
  spec: XYSpec;
}) {
  return (
    <g className="fill-muted-foreground text-[11px]">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={M.left} x2={W - M.right} y1={y(tick)} y2={y(tick)} stroke="var(--chart-grid)" strokeWidth={1} />
          <text x={M.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" className="tabular-nums">
            {fmt.format(tick)}
          </text>
        </g>
      ))}
      {categories.map((category, i) => (
        <text key={i} x={x(i)} y={H - M.bottom + 16} textAnchor="middle">
          {category}
        </text>
      ))}
      {spec.x_label && (
        <text x={M.left + PLOT_W / 2} y={H - 6} textAnchor="middle">
          {spec.x_label}
        </text>
      )}
      {(spec.y_label || spec.unit) && (
        <text transform={`translate(12 ${M.top + PLOT_H / 2}) rotate(-90)`} textAnchor="middle">
          {[spec.y_label, spec.unit && `(${spec.unit})`].filter(Boolean).join(" ")}
        </text>
      )}
    </g>
  );
}

function LineChart({ spec }: { spec: XYSpec }) {
  const [active, setActive] = useState<number | null>(null);
  const { lo, hi, ticks } = niceScale(spec.series.flatMap((s) => s.values));
  const n = spec.categories.length;
  const x = (i: number) => M.left + (n === 1 ? PLOT_W / 2 : (i * PLOT_W) / (n - 1));
  const y = (v: number) => M.top + PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;

  // The crosshair snaps to the nearest category, so nobody has to hit a 2px line.
  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - M.left) / PLOT_W) * (n - 1));
    setActive(Math.max(0, Math.min(n - 1, i)));
  };

  const tip: TooltipState | null =
    active === null
      ? null
      : {
          x: (x(active) / W) * 100,
          y: (Math.min(...spec.series.map((s) => y(s.values[active]))) / H) * 100 - 3,
          title: spec.categories[active],
          rows: spec.series.map((s, i) => ({
            name: s.name,
            value: withUnit(s.values[active], spec.unit),
            color: SERIES[i % SERIES.length],
          })),
        };

  return (
    <div className="flex flex-col gap-3">
      <Legend names={spec.series.map((s) => s.name)} mark="line" />
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none"
          role="img"
          aria-label={spec.title}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setActive(null)}
        >
          <Axes ticks={ticks} y={y} categories={spec.categories} x={x} spec={spec} />
          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + PLOT_H} stroke="var(--muted-foreground)" strokeWidth={1} />
          )}
          {spec.series.map((series, s) => (
            <g key={series.name}>
              <polyline
                fill="none"
                stroke={SERIES[s % SERIES.length]}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={series.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              />
              {series.values.map((v, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(v)}
                  r={active === i ? 5 : 4}
                  fill={SERIES[s % SERIES.length]}
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              ))}
            </g>
          ))}
        </svg>
        <Tooltip tip={tip} />
      </div>
    </div>
  );
}

function BarChart({ spec }: { spec: XYSpec }) {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const { lo, hi, ticks } = niceScale(spec.series.flatMap((s) => s.values));
  const n = spec.categories.length;
  const band = PLOT_W / n;
  const gap = 2;
  // Bars stay thin: capped at 24px, the rest of the band is air.
  const barW = Math.min(24, (band * 0.8 - gap * (spec.series.length - 1)) / spec.series.length);
  const groupW = barW * spec.series.length + gap * (spec.series.length - 1);
  const x = (i: number) => M.left + band * i + band / 2;
  const y = (v: number) => M.top + PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;
  const zero = y(Math.max(lo, 0));

  return (
    <div className="flex flex-col gap-3">
      <Legend names={spec.series.map((s) => s.name)} mark="rect" />
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={spec.title}>
          <Axes ticks={ticks} y={y} categories={spec.categories} x={x} spec={spec} />
          {spec.categories.map((category, c) =>
            spec.series.map((series, s) => {
              const value = series.values[c];
              const top = Math.min(y(value), zero);
              const height = Math.max(Math.abs(y(value) - zero), 1);
              const left = x(c) - groupW / 2 + s * (barW + gap);
              const r = Math.min(4, height, barW / 2);
              const up = value >= 0;
              // Rounded at the data end, square on the baseline.
              const path = up
                ? `M${left},${top + height} V${top + r} Q${left},${top} ${left + r},${top} H${left + barW - r} Q${left + barW},${top} ${left + barW},${top + r} V${top + height} Z`
                : `M${left},${top} V${top + height - r} Q${left},${top + height} ${left + r},${top + height} H${left + barW - r} Q${left + barW},${top + height} ${left + barW},${top + height - r} V${top} Z`;
              const show = () =>
                setTip({
                  x: ((left + barW / 2) / W) * 100,
                  y: (top / H) * 100 - 2,
                  title: category,
                  rows: [{ name: series.name, value: withUnit(value, spec.unit), color: SERIES[s % SERIES.length] }],
                });
              return (
                <g key={`${c}-${s}`}>
                  <path d={path} fill={SERIES[s % SERIES.length]} />
                  {/* Hit target wider than the bar and as tall as the plot. */}
                  <rect
                    x={left - gap / 2}
                    y={M.top}
                    width={barW + gap}
                    height={PLOT_H}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${category}, ${series.name}: ${withUnit(value, spec.unit)}`}
                    className="outline-none focus-visible:stroke-ring"
                    onPointerEnter={show}
                    onPointerLeave={() => setTip(null)}
                    onFocus={show}
                    onBlur={() => setTip(null)}
                  />
                </g>
              );
            }),
          )}
        </svg>
        <Tooltip tip={tip} />
      </div>
    </div>
  );
}

function PieChart({ spec }: { spec: Extract<ChartSpec, { type: "pie" }> }) {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const total = spec.slices.reduce((sum, s) => sum + s.value, 0);
  const size = 240;
  const r = size / 2 - 4;
  const c = size / 2;
  const point = (angle: number) => [c + r * Math.sin(angle), c - r * Math.cos(angle)];
  const share = (value: number) => `${fmt.format((value / total) * 100)}%`;
  const ends = spec.slices.reduce<number[]>((acc, slice) => {
    acc.push((acc.at(-1) ?? 0) + (slice.value / total) * Math.PI * 2);
    return acc;
  }, []);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative w-56 shrink-0">
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full" role="img" aria-label={spec.title}>
          {spec.slices.map((slice, i) => {
            const start = i === 0 ? 0 : ends[i - 1];
            const end = ends[i];
            const [x1, y1] = point(start);
            const [x2, y2] = point(end);
            const [tx, ty] = point((start + end) / 2);
            const show = () =>
              setTip({
                x: ((c + (tx - c) * 0.6) / size) * 100,
                y: ((c + (ty - c) * 0.6) / size) * 100,
                title: slice.name,
                rows: [{ name: share(slice.value), value: withUnit(slice.value, spec.unit) }],
              });
            return (
              <path
                key={slice.name}
                d={`M${c},${c} L${x1},${y1} A${r},${r} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x2},${y2} Z`}
                fill={SERIES[i % SERIES.length]}
                // The 2px surface-colored stroke is the gap between slices.
                stroke="var(--card)"
                strokeWidth={2}
                tabIndex={0}
                aria-label={`${slice.name}: ${withUnit(slice.value, spec.unit)}`}
                className="outline-none"
                onPointerEnter={show}
                onPointerLeave={() => setTip(null)}
                onFocus={show}
                onBlur={() => setTip(null)}
              />
            );
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
      {/* Every slice is labelled with its value here, so identity never rests on color alone. */}
      <ul className="flex flex-col gap-1.5 text-sm">
        {spec.slices.map((slice, i) => (
          <li key={slice.name} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: SERIES[i % SERIES.length] }} />
            <span className="font-semibold tabular-nums">{withUnit(slice.value, spec.unit)}</span>
            <span className="text-muted-foreground">{slice.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((column, i) => (
              <th key={i} className={`border-b px-3 py-2 font-semibold ${i === 0 ? "text-left" : "text-right"}`}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b last:border-0">
              {row.map((cell, i) => (
                <td key={i} className={`px-3 py-2 ${i === 0 ? "text-left font-medium" : "text-right tabular-nums"}`}>
                  {typeof cell === "number" ? fmt.format(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProcessDiagram({ spec }: { spec: Extract<ChartSpec, { type: "process" }> }) {
  return (
    <ol className="flex flex-col items-stretch gap-1">
      {spec.steps.map((step, i) => (
        <li key={i} className="flex flex-col items-center gap-1">
          <div className="flex w-full items-start gap-3 rounded-lg border bg-background px-3 py-2.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold">
              {i + 1}
            </span>
            <div className="text-sm">
              <p className="font-semibold">{step.label}</p>
              {step.detail && <p className="text-muted-foreground">{step.detail}</p>}
            </div>
          </div>
          {i < spec.steps.length - 1 && <ArrowDown aria-hidden className="size-4 text-muted-foreground" />}
        </li>
      ))}
    </ol>
  );
}

/** Table equivalent of a line/bar/pie chart, so every value is reachable without hovering. */
function asTable(spec: ChartSpec): { columns: string[]; rows: (string | number)[][] } | null {
  if (spec.type === "line" || spec.type === "bar") {
    return {
      columns: [spec.x_label ?? "", ...spec.series.map((s) => s.name)],
      rows: spec.categories.map((category, i) => [category, ...spec.series.map((s) => s.values[i])]),
    };
  }
  if (spec.type === "pie") {
    return { columns: ["", spec.unit ?? "Value"], rows: spec.slices.map((s) => [s.name, s.value]) };
  }
  return null;
}

export function Task1Chart({ spec }: { spec: ChartSpec }) {
  const [showTable, setShowTable] = useState(false);
  const table = asTable(spec);

  return (
    <figure className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{spec.title}</span>
        {table && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setShowTable((v) => !v)}
          >
            {showTable ? "Xem biểu đồ" : "Xem dạng bảng"}
          </button>
        )}
      </figcaption>
      {showTable && table ? (
        <DataTable columns={table.columns} rows={table.rows} />
      ) : spec.type === "line" ? (
        <LineChart spec={spec} />
      ) : spec.type === "bar" ? (
        <BarChart spec={spec} />
      ) : spec.type === "pie" ? (
        <PieChart spec={spec} />
      ) : spec.type === "table" ? (
        <DataTable columns={spec.columns} rows={spec.rows} />
      ) : (
        <ProcessDiagram spec={spec} />
      )}
    </figure>
  );
}
