import { generateObject, type UIMessage } from "ai";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { checks, graphNodes, messages as messagesTable, sessions } from "@/lib/schema";
import { LANGUAGE_NAMES, type Locale } from "@/i18n";
import { sessionLocale } from "@/lib/session-locale";
import { getGraphModel, reasoningOptions } from "@/lib/llm";
import { getLlmConfig } from "@/lib/settings";
import { logEvent } from "@/lib/log";
import { recordAudit } from "@/lib/tutor/audit-db";
import { jaccard, normTitle } from "./normalize";
import { addEdge, addEvidence, existingTitles, recomputeNode, removeSessionFromGraph, upsertNode, type GNode } from "./store";

const extractSchema = z.object({
  nodes: z.array(
    z.object({
      title: z.string().describe("Short canonical name (2-5 words), noun, no article or parentheses"),
      kind: z.enum(["concept", "proposition", "skill"]),
      summary: z.string().describe("1-2 sentences in the student's own terms"),
      domain: z.string().describe("Short area, e.g. SRE, DevOps, Kubernetes"),
    }),
  ),
  edges: z.array(
    z.object({
      fromTitle: z.string(),
      toTitle: z.string(),
      type: z.enum(["prerequisite", "part_of", "related", "contrasts", "example_of"]),
      label: z.string().nullable(),
    }),
  ),
  evidence: z.array(
    z.object({
      nodeTitle: z.string(),
      kind: z.enum(["taught", "check", "note", "misconception"]),
      checkRef: z.string().nullable().describe("Short check id C:xxxxxxxx (only for kind=check)"),
      text: z.string().describe("1 sentence: what was taught, answered, or the misconception"),
    }),
  ),
});
export type Extraction = z.infer<typeof extractSchema>;

const systemPrompt = (locale: Locale) => `You extract a knowledge graph from a lesson between a tutor and a student. Reply only with the requested object. Write node titles, summaries and notes in ${LANGUAGE_NAMES[locale]}.
Rules:
- Extract only substantive units of knowledge taught or tested in this excerpt. At most 8 nodes. If there is nothing substantive, return empty lists.
- Title: short canonical name (2 to 5 words), noun, singular, no article, no parentheses, never a question. E.g.: "Error budget", "Burn rate", "Cluster node".
- kind: concept = term or thing; proposition = a statement or relation that can be judged true or false (the title is the short statement); skill = something the student can do.
- Reuse EXACTLY a title from the "Existing nodes" list when the idea is the same (synonym, plural, translation, variation). Never create near-duplicates.
- summary: 1 to 2 sentences, in the student's terms.
- domain: short area. If the session provides context, use that area.
- edges: only between nodes of this excerpt or existing ones. prerequisite: fromTitle is a prerequisite to understand toTitle. part_of: from is part of to. example_of: from is an example of to. related and contrasts: symmetric. Only create them when the relation is clear.
- evidence: at least one per touched node. taught = the tutor explained it. check = graded check (fill checkRef with the id C:xxxxxxxx; use the node the check tests). misconception = a wrong belief of the student (describe it). note = any other useful observation.
- Every graded check in the excerpt must appear in exactly one evidence of kind=check.`;

type Slice = { sessionId: string; context: string | null; locale: Locale; transcript: string; checkIds: string[] };

export type ExtractResult = {
  skipped?: string;
  nodesAdded: number;
  nodesUpdated: number;
  edgesAdded: number;
  evidenceAdded: number;
  error?: string;
  latencyMs: number;
  usage?: unknown;
};

const empty = (): ExtractResult => ({ nodesAdded: 0, nodesUpdated: 0, edgesAdded: 0, evidenceAdded: 0, latencyMs: 0 });
const clip = (s: unknown, n = 400) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const short = (id: string) => `C:${id.slice(0, 8)}`;

// ---------- transcript ----------

type ToolIO = { name: string; input?: unknown; output?: unknown };

