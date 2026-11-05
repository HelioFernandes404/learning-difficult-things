import { z } from "zod";

/** Schemas of the visual components. No server imports: used on both client and server. */

export const chartSchema = z.object({
  title: z.string().describe("Short chart title"),
  kind: z.enum(["line", "bar", "area"]).describe("line = trend; bar = compare values; area = cumulative/volume"),
  xLabel: z.string().describe("X axis name (with unit)"),
  yLabel: z.string().describe("Y axis name (with unit)"),
  series: z
    .array(
      z.object({
        name: z.string(),
        points: z.array(z.object({ x: z.union([z.number(), z.string()]), y: z.number() })).describe("All series must use the same x values"),
      }),
    )
    .min(1)
    .max(4),
  referenceLines: z
    .array(z.object({ y: z.number(), label: z.string() }))
    .optional()
    .describe("Horizontal reference lines (e.g. limit, target)"),
  caption: z.string().optional().describe("One-sentence caption; do not repeat the message text"),
});

export const simulatorSchema = z.object({
  title: z.string(),
  description: z.string().optional().describe("One sentence: what the student should explore"),
  inputs: z
    .array(
      z.object({
        id: z.string().describe("Simple identifier: letters, numbers and _ (e.g. slo, error_rate). No spaces, no accents"),
        label: z.string(),
        min: z.number(),
        max: z.number(),
        step: z.number(),
        default: z.number(),
        unit: z.string().optional(),
      }),
    )
    .min(1)
    .max(4),
  outputs: z
    .array(
      z.object({
        id: z.string().describe("Simple, unique identifier, different from the input ids"),
        label: z.string(),
        expression: z
          .string()
          .describe(
            "Math expression. May use ids of inputs and of EARLIER outputs in the list. Operators: + - * / ^ ( ), functions: min, max, abs, sqrt, log, exp, pow, round, floor, ceil. E.g.: (1 - slo/100) * 100. No semicolons, no assignment",
          ),
        unit: z.string().optional(),
        format: z
          .enum(["number", "percent", "duration_hours"])
          .optional()
          .describe("percent: value in 0-100 shown with %; duration_hours: value in hours shown as days/hours/min"),
      }),
    )
    .min(1)
    .max(5),
  chart: z
    .object({
      xInput: z.string().describe("id of the input swept on the X axis"),
      yOutput: z.string().describe("id of the output on the Y axis"),
      points: z.number().optional().describe("Number of points (default 40)"),
    })
    .optional(),
  insight: z.string().optional().describe("One sentence shown below: what to observe"),
});

export const formulaSchema = z.object({
  latex: z.string().describe("Formula in LaTeX, without $ delimiters (e.g. \\text{burn rate} = \\frac{\\text{error rate}}{1 - \\text{SLO}})"),
  variables: z.array(z.object({ symbol: z.string().describe("LaTeX of the symbol"), meaning: z.string() })).max(8),
  example: z.string().optional().describe("Short numeric example"),
});

export const comparisonSchema = z.object({
  title: z.string(),
  columns: z.array(z.string()).min(2).max(4),
  rows: z.array(z.object({ label: z.string(), values: z.array(z.string()).describe("One value per column") })).min(1).max(8),
  highlight: z.number().int().optional().describe("Index (0-based) of the column to highlight"),
});

export const stepsSchema = z.object({
  title: z.string(),
  steps: z.array(z.object({ title: z.string(), detail: z.string().describe("One short sentence") })).min(2).max(8),
});

export type ChartInput = z.infer<typeof chartSchema>;
export type SimulatorInput = z.infer<typeof simulatorSchema>;
export type FormulaInput = z.infer<typeof formulaSchema>;
export type ComparisonInput = z.infer<typeof comparisonSchema>;
export type StepsInput = z.infer<typeof stepsSchema>;

export const VISUAL_SCHEMAS = {
  show_chart: chartSchema,
  show_simulator: simulatorSchema,
  show_formula: formulaSchema,
  show_comparison: comparisonSchema,
  show_steps: stepsSchema,
} as const;
export type VisualName = keyof typeof VISUAL_SCHEMAS;
export const isVisualName = (n: string): n is VisualName => n in VISUAL_SCHEMAS;
