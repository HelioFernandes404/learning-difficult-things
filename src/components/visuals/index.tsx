"use client";

import { isVisualName, VISUAL_SCHEMAS, type VisualName } from "@/lib/tutor/visual-schemas";
import type { ChartInput, ComparisonInput, FormulaInput, SimulatorInput, StepsInput } from "@/lib/tutor/visual-schemas";
import { useT } from "@/i18n/client";
import { VisualBoundary, VisualCard, VisualError, VisualSkeleton } from "./visual-card";
import { ChartVisual } from "./chart-visual";
import { SimulatorVisual } from "./simulator-visual";
import { ComparisonVisual, FormulaVisual, StepsVisual } from "./static-visuals";

export { isVisualName };

export function VisualPart({ name, state, input }: { name: string; state: string; input: unknown }) {
  const t = useT();
  if (!isVisualName(name)) return null;
  const label = t.visuals.labels[name] ?? name;
  if (state === "input-streaming") return <VisualSkeleton label={label} />;
  const parsed = VISUAL_SCHEMAS[name as VisualName].safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues.slice(0, 2).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return <VisualError label={label} tool={name} message={msg} raw={input} />;
  }
  const d = parsed.data as unknown;
  const title = (d as { title?: string }).title;
  let body: React.ReactNode;
  switch (name) {
    case "show_chart": body = <ChartVisual input={d as ChartInput} />; break;
    case "show_simulator": body = <SimulatorVisual input={d as SimulatorInput} />; break;
    case "show_formula": body = <FormulaVisual input={d as FormulaInput} />; break;
    case "show_comparison": body = <ComparisonVisual input={d as ComparisonInput} />; break;
    case "show_steps": body = <StepsVisual input={d as StepsInput} />; break;
  }
  return (
    <VisualBoundary label={label} tool={name} raw={input} key={JSON.stringify(input)}>
      <VisualCard label={label} title={title}>{body}</VisualCard>
    </VisualBoundary>
  );
}
