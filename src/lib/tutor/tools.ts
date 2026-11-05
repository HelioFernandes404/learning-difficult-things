import { tool } from "ai";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, newId } from "@/lib/db";
import { chartSchema, comparisonSchema, formulaSchema, simulatorSchema, stepsSchema } from "@/lib/tutor/visual-schemas";
import { checks, concepts, lessonMaps } from "@/lib/schema";
import type { TurnCtx } from "@/lib/tutor/audit";
import { recordDbWrite } from "@/lib/tutor/audit-db";

/** CLIENT-SIDE tool: no execute. The browser shows the card and returns the result via addToolResult. */
export const askCheck = tool({
  description:
    "Asks the student for a free-text answer + confidence (1-5) to verify understanding. The result contains {answer, confidence, checkId}.",
  inputSchema: z.object({
    question: z.string().describe("Question for the student. Do not ask for confidence here: the card already has that control"),
    hint: z.string().optional().describe("Optional hint shown under the question"),
  }),
});

/** CLIENT-SIDE tool: no execute. Choice between options (does not write to checks). */
export const offerChoices = tool({
  description:
    "Offers the student 2 to 5 clickable options. Use for: (1) choosing the next topic, (2) disambiguating a vague or ambiguous topic, (3) choosing a path (e.g. more theory or an exercise?). NEVER use it to verify understanding: that is ask_check. The result contains {choiceId, label, other?}.",
  inputSchema: z.object({
    question: z.string().describe("Short question for the student"),
    options: z
      .array(
        z.object({
          id: z.string().describe("Simple option id"),
          label: z.string().describe("Short button text"),
          description: z.string().optional().describe("Optional short explanation"),
        }),
      )
      .min(2)
      .max(5),
    allowOther: z.boolean().optional().describe("If true, shows a free-text 'Other...' field"),
  }),
});

const visual = <S extends z.ZodTypeAny>(description: string, inputSchema: S) =>
  tool({ description, inputSchema, execute: async () => ({ ok: true }) });

export function makeTools(sessionId: string, turn?: TurnCtx) {
  const turnId = turn?.turnId ?? null;
  return {
    ask_check: askCheck,
    offer_choices: offerChoices,

    show_chart: visual(
      "Shows a chart (line/bar/area) inline in the chat. Use for trends and quantities along an axis. The student sees the chart; do not describe the data in the text.",
      chartSchema,
    ),
    show_simulator: visual(
      "Shows an interactive simulator: input sliders and live computed outputs (and an optional chart sweeping one input). Preferred for quantitative concepts with a formula/parameters. Ask the student to move the sliders and predict the result.",
      simulatorSchema,
    ),
    show_formula: visual("Shows a formula (LaTeX) with a legend of the variables. Use for mathematical definitions.", formulaSchema),
    show_comparison: visual("Shows a table comparing concepts side by side.", comparisonSchema),
    show_steps: visual("Shows a numbered visual flow for processes and procedures.", stepsSchema),

    grade_check: tool({
      description: "Records the verdict and feedback for a check the student answered.",
      inputSchema: z.object({
        checkId: z.string().describe("checkId returned by ask_check"),
        verdict: z.enum(["correct", "partial", "wrong"]),
        feedback: z.string().describe("Short feedback"),
        misconception: z.string().optional().describe("Misconception identified, if any"),
        override: z.boolean().optional().describe("true ONLY to correct an already recorded verdict (rare)"),
      }),
      execute: async ({ checkId, verdict, feedback, misconception, override }) => {
        const text = misconception ? `${feedback}\n\nMisconception: ${misconception}` : feedback;
        const prev = db.select().from(checks).where(eq(checks.id, checkId)).get();
        if (!prev) return { ok: false, error: "checkId not found" };
        const before = { verdict: prev.verdict, feedback: prev.feedback };
        if (prev.verdict) {
          turn?.flag("regrade");
          if (!override) {
            recordDbWrite(sessionId, turnId, "grade_check", { checkId, before, attempted: { verdict, feedback: text } }, `refused regrade ${checkId} (${prev.verdict} -> ${verdict})`, true);
            return {
              ok: false,
              error: `This check was already graded (${prev.verdict}). Do not regrade: continue the lesson and finish with the next ask_check or offer_choices. If you really must correct the verdict, call grade_check again with override:true.`,
            };
          }
        } else {
          const latest = db
            .select({ id: checks.id })
            .from(checks)
            .where(and(eq(checks.sessionId, sessionId), isNull(checks.verdict)))
            .orderBy(desc(checks.createdAt))
            .get();
          if (latest && latest.id !== checkId) turn?.flag("stale_check_id");
        }
        db.update(checks).set({ verdict, feedback: text }).where(eq(checks.id, checkId)).run();
        recordDbWrite(sessionId, turnId, "grade_check", { checkId, before, after: { verdict, feedback: text }, override: !!override }, `check ${checkId}: ${before.verdict ?? "-"} -> ${verdict}`);
        return { ok: true };
      },
    }),

    save_concept: tool({
      description: "Saves (or updates, by title) a concept in the student's notebook.",
      inputSchema: z.object({
        title: z.string(),
        content: z.string().describe("Concise Markdown, in the student's terms"),
        tags: z.array(z.string()).default([]),
      }),
      execute: async ({ title, content, tags }) => {
        const now = Date.now();
        const existing = db
          .select()
          .from(concepts)
          .where(and(eq(concepts.sessionId, sessionId), eq(concepts.title, title)))
          .get();
        if (existing) {
          db.update(concepts).set({ content, tags, updatedAt: now }).where(eq(concepts.id, existing.id)).run();
          recordDbWrite(sessionId, turnId, "save_concept", { conceptId: existing.id, title, updated: true, previousContent: existing.content, previousTags: existing.tags }, `upsert concept "${title}" (update)`);
          return { ok: true, id: existing.id, updated: true };
        }
        const id = newId();
        db.insert(concepts)
          .values({ id, sessionId, title, content, tags, source: "ai", createdAt: now, updatedAt: now })
          .run();
        recordDbWrite(sessionId, turnId, "save_concept", { conceptId: id, title, updated: false }, `upsert concept "${title}" (new)`);
        return { ok: true, id, updated: false };
      },
    }),

    set_lesson_map: tool({
      description: "Sets the complete lesson map (replaces the previous one).",
      inputSchema: z.object({
        steps: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            status: z.enum(["todo", "current", "done"]),
          }),
        ),
      }),
      execute: async ({ steps }) => {
        const now = Date.now();
        const prev = db.select().from(lessonMaps).where(eq(lessonMaps.sessionId, sessionId)).get();
        db.insert(lessonMaps)
          .values({ sessionId, steps, updatedAt: now })
          .onConflictDoUpdate({ target: lessonMaps.sessionId, set: { steps, updatedAt: now } })
          .run();
        recordDbWrite(sessionId, turnId, "set_lesson_map", { steps, previousSteps: prev?.steps ?? null }, `lesson map: ${steps.length} steps (${steps.filter((x) => x.status === "done").length} done)`);
        return { ok: true, count: steps.length };
      },
    }),
  };
}