function toolLines(t: ToolIO, seenChecks: Set<string>): string[] {
  const i = (t.input ?? {}) as Record<string, unknown>;
  const o = (t.output ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  const checkBlock = (id: string) => {
    if (!id || seenChecks.has(id)) return;
    const c = db.select().from(checks).where(eq(checks.id, id)).get();
    if (!c) return;
    seenChecks.add(id);
    out.push(`[CHECK ${short(c.id)}] question: ${clip(c.question)} | student answer: ${clip(c.answer)} | confidence: ${c.confidence}/5`);
  };
  if (t.name.startsWith("show_")) out.push(`[visual ${t.name}: ${clip(i.title ?? i.caption ?? "", 120)}]`);
  else if (t.name === "ask_check") {
    out.push(`TUTOR asks: ${clip(i.question)}`);
    if (typeof o.checkId === "string") checkBlock(o.checkId);
  } else if (t.name === "grade_check") {
    const id = String(i.checkId ?? "");
    checkBlock(id);
    out.push(`[GRADE ${short(id)}] verdict=${i.verdict} feedback: ${clip(i.feedback, 300)}${i.misconception ? ` | misconception: ${clip(i.misconception, 200)}` : ""}`);
  } else if (t.name === "offer_choices" && (o.label || o.other)) out.push(`STUDENT chose: ${clip(o.other ?? o.label, 200)}`);
  else if (t.name === "save_concept") out.push(`[note saved: ${clip(i.title, 100)}]`);
  return out;
}

type StepIn = { text: string; toolCalls: { name: string; input?: unknown }[] };
type InputIn = { kind: string; text?: string; answer?: string; confidence?: number; checkId?: string };

/** Compact transcript of ONE turn (student input + tutor steps). */
export function turnTranscript(input: InputIn, steps: StepIn[]): { transcript: string; hasGrade: boolean; hasVisual: boolean; textLen: number } {
  const seen = new Set<string>();
  const lines: string[] = [];
  if (input.kind === "ask_check" && input.checkId) {
    lines.push(...toolLines({ name: "ask_check", input: {}, output: { checkId: input.checkId } }, seen).filter((l) => l.startsWith("[CHECK")));
  } else if (input.text) lines.push(`STUDENT: ${clip(input.text, 600)}`);
  let hasGrade = false;
  let hasVisual = false;
  let textLen = 0;
  for (const s of steps) {
    if (s.text.trim()) {
      lines.push(`TUTOR: ${clip(s.text, 1200)}`);
      textLen += s.text.length;
    }
    for (const c of s.toolCalls) {
      if (c.name === "grade_check") hasGrade = true;
      if (c.name.startsWith("show_")) hasVisual = true;
      lines.push(...toolLines(c, seen));
    }
  }
  return { transcript: lines.join("\n"), hasGrade, hasVisual, textLen };
}

type Part = { type: string; text?: string; input?: unknown; output?: unknown };

/** Transcript of the whole session, as lines. */
export function sessionLines(msgs: UIMessage[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const m of msgs) {
    for (const p of m.parts as Part[]) {
      if (p.type === "text" && p.text?.trim()) lines.push(`${m.role === "user" ? "STUDENT" : "TUTOR"}: ${clip(p.text, 1200)}`);
      else if (p.type.startsWith("tool-")) lines.push(...toolLines({ name: p.type.slice(5), input: p.input, output: p.output }, seen));
    }
  }
  return lines;
}

export function chunkLines(lines: string[], max = 7000): string[] {
  const out: string[] = [];
  let cur = "";
  for (const l of lines) {
    if (cur && cur.length + l.length > max) {
      out.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + l;
  }
  if (cur) out.push(cur);
  return out;
}

// ---------- apply ----------

function findNode(title: string): GNode | undefined {
  const key = normTitle(title);
  const all = db.select().from(graphNodes).all();
  return all.find((n) => n.normTitle === key) ?? all.find((n) => jaccard(n.title, title) >= 0.75);
}

export function applyExtraction(x: Extraction, slice: Slice): Omit<ExtractResult, "latencyMs" | "usage"> {
  const r = { nodesAdded: 0, nodesUpdated: 0, edgesAdded: 0, evidenceAdded: 0 };
  const touched = new Set<string>();
  const updated = new Set<string>();
  const byTitle = new Map<string, GNode>();
  const dom = slice.context?.trim() ?? "";
  const reg = (title: string, n: GNode) => byTitle.set(normTitle(title), n);
  const resolve = (title: string) => byTitle.get(normTitle(title)) ?? findNode(title);

  for (const n of x.nodes) {
    if (!n.title.trim()) continue;
    const res = upsertNode({ title: n.title, kind: n.kind, summary: n.summary, domain: n.domain.trim() || dom });
    reg(n.title, res.node);
    if (res.created) r.nodesAdded++;
    else if (res.updated) updated.add(res.node.id);
    touched.add(res.node.id);
  }
  for (const e of x.edges) {
    const a = resolve(e.fromTitle);
    const b = resolve(e.toTitle);
    if (a && b && addEdge(a.id, b.id, e.type, e.label)) r.edgesAdded++;
  }
  const checkRows = new Map(slice.checkIds.map((id) => [short(id), db.select().from(checks).where(eq(checks.id, id)).get()] as const));
  const used = new Set<string>();
  for (const ev of x.evidence) {
    let node = resolve(ev.nodeTitle);
    if (!node) {
      const res = upsertNode({ title: ev.nodeTitle, kind: "concept", summary: "", domain: dom });
      node = res.node;
      if (res.created) r.nodesAdded++;
      reg(ev.nodeTitle, node);
    }
    touched.add(node.id);
    const row = ev.kind === "check" && ev.checkRef ? checkRows.get(ev.checkRef.trim()) : undefined;
    if (row) {
      used.add(row.id);
      if (addEvidence({ nodeId: node.id, sessionId: slice.sessionId, kind: "check", checkId: row.id, verdict: row.verdict, confidence: row.confidence, text: clip(row.feedback || ev.text, 300) })) r.evidenceAdded++;
    } else if (addEvidence({ nodeId: node.id, sessionId: slice.sessionId, kind: ev.kind === "check" ? "note" : ev.kind, text: clip(ev.text, 300) })) r.evidenceAdded++;
  }
  // Graded checks without evidence: attach to the first touched node.
  const first = [...touched][0];
  if (first) {
    for (const [, row] of checkRows) {
      if (!row || used.has(row.id) || !row.verdict) continue;
      if (addEvidence({ nodeId: first, sessionId: slice.sessionId, kind: "check", checkId: row.id, verdict: row.verdict, confidence: row.confidence, text: clip(row.feedback ?? row.question, 300) })) r.evidenceAdded++;
    }
  }
  for (const id of touched) recomputeNode(id);
  for (const id of updated) touched.add(id);
  r.nodesUpdated = Math.max(0, touched.size - r.nodesAdded);
  return r;
}

// ---------- LLM ----------

async function callExtractor(slice: Slice): Promise<{ x: Extraction; usage: unknown }> {
  const titles = existingTitles(slice.context, 80);
  const prompt = `Session context: ${slice.context || "(not provided)"}

Existing nodes (reuse these titles):
${titles.length ? titles.join(" | ") : "(none)"}

Lesson excerpt:
${slice.transcript}`;
  const r = await generateObject({
    model: getGraphModel(),
    schema: extractSchema,
    system: systemPrompt(slice.locale),
    prompt,
    providerOptions: reasoningOptions(getLlmConfig(), getLlmConfig().reasoningEffort === "none" ? "none" : "low"),
  });
  return { x: r.object, usage: r.usage };
}

async function runSlice(slice: Slice): Promise<ExtractResult> {
  const t0 = Date.now();
  try {
    const { x, usage } = await callExtractor(slice);
    const applied = applyExtraction(x, slice);
    return { ...applied, latencyMs: Date.now() - t0, usage };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ...empty(), latencyMs: Date.now() - t0, error: error.slice(0, 300) };
  }
}

function report(sessionId: string, turnId: string, r: ExtractResult, extra: Record<string, unknown> = {}) {
  logEvent("graph_extract", { sessionId, turnId, model: getLlmConfig().graphModel, ...r, ...extra });
  recordAudit(sessionId, turnId, "graph_extract", { ...r, ...extra });
}

let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => undefined);
  return p;
}

