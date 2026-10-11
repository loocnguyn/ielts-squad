"use client";

import { useState, type PointerEvent } from "react";
import { formatBand } from "@/lib/bands";

export type TrendPoint = { date: string; band: number };

const W = 320;
const H = 150;
const M = { top: 12, right: 14, bottom: 22, left: 26 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

const shortDate = (iso: string) => {
  const [, month, day] = iso.split("-");
  return `${Number(day)}/${Number(month)}`;
};

/**
 * One series per chart (small multiples), so the title carries identity and
 * the hue is only decoration. Fixed 4-9 axis keeps the four skills comparable.
 */
export function BandTrend({
  title,
  color,
  points,
  target,
}: {
  title: string;
  color: string;
  points: TrendPoint[];
  target?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const lo = 4;
  const hi = 9;
  const n = points.length;
  const x = (i: number) => M.left + (n <= 1 ? PLOT_W / 2 : (i * PLOT_W) / (n - 1));
  const y = (band: number) => M.top + PLOT_H - ((Math.max(lo, Math.min(hi, band)) - lo) / (hi - lo)) * PLOT_H;

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    if (n === 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    const i = n === 1 ? 0 : Math.round(((px - M.left) / PLOT_W) * (n - 1));
    setActive(Math.max(0, Math.min(n - 1, i)));
  };

  const last = points.at(-1);
  const shown = active !== null ? points[active] : null;

  return (
    <figure className="rounded-2xl border bg-card p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: color }} />
          {title}
        </span>
        <span className="text-sm text-muted-foreground">
          {shown ? (
            <>
              {shortDate(shown.date)} · <span className="font-semibold text-foreground">{formatBand(shown.band)}</span>
            </>
          ) : last ? (
            <>
              Gần nhất <span className="font-semibold text-foreground">{formatBand(last.band)}</span>
            </>
          ) : (
            "Chưa có điểm"
          )}
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full touch-none"
        role="img"
        aria-label={`${title}: ${points.map((p) => `${shortDate(p.date)} band ${formatBand(p.band)}`).join(", ") || "chưa có điểm"}`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setActive(null)}
      >
        <g className="fill-muted-foreground text-[10px]">
          {[4, 5, 6, 7, 8, 9].map((tick) => (
            <g key={tick}>
              <line x1={M.left} x2={W - M.right} y1={y(tick)} y2={y(tick)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={M.left - 6} y={y(tick)} textAnchor="end" dominantBaseline="middle" className="tabular-nums">
                {tick}
              </text>
            </g>
          ))}
          {n > 0 && (
            <>
              <text x={x(0)} y={H - 6} textAnchor={n === 1 ? "middle" : "start"}>
                {shortDate(points[0].date)}
              </text>
              {n > 1 && (
                <text x={x(n - 1)} y={H - 6} textAnchor="end">
                  {shortDate(points[n - 1].date)}
                </text>
              )}
            </>
          )}
        </g>

        {target != null && target >= lo && target <= hi && (
          <g>
            <line x1={M.left} x2={W - M.right} y1={y(target)} y2={y(target)} stroke="var(--muted-foreground)" strokeWidth={1} />
            <text x={W - M.right} y={y(target) - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
              Mục tiêu {formatBand(target)}
            </text>
          </g>
        )}

        {active !== null && n > 0 && (
          <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + PLOT_H} stroke="var(--muted-foreground)" strokeWidth={1} />
        )}
        {n > 1 && (
          <polyline
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points.map((p, i) => `${x(i)},${y(p.band)}`).join(" ")}
          />
        )}
        {points.map((p, i) =>
          // Only the latest point and the hovered one get a marker; the line carries the rest.
          i === n - 1 || i === active ? (
            <circle key={i} cx={x(i)} cy={y(p.band)} r={4} fill={color} stroke="var(--card)" strokeWidth={2} />
          ) : null,
        )}
      </svg>
    </figure>
  );
}

/** A bare trend line for table rows. The row's numbers carry the exact values. */
export function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const w = 96;
  const h = 28;
  const present = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (present.length === 0) return <span className="text-xs text-muted-foreground">–</span>;
  const x = (i: number) => 4 + (values.length <= 1 ? 0 : (i * (w - 8)) / (values.length - 1));
  const y = (v: number) => h - 4 - ((Math.max(4, Math.min(9, v)) - 4) / 5) * (h - 8);
  const lastPoint = present[present.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-24" role="img" aria-label={label}>
      {present.length > 1 && (
        <polyline
          fill="none"
          stroke="var(--muted-foreground)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={present.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}
        />
      )}
      <circle cx={x(lastPoint.i)} cy={y(lastPoint.v)} r={3.5} fill="var(--foreground)" stroke="var(--card)" strokeWidth={2} />
    </svg>
  );
}
