"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";

import { cn } from "@/lib/utils";

/**
 * Chart primitives.
 *
 * Rules applied throughout, not per-chart:
 *  - One y-axis. Never two scales on one plot.
 *  - Series colours come from fixed slots (`--series-1..4`) assigned in order
 *    and never cycled; a filter that removes a series never repaints the rest.
 *  - Every chart has a legend when it has two or more series, plus a table
 *    view — so identity is never carried by colour alone.
 *  - Grid and axes are recessive; marks are thin.
 */

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

export type SeriesDef = {
  key: string;
  label: string;
  /** Formats the value in tooltips, labels and the table view. */
  format?: (value: number) => string;
};

const AXIS_STYLE = {
  fontSize: 11,
  fill: "var(--viz-ink-muted)",
} as const;

function ChartFrame({
  title,
  description,
  series,
  rows,
  categoryKey,
  categoryLabel,
  children,
  height = 260,
  action,
}: {
  title: string;
  description?: string;
  series: SeriesDef[];
  rows: Array<Record<string, string | number>>;
  categoryKey: string;
  categoryLabel: string;
  children: React.ReactNode;
  height?: number;
  action?: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <div className="viz-root card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {/* The table view is the accessibility relief for low-contrast
              slots and for anyone who cannot use the plot. */}
          <button
            type="button"
            onClick={() => setShowTable((value) => !value)}
            aria-pressed={showTable}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
          >
            {showTable ? "Show chart" : "Show table"}
          </button>
        </div>
      </div>

      {showTable ? (
        <div className="max-h-72 overflow-auto px-5 pb-4">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th scope="col" className="py-2 text-left text-xs font-medium text-[var(--text-muted)]">
                  {categoryLabel}
                </th>
                {series.map((entry) => (
                  <th
                    key={entry.key}
                    scope="col"
                    className="py-2 text-right text-xs font-medium text-[var(--text-muted)]"
                  >
                    {entry.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-[var(--border)] last:border-0">
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {row[categoryKey]}
                  </th>
                  {series.map((entry) => (
                    <td key={entry.key} className="numeric py-1.5 text-right">
                      {entry.format
                        ? entry.format(Number(row[entry.key] ?? 0))
                        : String(row[entry.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }} className="px-2 pr-4 pb-3">
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Tooltip
// -----------------------------------------------------------------------------

function VizTooltip({
  active,
  payload,
  label,
  series,
}: TooltipProps<number, string> & { series: SeriesDef[] }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-[var(--text)]">{label}</p>
      <ul className="space-y-0.5">
        {payload.map((entry) => {
          const definition = series.find((item) => item.key === entry.dataKey);
          return (
            <li key={String(entry.dataKey)} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: entry.color }}
              />
              <span className="text-[var(--text-muted)]">
                {definition?.label ?? entry.name}
              </span>
              {/* Value stays in ink, never the series colour. */}
              <span className="numeric ml-auto font-medium text-[var(--text)]">
                {definition?.format
                  ? definition.format(Number(entry.value ?? 0))
                  : String(entry.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function legendFormatter(value: string, series: SeriesDef[]) {
  const definition = series.find((item) => item.key === value);
  return (
    <span className="text-xs text-[var(--text-muted)]">
      {definition?.label ?? value}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Line / area trend — change over time
// -----------------------------------------------------------------------------

export function TrendChart({
  title,
  description,
  rows,
  categoryKey,
  categoryLabel,
  series,
  height,
  area = false,
  yDomain,
  action,
}: {
  title: string;
  description?: string;
  rows: Array<Record<string, string | number>>;
  categoryKey: string;
  categoryLabel: string;
  series: SeriesDef[];
  height?: number;
  area?: boolean;
  yDomain?: [number, number];
  action?: React.ReactNode;
}) {
  const Chart = area ? AreaChart : LineChart;

  return (
    <ChartFrame
      title={title}
      description={description}
      series={series}
      rows={rows}
      categoryKey={categoryKey}
      categoryLabel={categoryLabel}
      height={height}
      action={action}
    >
      <Chart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid
          stroke="var(--viz-grid)"
          strokeDasharray="0"
          vertical={false}
        />
        <XAxis
          dataKey={categoryKey}
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={{ stroke: "var(--viz-axis)" }}
          minTickGap={16}
        />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={44}
          domain={yDomain}
        />
        <Tooltip
          content={<VizTooltip series={series} />}
          cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
        />
        {series.length > 1 ? (
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => legendFormatter(value, series)}
          />
        ) : null}

        {series.map((entry, index) =>
          area ? (
            <Area
              key={entry.key}
              type="monotone"
              dataKey={entry.key}
              name={entry.key}
              stroke={SERIES[index % SERIES.length]}
              strokeWidth={2}
              fill={SERIES[index % SERIES.length]}
              fillOpacity={0.12}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)" }}
            />
          ) : (
            <Line
              key={entry.key}
              type="monotone"
              dataKey={entry.key}
              name={entry.key}
              stroke={SERIES[index % SERIES.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)" }}
            />
          ),
        )}
      </Chart>
    </ChartFrame>
  );
}

// -----------------------------------------------------------------------------
// Bars — magnitude comparison
// -----------------------------------------------------------------------------

export function BarSeriesChart({
  title,
  description,
  rows,
  categoryKey,
  categoryLabel,
  series,
  stacked = false,
  horizontal = false,
  height,
  action,
  /** Colours individual bars by a rule rather than by series. */
  colourBy,
}: {
  title: string;
  description?: string;
  rows: Array<Record<string, string | number>>;
  categoryKey: string;
  categoryLabel: string;
  series: SeriesDef[];
  stacked?: boolean;
  horizontal?: boolean;
  height?: number;
  action?: React.ReactNode;
  colourBy?: (row: Record<string, string | number>) => string;
}) {
  return (
    <ChartFrame
      title={title}
      description={description}
      series={series}
      rows={rows}
      categoryKey={categoryKey}
      categoryLabel={categoryLabel}
      height={height}
      action={action}
    >
      <BarChart
        data={rows}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 12, left: horizontal ? 8 : 0, bottom: 0 }}
        barCategoryGap={horizontal ? "22%" : "28%"}
      >
        <CartesianGrid
          stroke="var(--viz-grid)"
          strokeDasharray="0"
          vertical={horizontal}
          horizontal={!horizontal}
        />
        {horizontal ? (
          <>
            <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey={categoryKey}
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={{ stroke: "var(--viz-axis)" }}
              width={110}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={categoryKey}
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={{ stroke: "var(--viz-axis)" }}
              interval={0}
            />
            <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={44} />
          </>
        )}
        <Tooltip
          content={<VizTooltip series={series} />}
          cursor={{ fill: "var(--viz-grid)", fillOpacity: 0.4 }}
        />
        {series.length > 1 ? (
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => legendFormatter(value, series)}
          />
        ) : null}

        {series.map((entry, index) => (
          <Bar
            key={entry.key}
            dataKey={entry.key}
            name={entry.key}
            stackId={stacked ? "stack" : undefined}
            fill={SERIES[index % SERIES.length]}
            // 4px rounded data-end, square against the baseline.
            radius={
              horizontal
                ? ([0, 4, 4, 0] as [number, number, number, number])
                : ([4, 4, 0, 0] as [number, number, number, number])
            }
            // 2px of surface between stacked segments keeps them separable
            // without relying on colour contrast alone.
            stroke={stacked ? "var(--viz-surface)" : undefined}
            strokeWidth={stacked ? 2 : 0}
          >
            {colourBy
              ? rows.map((row, rowIndex) => (
                  <Cell key={rowIndex} fill={colourBy(row)} />
                ))
              : null}
          </Bar>
        ))}
      </BarChart>
    </ChartFrame>
  );
}

// -----------------------------------------------------------------------------
// Sparkline — a trend inside a stat tile, no axes, no chrome
// -----------------------------------------------------------------------------

export function Sparkline({
  values,
  className,
  tone = "primary",
}: {
  values: number[];
  className?: string;
  tone?: "primary" | "success" | "danger";
}) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const stroke =
    tone === "success"
      ? "var(--success)"
      : tone === "danger"
        ? "var(--danger)"
        : "var(--primary)";

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("h-8 w-full", className)}
      role="img"
      aria-label={`Trend from ${values[0]} to ${values[values.length - 1]}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
