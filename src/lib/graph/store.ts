import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, newId } from "@/lib/db";
import {
  checks,
  graphEdges,
  graphEvidence,
  graphNodes,
  type EdgeType,
  type EvidenceKind,
  type Mastery,
  type NodeKind,
} from "@/lib/schema";
import { computeMastery } from "./mastery";
import { jaccard, normTitle, tokens } from "./normalize";

export type GNode = typeof graphNodes.$inferSelect;
export type GEdge = typeof graphEdges.$inferSelect;
export type GEvidence = typeof graphEvidence.$inferSelect;

export const normDomain = (d: string) => normTitle(d);

/** Creates or reuses a node (by normalized title; then by near-identical title in the same domain). */
export function upsertNode(a: { title: string; kind: NodeKind; summary: string; domain: string }): { node: GNode; created: boolean; updated: boolean } {
  const title = a.title.trim().replace(/\s+/g, " ");
  const key = normTitle(title);
  const now = Date.now();
  let existing = db.select().from(graphNodes).where(eq(graphNodes.normTitle, key)).get();
  if (!existing) {
    const dom = normDomain(a.domain);
    const cands = db.select().from(graphNodes).all();
    existing = cands.find((n) => (!dom || normDomain(n.domain) === dom) && jaccard(n.title, title) >= 0.75);
  }
  if (existing) {
    const patch: Partial<GNode> = {};
    const summary = a.summary.trim();
    if (summary && (existing.mastery === "unseen" || !existing.summary)) patch.summary = summary;
    if (existing.domain === "" && a.domain.trim()) patch.domain = a.domain.trim();
    if (Object.keys(patch).length) {
      db.update(graphNodes).set({ ...patch, updatedAt: now }).where(eq(graphNodes.id, existing.id)).run();
      return { node: { ...existing, ...patch, updatedAt: now }, created: false, updated: true };
    }
    return { node: existing, created: false, updated: false };
  }
  const node: GNode = {
    id: newId(),
    title,
    normTitle: key,
    kind: a.kind,
    summary: a.summary.trim(),
    domain: a.domain.trim(),
    mastery: "unseen",
    masteryScore: 0,
    lastConfidence: null,
    evidenceCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(graphNodes).values(node).run();
  return { node, created: true, updated: false };
}

/** Is there a prerequisite path from `from` to `to`? */
function reachesByPrereq(from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === to) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const e of db.select({ toId: graphEdges.toId }).from(graphEdges).where(and(eq(graphEdges.fromId, cur), eq(graphEdges.type, "prerequisite"))).all()) stack.push(e.toId);
  }
  return false;
}

/** Adds an edge. Ignores self-loops, duplicates and prerequisite cycles. Returns true if created. */
export function addEdge(fromId: string, toId: string, type: EdgeType, label?: string | null): boolean {
  if (fromId === toId) return false;
  if (type === "prerequisite" && reachesByPrereq(toId, fromId)) return false;
  const dup = db
    .select({ id: graphEdges.id })
    .from(graphEdges)
    .where(
      or(
        and(eq(graphEdges.fromId, fromId), eq(graphEdges.toId, toId), eq(graphEdges.type, type)),
        // related/contrasts are symmetric
        type === "related" || type === "contrasts" ? and(eq(graphEdges.fromId, toId), eq(graphEdges.toId, fromId), eq(graphEdges.type, type)) : undefined,
      ),
    )
    .get();
  if (dup) return false;
  db.insert(graphEdges).values({ id: newId(), fromId, toId, type, label: label ?? null }).run();
  return true;
}

export function addEvidence(e: {
  nodeId: string;
  sessionId: string;
  kind: EvidenceKind;
  text: string;
  checkId?: string | null;
  verdict?: string | null;
  confidence?: number | null;
}): boolean {
  const same = db
    .select({ id: graphEvidence.id })
    .from(graphEvidence)
    .where(
      and(
        eq(graphEvidence.nodeId, e.nodeId),
        eq(graphEvidence.sessionId, e.sessionId),
        eq(graphEvidence.kind, e.kind),
        e.checkId ? eq(graphEvidence.checkId, e.checkId) : eq(graphEvidence.text, e.text),
      ),
    )
    .get();
  if (same) return false;
  db.insert(graphEvidence)
    .values({ id: newId(), nodeId: e.nodeId, sessionId: e.sessionId, checkId: e.checkId ?? null, kind: e.kind, verdict: e.verdict ?? null, confidence: e.confidence ?? null, text: e.text, ts: Date.now() })
    .run();
  if (e.checkId) db.update(checks).set({ nodeId: e.nodeId }).where(eq(checks.id, e.checkId)).run();
  return true;
}

