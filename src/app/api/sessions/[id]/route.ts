import { asc, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db } from "@/lib/db";
import { localeFromRequest, messages as dictMessages } from "@/i18n";
import { removeSessionFromGraph } from "@/lib/graph/store";
import { checks, concepts, lessonMaps, messages, sessions } from "@/lib/schema";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const session = db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!session) return Response.json({ error: dictMessages(localeFromRequest(req)).tutor.errors.notFound }, { status: 404 });
  const rows = db.select().from(messages).where(eq(messages.sessionId, id)).orderBy(asc(messages.createdAt)).all();
  const uiMessages: UIMessage[] = rows.map((r) => ({
    id: r.id.startsWith(`${id}:`) ? r.id.slice(id.length + 1) : r.id,
    role: r.role as UIMessage["role"],
    parts: r.parts as UIMessage["parts"],
  }));
  const map = db.select().from(lessonMaps).where(eq(lessonMaps.sessionId, id)).get();
  return Response.json({ session, messages: uiMessages, lessonMap: map?.steps ?? [] });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  removeSessionFromGraph(id);
  db.delete(messages).where(eq(messages.sessionId, id)).run();
  db.delete(checks).where(eq(checks.sessionId, id)).run();
  db.delete(lessonMaps).where(eq(lessonMaps.sessionId, id)).run();
  db.delete(concepts).where(eq(concepts.sessionId, id)).run();
  db.delete(sessions).where(eq(sessions.id, id)).run();
  return Response.json({ ok: true });
}
