"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import type { ComparisonInput, FormulaInput, StepsInput } from "@/lib/tutor/visual-schemas";

function tex(src: string, display: boolean) {
  return katex.renderToString(src, { displayMode: display, throwOnError: true, strict: "ignore", trust: false });
}

export function FormulaVisual({ input }: { input: FormulaInput }) {
  const main = tex(input.latex, true);
  const vars = input.variables.map((v) => ({ html: tex(v.symbol, false), meaning: v.meaning }));
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg bg-muted px-3 py-2 text-center" dangerouslySetInnerHTML={{ __html: main }} />
      {vars.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-sm">
          {vars.map((v, i) => (
            <div key={i} className="contents">
              <dt dangerouslySetInnerHTML={{ __html: v.html }} />
              <dd className="text-muted-foreground">{v.meaning}</dd>
            </div>
          ))}
        </dl>
      )}
      {input.example && <p className="border-l-2 border-primary pl-3 font-serif text-sm text-muted-foreground">{input.example}</p>}
    </div>
  );
}

export function ComparisonVisual({ input }: { input: ComparisonInput }) {
  const hl = input.highlight;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="p-2" />
            {input.columns.map((c, i) => (
              <th key={i} className={cn("rounded-t-lg p-2 text-left font-medium", hl === i && "bg-primary/10 text-primary")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {input.rows.map((r, ri) => (
            <tr key={ri} className="border-t">
              <th className="p-2 text-left align-top font-medium text-muted-foreground">{r.label}</th>
              {input.columns.map((_, ci) => (
                <td key={ci} className={cn("p-2 align-top", hl === ci && "bg-primary/10")}>
                  {r.values[ci] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StepsVisual({ input }: { input: StepsInput }) {
  return (
    <ol className="relative space-y-4">
      {input.steps.map((s, i) => (
        <li key={i} className="relative flex gap-3">
          {i < input.steps.length - 1 && <span className="absolute top-7 bottom-[-1rem] left-[0.8125rem] w-px bg-border" aria-hidden />}
          <span className="z-10 flex size-[1.625rem] shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
          <div className="min-w-0 pt-0.5">
            <div className="text-sm font-medium">{s.title}</div>
            <div className="text-sm text-muted-foreground">{s.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