const sessionRow = (sessionId: string) => db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
const sessionContext = (sessionId: string) => sessionRow(sessionId)?.context ?? null;
const locale = (sessionId: string) => sessionLocale(sessionRow(sessionId));

/** Extraction after a turn. Fire-and-forget: never throws. */
export function extractTurn(a: { sessionId: string; turnId: string; input: InputIn; steps: StepIn[] }): void {
  void enqueue(async () => {
    try {
      const t = turnTranscript(a.input, a.steps);
      if (!t.hasGrade && !t.hasVisual && t.textLen < 250) {
        report(a.sessionId, a.turnId, { ...empty(), skipped: "nothing substantive" });
        return;
      }
      const checkIds = [...t.transcript.matchAll(/\[CHECK C:([0-9a-f]{8})\]/g)].map((m) => m[1]);
      const rows = checkIds.length ? db.select().from(checks).where(eq(checks.sessionId, a.sessionId)).all() : [];
      const full = checkIds.map((p) => rows.find((r) => r.id.startsWith(p))?.id).filter((x): x is string => !!x);
      const res = await runSlice({ sessionId: a.sessionId, context: sessionContext(a.sessionId), locale: locale(a.sessionId), transcript: t.transcript, checkIds: full });
      report(a.sessionId, a.turnId, res);
    } catch (e) {
      console.error("[graph] extractTurn", e);
    }
  });
}

/** Re-extracts the whole session (deletes the session's evidence first). */
export function extractSession(sessionId: string): Promise<ExtractResult & { chunks: number }> {
  return enqueue(async () => {
    const turnId = `gx_${Math.random().toString(36).slice(2, 10)}`;
    const t0 = Date.now();
    const total = { ...empty(), chunks: 0 };
    const rows = db.select().from(messagesTable).where(eq(messagesTable.sessionId, sessionId)).orderBy(asc(messagesTable.createdAt)).all();
    const msgs = rows.map((r) => ({ id: r.id, role: r.role as UIMessage["role"], parts: r.parts as UIMessage["parts"] }));
    removeSessionFromGraph(sessionId);
    db.update(checks).set({ nodeId: null }).where(eq(checks.sessionId, sessionId)).run();
    const ctx = sessionContext(sessionId);
    const checkIds = db.select({ id: checks.id }).from(checks).where(eq(checks.sessionId, sessionId)).all().map((c) => c.id);
    for (const chunk of chunkLines(sessionLines(msgs))) {
      const res = await runSlice({ sessionId, context: ctx, locale: locale(sessionId), transcript: chunk, checkIds });
      total.chunks++;
      total.nodesAdded += res.nodesAdded;
      total.nodesUpdated += res.nodesUpdated;
      total.edgesAdded += res.edgesAdded;
      total.evidenceAdded += res.evidenceAdded;
      if (res.error) total.error = res.error;
      report(sessionId, turnId, res, { manual: true, chunk: total.chunks });
    }
    total.latencyMs = Date.now() - t0;
    return total;
  });
}