/** Recomputes the node mastery from ALL its evidence. */
export function recomputeNode(nodeId: string) {
  const ev = db.select().from(graphEvidence).where(eq(graphEvidence.nodeId, nodeId)).all();
  const r = computeMastery(ev);
  db.update(graphNodes)
    .set({ mastery: r.mastery, masteryScore: r.score, lastConfidence: r.lastConfidence, evidenceCount: ev.length, updatedAt: Date.now() })
    .where(eq(graphNodes.id, nodeId))
    .run();
  return r;
}

export function deleteNode(id: string) {
  db.delete(graphEdges).where(or(eq(graphEdges.fromId, id), eq(graphEdges.toId, id))).run();
  db.delete(graphEvidence).where(eq(graphEvidence.nodeId, id)).run();
  db.update(checks).set({ nodeId: null }).where(eq(checks.nodeId, id)).run();
  db.delete(graphNodes).where(eq(graphNodes.id, id)).run();
}

/** Merges `fromId` into `intoId`: moves edges/evidence/checks and deletes `fromId`. */
export function mergeNodes(fromId: string, intoId: string) {
  if (fromId === intoId) throw new Error("identical ids");
  db.transaction(() => {
    db.update(graphEvidence).set({ nodeId: intoId }).where(eq(graphEvidence.nodeId, fromId)).run();
    db.update(checks).set({ nodeId: intoId }).where(eq(checks.nodeId, fromId)).run();
    const edges = db.select().from(graphEdges).where(or(eq(graphEdges.fromId, fromId), eq(graphEdges.toId, fromId))).all();
    db.delete(graphEdges).where(or(eq(graphEdges.fromId, fromId), eq(graphEdges.toId, fromId))).run();
    for (const e of edges) {
      const f = e.fromId === fromId ? intoId : e.fromId;
      const t = e.toId === fromId ? intoId : e.toId;
      addEdge(f, t, e.type, e.label);
    }
    db.delete(graphNodes).where(eq(graphNodes.id, fromId)).run();
    recomputeNode(intoId);
  });
}

/** Removes a session's evidence and cleans up nodes that existed only because of it. */
export function removeSessionFromGraph(sessionId: string) {
  const ev = db.select({ nodeId: graphEvidence.nodeId }).from(graphEvidence).where(eq(graphEvidence.sessionId, sessionId)).all();
  const ids = [...new Set(ev.map((e) => e.nodeId))];
  db.delete(graphEvidence).where(eq(graphEvidence.sessionId, sessionId)).run();
  for (const id of ids) {
    if (!db.select({ id: graphNodes.id }).from(graphNodes).where(eq(graphNodes.id, id)).get()) continue;
    const left = db.select({ n: sql<number>`count(*)` }).from(graphEvidence).where(eq(graphEvidence.nodeId, id)).get()?.n ?? 0;
    const edgeN =
      db.select({ n: sql<number>`count(*)` }).from(graphEdges).where(or(eq(graphEdges.fromId, id), eq(graphEdges.toId, id))).get()?.n ?? 0;
    // No evidence and no edges: it only belonged to this session.
    if (left === 0 && edgeN === 0) deleteNode(id);
    else recomputeNode(id);
  }
}

export type GraphFilter = { domain?: string; mastery?: Mastery[]; q?: string };

