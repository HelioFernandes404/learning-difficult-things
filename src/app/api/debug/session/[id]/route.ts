import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { audit } from "@/lib/schema";
import { readEvents } from "@/lib/log";
import { groupTurns } from "@/lib/trace";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const events = readEvents().filter((e) => e.sessionId === id);
  const { turns, client } = groupTurns(events);
  const rows = db.select().from(audit).where(eq(audit.sessionId, id)).orderBy(asc(audit.ts)).all();
  return Response.json({ turns, client, audit: rows });
}
