import { getT } from "@/i18n/server";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { concepts, graphEdges, graphNodes, sessions } from "@/lib/schema";
import { checks } from "@/lib/schema";
import { deleteNode, evidenceOf, nodesById } from "@/lib/graph/store";
import { normTitle } from "@/lib/graph/normalize";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { t } = await getT();
  const { id } = await params;
  const node = db.select().from(graphNodes).where(eq(graphNodes.id, id)).get();
  if (!node) return Response.json({ error: t.api.notFound }, { status: 404 });
  const edges = db.select().from(graphEdges).where(or(eq(graphEdges.fromId, id), eq(graphEdges.toId, id))).all();
  const other = (e: (typeof edges)[number]) => (e.fromId === id ? e.toId : e.fromId);
  const nmap = new Map(nodesById([...new Set(edges.map(other))]).map((n) => [n.id, n]));
  const pick = (e: (typeof edges)[number]) => {
    const n = nmap.get(other(e));
    return n ? { id: n.id, title: n.title, mastery: n.mastery, type: e.type, label: e.label } : null;
  };
  const prerequisites = edges.filter((e) => e.type === "prerequisite" && e.toId === id).map(pick).filter(Boolean);
  const dependents = edges.filter((e) => e.type === "prerequisite" && e.fromId === id).map(pick).filter(Boolean);
  const relations = edges.filter((e) => e.type !== "prerequisite").map((e) => {
    const p = pick(e);
    return p && { ...p, direction: e.fromId === id ? "out" : "in" };
  }).filter(Boolean);

  const evidence = evidenceOf(id).map((ev) => {
    const s = db.select({ topic: sessions.topic }).from(sessions).where(eq(sessions.id, ev.sessionId)).get();
    const c = ev.checkId ? db.select().from(checks).where(eq(checks.id, ev.checkId)).get() : null;
    return { ...ev, sessionTopic: s?.topic ?? null, question: c?.question ?? null, answer: c?.answer ?? null };
  });
  const key = node.normTitle;
  const notes = db
    .select()
    .from(concepts)
    .all()
    .filter((c) => normTitle(c.title).includes(key) || key.includes(normTitle(c.title)) || normTitle(c.content).includes(key))
    .map((c) => ({ id: c.id, title: c.title, content: c.content }));
  return Response.json({ node, prerequisites, dependents, relations, evidence, notes });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { t } = await getT();
  const { id } = await params;
  const b = (await req.json()) as { summary?: string; title?: string; domain?: string };
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (typeof b.summary === "string") patch.summary = b.summary.trim();
  if (typeof b.domain === "string") patch.domain = b.domain.trim();
  if (typeof b.title === "string" && b.title.trim()) {
    const key = normTitle(b.title);
    const clash = db.select({ id: graphNodes.id }).from(graphNodes).where(eq(graphNodes.normTitle, key)).get();
    if (clash && clash.id !== id) return Response.json({ error: t.api.titleExists }, { status: 409 });
    patch.title = b.title.trim();
    patch.normTitle = key;
  }
  db.update(graphNodes).set(patch).where(and(eq(graphNodes.id, id))).run();
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  deleteNode(id);
  return Response.json({ ok: true });
}