export function loadGraph(f: GraphFilter = {}) {
  let nodes = db.select().from(graphNodes).orderBy(desc(graphNodes.updatedAt)).all();
  const domains = [...new Set(nodes.map((n) => n.domain).filter(Boolean))].sort();
  const all = nodes;
  if (f.domain) nodes = nodes.filter((n) => normDomain(n.domain) === normDomain(f.domain!));
  if (f.mastery?.length) nodes = nodes.filter((n) => f.mastery!.includes(n.mastery));
  if (f.q?.trim()) {
    const q = normTitle(f.q);
    nodes = nodes.filter((n) => normTitle(n.title).includes(q) || normTitle(n.summary).includes(q));
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges = db.select().from(graphEdges).all().filter((e) => ids.has(e.fromId) && ids.has(e.toId));
  const stats = { total: all.length, unseen: 0, learning: 0, mastered: 0, misconception: 0, overconfident: 0 };
  for (const n of all) {
    stats[n.mastery]++;
    if (n.mastery === "misconception" && (n.lastConfidence ?? 0) >= 4) stats.overconfident++;
  }
  return { nodes, edges, domains, stats };
}

/** Existing titles for the extractor (same domain first, at most `max`). */
export function existingTitles(domain: string | null | undefined, max = 80): string[] {
  const dom = domain ? normDomain(domain) : "";
  const all = db.select().from(graphNodes).orderBy(desc(graphNodes.updatedAt)).all();
  const same = dom ? all.filter((n) => normDomain(n.domain) === dom || normDomain(n.domain).includes(dom) || dom.includes(normDomain(n.domain))) : [];
  const rest = all.filter((n) => !same.includes(n));
  return [...same, ...rest].slice(0, max).map((n) => n.title);
}

const MASTERY_ORDER: Record<Mastery, number> = { misconception: 0, learning: 1, mastered: 2, unseen: 3 };

/** Lines "- title [mastery, score] — summary" of the nodes relevant to the session topic (at most `max`). */
export function knownNodeLines(s: { topic: string; request?: string | null; context?: string | null; goal?: string | null }, max = 25): string[] {
  const nodes = db.select().from(graphNodes).all().filter((n) => n.mastery !== "unseen");
  if (!nodes.length) return [];
  const query = new Set(tokens([s.topic, s.request, s.context, s.goal].filter(Boolean).join(" ")));
  const dom = s.context ? normDomain(s.context) : "";
  const domTokens = new Set(tokens(s.context ?? ""));
  const scored = nodes
    .map((n) => {
      let score = 0;
      const nd = normDomain(n.domain);
      if (dom && nd && (nd.includes(dom) || dom.includes(nd))) score += 2;
      else if (domTokens.size && tokens(n.domain).some((t) => domTokens.has(t))) score += 1;
      score += tokens(n.title).filter((t) => query.has(t)).length * 2;
      score += tokens(n.summary).filter((t) => query.has(t)).length * 0.5;
      return { n, score };
    })
    .filter((x) => x.score > 0);
  scored.sort((a, b) => MASTERY_ORDER[a.n.mastery] - MASTERY_ORDER[b.n.mastery] || b.score - a.score || b.n.updatedAt - a.n.updatedAt);
  return scored.slice(0, max).map(({ n }) => `- ${n.title} [${n.mastery}, ${n.masteryScore.toFixed(2)}]${n.summary ? ` — ${n.summary.slice(0, 140)}` : ""}`);
}

export function nodesById(ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(graphNodes).where(inArray(graphNodes.id, ids)).all();
}

export function evidenceOf(nodeId: string) {
  return db.select().from(graphEvidence).where(eq(graphEvidence.nodeId, nodeId)).orderBy(asc(graphEvidence.ts)).all();
}

/** Path from known to goal: prerequisite ancestors (stops at mastered nodes, included), in topological order. */
export function pathTo(goalId: string): GNode[] {
  const edges = db.select().from(graphEdges).where(eq(graphEdges.type, "prerequisite")).all();
  const nodes = new Map(db.select().from(graphNodes).all().map((n) => [n.id, n]));
  const set = new Set<string>();
  const stack = [goalId];
  while (stack.length) {
    const id = stack.pop()!;
    if (set.has(id) || !nodes.has(id)) continue;
    set.add(id);
    if (id !== goalId && nodes.get(id)!.mastery === "mastered") continue;
    for (const e of edges) if (e.toId === id) stack.push(e.fromId);
  }
  const sub = edges.filter((e) => set.has(e.fromId) && set.has(e.toId));
  const indeg = new Map([...set].map((id) => [id, 0]));
  for (const e of sub) indeg.set(e.toId, (indeg.get(e.toId) ?? 0) + 1);
  const queue = [...set].filter((id) => indeg.get(id) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of sub) if (e.fromId === id && indeg.set(e.toId, indeg.get(e.toId)! - 1).get(e.toId) === 0) queue.push(e.toId);
  }
  return order.map((id) => nodes.get(id)!);
}

/** Best node whose title matches the goal (fuzzy). */
export function matchGoalNode(goal: string): GNode | undefined {
  const g = normTitle(goal);
  let best: { n: GNode; s: number } | undefined;
  for (const n of db.select().from(graphNodes).all()) {
    const nt = n.normTitle;
    let s = jaccard(n.title, goal);
    if (nt === g) s = 1;
    else if (nt.split(" ").length >= 2 && (g.includes(nt) || nt.includes(g))) s = Math.max(s, 0.8);
    if (s >= 0.6 && (!best || s > best.s)) best = { n, s };
  }
  return best?.n;
}

/** Nodes touched in the session + their direct prerequisites (and edges between them). */
export function sessionGraph(sessionId: string) {
  const touched = new Set(db.select({ nodeId: graphEvidence.nodeId }).from(graphEvidence).where(eq(graphEvidence.sessionId, sessionId)).all().map((e) => e.nodeId));
  const edges = db.select().from(graphEdges).all();
  const ids = new Set(touched);
  for (const e of edges) if (e.type === "prerequisite" && touched.has(e.toId)) ids.add(e.fromId);
  return { nodes: nodesById([...ids]), edges: edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId)) };
}

/** Up to `n` 'learning'/'misconception' nodes (misconceptions first) for "Continue where you left off". */
export function continueNodes(n = 3) {
  return db
    .select()
    .from(graphNodes)
    .all()
    .filter((x) => x.mastery === "learning" || x.mastery === "misconception")
    .sort((a, b) => MASTERY_ORDER[a.mastery] - MASTERY_ORDER[b.mastery] || b.updatedAt - a.updatedAt)
    .slice(0, n);
}
