"use client";

import { useMemo } from "react";
import type { ChartInput } from "@/lib/tutor/visual-schemas";
import { useT } from "@/i18n/client";
import { SeriesChart, type Row } from "./series-chart";

export function ChartVisual({ input }: { input: ChartInput }) {
  const t = useT();
  const { data, xNumeric } = useMemo(() => {
    const map = new Map<string | number, Row>();
    input.series.forEach((s, i) => {
      for (const p of s.points) {
        const row = map.get(p.x) ?? { x: p.x };
        row["s" + i] = p.y;
        map.set(p.x, row);
      }
    });
    const rows = [...map.values()];
    const numeric = rows.every((r) => typeof r.x === "number");
    if (numeric) rows.sort((a, b) => (a.x as number) - (b.x as number));
    return { data: rows, xNumeric: numeric };
  }, [input]);
  if (!data.length) throw new Error(t.visuals.noPoints);
  // internal keys s0..sN; display names via dataKey -> use the name as the key
  const named = data.map((r) => {
    const o: Row = { x: r.x };
    input.series.forEach((s, i) => (o[s.name] = r["s" + i] ?? null));
    return o;
  });
  return (
    <>
      <SeriesChart
        kind={input.kind}
        data={named}
        keys={input.series.map((s) => s.name)}
        xLabel={input.xLabel}
        yLabel={input.yLabel}
        xNumeric={xNumeric}
        referenceLines={input.referenceLines}
      />
      {input.caption && <p className="mt-2 text-sm text-muted-foreground">{input.caption}</p>}
    </>
  );
}
