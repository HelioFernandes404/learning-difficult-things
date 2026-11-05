import { generateObject } from "ai";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { graphNodes } from "@/lib/schema";
import { LANGUAGE_NAMES, type Locale } from "@/i18n";
import { getGraphModel, reasoningOptions } from "@/lib/llm";
import { getLlmConfig } from "@/lib/settings";
import { logEvent } from "@/lib/log";
import { addEdge, matchGoalNode, pathTo, upsertNode, type GNode } from "./store";

const planSchema = z.object({
  chain: z
    .array(
      z.object({
        title: z.string().describe("Short canonical name (2-5 words). Reuse existing titles exactly"),
        kind: z.enum(["concept", "proposition", "skill"]),
        summary: z.string().describe("1 sentence"),
        domain: z.string(),
        prerequisites: z.array(z.string()).describe("Titles (from this chain or existing) that are direct prerequisites"),
      }),
    )
    .describe("Prerequisites first; the last item is the goal"),
});

const systemPrompt = (locale: Locale) => `You plan the shortest learning path to a goal. Write node titles, summaries and notes in ${LANGUAGE_NAMES[locale]}.
- Return 2 to 8 items in order: prerequisites first, the goal last.
- Reuse EXACTLY the titles from the list of existing nodes when they fit. Never create near-duplicates.
- Include only what is necessary: skip what the student already masters (mastered), but list it in "prerequisites" when it is a direct prerequisite.
- Short titles (2 to 5 words), noun, no parentheses. "prerequisites" lists direct prerequisites.`;

export type PlanResult = { goalId: string; matched: boolean; created: number; path: { id: string; title: string; mastery: string }[] };

export async function planGoal(goal: string, locale: Locale): Promise<PlanResult> {
  const hit = matchGoalNode(goal);
  if (hit) return result(hit, true, 0);

  const existing = db.select().from(graphNodes).orderBy(desc(graphNodes.updatedAt)).limit(150).all();
  const list = existing.map((n) => `${n.title} [${n.mastery}]${n.domain ? ` (${n.domain})` : ""}`).join("\n");
  const t0 = Date.now();
  const r = await generateObject({
    model: getGraphModel(),
    schema: planSchema,
    system: systemPrompt(locale),
    prompt: `Student goal: ${goal}\n\nExisting nodes:\n${list || "(none)"}`,
    providerOptions: reasoningOptions(getLlmConfig(), getLlmConfig().reasoningEffort === "none" ? "none" : "low"),
  });
  const chain = r.object.chain.filter((c) => c.title.trim());
  if (!chain.length) throw new Error("empty plan");
  let created = 0;
  const nodes = new Map<string, GNode>();
  for (const c of chain) {
    const res = upsertNode(c);
    if (res.created) created++;
    nodes.set(c.title.trim().toLowerCase(), res.node);
  }
  const resolve = (t: string) => nodes.get(t.trim().toLowerCase()) ?? matchTitle(t);
  chain.forEach((c, i) => {
    const me = nodes.get(c.title.trim().toLowerCase())!;
    const pre = c.prerequisites.length ? c.prerequisites : i > 0 ? [chain[i - 1].title] : [];
    for (const p of pre) {
      const pn = resolve(p);
      if (pn) addEdge(pn.id, me.id, "prerequisite");
    }
  });
  const goalNode = nodes.get(chain[chain.length - 1].title.trim().toLowerCase())!;
  logEvent("graph_plan", { goal, nodes: chain.length, created, latencyMs: Date.now() - t0, usage: r.usage });
  return result(goalNode, false, created);
}

function matchTitle(t: string) {
  return matchGoalNode(t);
}

function result(goal: GNode, matched: boolean, created: number): PlanResult {
  return { goalId: goal.id, matched, created, path: pathTo(goal.id).map((n) => ({ id: n.id, title: n.title, mastery: n.mastery })) };
}
