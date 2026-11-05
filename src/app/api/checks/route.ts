import { desc, eq } from "drizzle-orm";
import { getT } from "@/i18n/server";
import { db, newId } from "@/lib/db";
import { checks } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  const q = db.select().from(checks);
  const rows = sessionId ? q.where(eq(checks.sessionId, sessionId)).orderBy(desc(checks.createdAt)).all() : q.orderBy(desc(checks.createdAt)).all();
  return Response.json(rows);
}

/** Called by the browser when the student answers an ask_check. Returns the check row. */
export async function POST(req: Request) {
  const { t } = await getT();
  const b = (await req.json()) as { sessionId?: string; question?: string; answer?: string; confidence?: number };
  if (!b.sessionId || !b.question || !b.answer || !b.confidence) {
    return Response.json({ error: t.api.checkFieldsRequired }, { status: 400 });
  }
  const row = {
    id: newId(),
    sessionId: b.sessionId,
    question: b.question,
    answer: b.answer,
    confidence: Math.min(5, Math.max(1, Math.round(b.confidence))),
    verdict: null,
    feedback: null,
    createdAt: Date.now(),
  };
  db.insert(checks).values(row).run();
  return Response.json(row, { status: 201 });
}
