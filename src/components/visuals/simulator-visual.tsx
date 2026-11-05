"use client";

import { useMemo, useState } from "react";
import { Parser } from "expr-eval";
import { useLocale, useT } from "@/i18n/client";
import type { Locale, Messages } from "@/i18n";
import type { SimulatorInput } from "@/lib/tutor/visual-schemas";
import { SeriesChart, type Row } from "./series-chart";

type Output = SimulatorInput["outputs"][number];
type V = Messages["visuals"];

const FUNCS = ["min", "max", "abs", "sqrt", "log", "exp", "pow", "round", "floor", "ceil", "ln", "log10", "sin", "cos", "tan", "hypot", "sign"];
const CONSTS = ["PI", "E"];
// No assignment, concatenation, `in`, arrays or user-defined functions.
const parser = new Parser({
  operators: { add: true, subtract: true, multiply: true, divide: true, power: true, remainder: true, factorial: false, comparison: true, logical: true, conditional: true, concatenate: false, assignment: false, in: false },
});

/** Evaluates an expression with an identifier allow-list (no member access). */
function evalExpr(expression: string, scope: Record<string, number>, t: V): number {
  if (expression.length > 300) throw new Error(t.sim.tooLong);
  if (/[;\[\]{}"'`\\]|\.\s*[A-Za-z_]/.test(expression)) throw new Error(t.sim.badSymbols);
  const allowed = new Set([...Object.keys(scope), ...FUNCS, ...CONSTS]);
  for (const id of expression.match(/[A-Za-z_]\w*/g) ?? []) {
    if (!allowed.has(id)) throw new Error(t.sim.unknownVariable(id));
  }
  const v = parser.parse(expression).evaluate(scope);
  if (typeof v !== "number") throw new Error(t.sim.notNumeric);
  return v;
}

type Computed = { values: Record<string, number>; errors: Record<string, string> };

function compute(sim: SimulatorInput, inputs: Record<string, number>, t: V): Computed {
  const scope: Record<string, number> = { ...inputs };
  const values: Record<string, number> = {};
  const errors: Record<string, string> = {};
  for (const o of sim.outputs) {
    try {
      const v = evalExpr(o.expression, scope, t);
      values[o.id] = v;
      scope[o.id] = v;
    } catch (e) {
      errors[o.id] = e instanceof Error ? e.message : String(e);
    }
  }
  return { values, errors };
}

function fmtNum(v: number, locale: Locale, t: V) {
  if (!Number.isFinite(v)) return v > 0 ? "∞" : v < 0 ? "−∞" : t.undefinedNumber;
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 0.001)) return v.toExponential(2);
  return new Intl.NumberFormat(locale, { maximumFractionDigits: a >= 100 ? 1 : 3 }).format(v);
}

export function formatOutput(o: Output, v: number, locale: Locale, t: V) {
  if (!Number.isFinite(v)) return fmtNum(v, locale, t);
  if (o.format === "percent") return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(v)}%`;
  if (o.format === "duration_hours") {
    const mins = Math.round(v * 60);
    if (mins < 60) return `${mins} min`;
    if (v < 48) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m ? `${h} h ${m} min` : `${h} h`;
    }
    const d = Math.floor(v / 24);
    const h = Math.round(v - d * 24);
    return h ? `${d} d ${h} h` : `${d} d`;
  }
  return `${fmtNum(v, locale, t)}${o.unit ? " " + o.unit : ""}`;
}

function validate(sim: SimulatorInput, t: V) {
  const ids = new Set<string>();
  for (const i of [...sim.inputs.map((x) => x.id), ...sim.outputs.map((x) => x.id)]) {
    if (!/^[A-Za-z_]\w*$/.test(i)) throw new Error(t.sim.invalidId(i));
    if (ids.has(i)) throw new Error(t.sim.duplicateId(i));
    ids.add(i);
  }
  for (const i of sim.inputs) if (!(i.max > i.min) || !(i.step > 0)) throw new Error(t.sim.invalidRange(i.id));
  if (sim.chart) {
    if (!sim.inputs.some((i) => i.id === sim.chart!.xInput)) throw new Error(t.sim.unknownXInput);
    if (!sim.outputs.some((o) => o.id === sim.chart!.yOutput)) throw new Error(t.sim.unknownYOutput);
  }
}

export function SimulatorVisual({ input }: { input: SimulatorInput }) {
  const tr = useT();
  const t = tr.visuals;
  const locale = useLocale();
  validate(input, t);
  const [vals, setVals] = useState<Record<string, number>>(() =>
    Object.fromEntries(input.inputs.map((i) => [i.id, Math.min(i.max, Math.max(i.min, i.default))])),
  );
  const result = useMemo(() => compute(input, vals, t), [input, vals, t]);

  const chart = useMemo(() => {
    if (!input.chart) return null;
    const c = input.chart;
    const xin = input.inputs.find((i) => i.id === c.xInput)!;
    const yout = input.outputs.find((o) => o.id === c.yOutput)!;
    const n = Math.min(120, Math.max(5, Math.round(c.points ?? 40)));
    const data: Row[] = [];
    for (let k = 0; k < n; k++) {
      const x = xin.min + ((xin.max - xin.min) * k) / (n - 1);
      const y = compute(input, { ...vals, [xin.id]: x }, t).values[yout.id];
      data.push({ x: Number(x.toPrecision(6)), [yout.label]: y !== undefined && Number.isFinite(y) ? y : null });
    }
    return { data, xin, yout };
  }, [input, vals, t]);

  return (
    <div className="space-y-4">
      {input.description && <p className="text-sm text-muted-foreground">{input.description}</p>}
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {input.inputs.map((i) => (
          <label key={i.id} className="block">
            <div className="flex items-baseline justify-between text-sm">
              <span>{i.label}</span>
              <span className="font-mono text-xs text-primary">
                {fmtNum(vals[i.id], locale, t)}
                {i.unit ? ` ${i.unit}` : ""}
              </span>
            </div>
            <input
              type="range"
              min={i.min}
              max={i.max}
              step={i.step}
              value={vals[i.id]}
              onChange={(e) => setVals((v) => ({ ...v, [i.id]: Number(e.target.value) }))}
              className="mt-1 w-full accent-primary"
            />
          </label>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {input.outputs.map((o) => {
          const err = result.errors[o.id];
          return (
            <div key={o.id} className="rounded-lg bg-muted px-3 py-2">
              <div className="text-xs text-muted-foreground">{o.label}</div>
              {err ? (
                <div className="text-sm text-destructive" title={o.expression}>
                  {t.errorLabel} {err}
                </div>
              ) : (
                <div className="font-mono text-lg font-medium">{formatOutput(o, result.values[o.id], locale, t)}</div>
              )}
            </div>
          );
        })}
      </div>
      {chart && (
        <div>
          <SeriesChart
            kind="line"
            data={chart.data}
            keys={[chart.yout.label]}
            xLabel={`${chart.xin.label}${chart.xin.unit ? ` (${chart.xin.unit})` : ""}`}
            yLabel={`${chart.yout.label}${chart.yout.unit ? ` (${chart.yout.unit})` : ""}`}
            xNumeric
            height={220}
          />
        </div>
      )}
      {input.insight && <p className="border-l-2 border-primary pl-3 font-serif text-sm text-muted-foreground">{input.insight}</p>}
    </div>
  );
}
