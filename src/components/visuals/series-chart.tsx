"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const tick = { fill: "var(--muted-foreground)", fontSize: 11 };

export type Row = Record<string, number | string | null>;

export function SeriesChart({
  kind,
  data,
  keys,
  xLabel,
  yLabel,
  xNumeric,
  referenceLines,
  height = 240,
}: {
  kind: "line" | "bar" | "area";
  data: Row[];
  keys: string[];
  xLabel: string;
  yLabel: string;
  xNumeric: boolean;
  referenceLines?: { y: number; label: string }[];
  height?: number;
}) {
  const common = { data, margin: { top: 8, right: 12, bottom: 18, left: 4 } };
  const axes = [
    <CartesianGrid key="g" stroke="var(--border)" strokeDasharray="3 3" />,
    <XAxis
      key="x"
      dataKey="x"
      type={xNumeric && kind !== "bar" ? "number" : "category"}
      domain={xNumeric && kind !== "bar" ? ["dataMin", "dataMax"] : undefined}
      tick={tick}
      stroke="var(--border)"
      label={{ value: xLabel, position: "insideBottom", offset: -10, fill: "var(--muted-foreground)", fontSize: 11 }}
    />,
    <YAxis
      key="y"
      tick={tick}
      stroke="var(--border)"
      width={48}
      label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--muted-foreground)", fontSize: 11, style: { textAnchor: "middle" } }}
    />,
    <Tooltip
      key="t"
      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" }}
      labelStyle={{ color: "var(--muted-foreground)" }}
      formatter={(v) => (typeof v === "number" ? Number(v.toPrecision(5)) : v)}
    />,
    keys.length > 1 ? <Legend key="l" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} /> : null,
    ...(referenceLines ?? []).map((r, i) => (
      <ReferenceLine
        key={"r" + i}
        y={r.y}
        stroke="var(--destructive)"
        strokeDasharray="5 4"
        label={{ value: r.label, position: "insideTopRight", fill: "var(--destructive)", fontSize: 11 }}
      />
    )),
  ];
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bar" ? (
          <BarChart {...common}>
            {axes}
            {keys.map((k, i) => (
              <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            ))}
          </BarChart>
        ) : kind === "area" ? (
          <AreaChart {...common}>
            {axes}
            {keys.map((k, i) => (
              <Area key={k} dataKey={k} type="monotone" stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} connectNulls={false} />
            ))}
          </AreaChart>
        ) : (
          <LineChart {...common}>
            {axes}
            {keys.map((k, i) => (
              <Line key={k} dataKey={k} type="monotone" stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={data.length <= 12} isAnimationActive={false} connectNulls={false} />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
