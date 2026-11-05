import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/schema";
import { readEvents } from "@/lib/log";
import { groupTurns, sessionStats } from "@/lib/trace";

export const dynamic = "force-dynamic";

/** Sessions from the DB + sessions only present in the log, with log stats. */
export async function GET() {
  const stats = new Map(sessionStats(groupTurns(readEvents()).turns).map((s) => [s.id, s]));
  const rows = db.select().from(sessions).orderBy(desc(sessions.updatedAt)).all();
  const out = rows.map((r) => ({ id: r.id, topic: r.topic, updatedAt: r.updatedAt, inDb: true, stat: stats.get(r.id) ?? null }));
  const known = new Set(rows.map((r) => r.id));
  for (const s of stats.values()) {
    if (!known.has(s.id)) out.push({ id: s.id, topic: "(deleted)", updatedAt: Date.parse(s.lastTs) || 0, inDb: false, stat: s });
  }
  return Response.json(out.sort((a, b) => b.updatedAt - a.updatedAt));
}
