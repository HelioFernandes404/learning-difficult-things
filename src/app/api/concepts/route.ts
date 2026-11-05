import { desc, eq } from "drizzle-orm";
import { getT } from "@/i18n/server";
import { db, newId } from "@/lib/db";
import { concepts } from "@/lib/schema";

export const dynamic = "force-dynamic";

/** GET: all concepts (each carries sessionId; the client filters "this session"). */
export async function GET() {
  return Response.json(db.select().from(concepts).orderBy(desc(concepts.updatedAt)).all());
}

export async function POST(req: Request) {
  const { t } = await getT();
  const b = (await req.json()) as { sessionId?: string | null; title?: string; content?: string; tags?: string[] };
  if (!b.title?.trim()) return Response.json({ error: t.api.titleRequired }, { status: 400 });
  const now = Date.now();
  const row = {
    id: newId(),
    sessionId: b.sessionId ?? null,
    title: b.title.trim(),
    content: b.content ?? "",
    tags: b.tags ?? [],
    source: "user" as const,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(concepts).values(row).run();
  return Response.json(row, { status: 201 });
}

export async function PUT(req: Request) {
  const { t } = await getT();
  const b = (await req.json()) as { id: string; title?: string; content?: string; tags?: string[] };
  if (!b.id) return Response.json({ error: t.api.idRequired }, { status: 400 });
  const set: Partial<typeof concepts.$inferInsert> = { updatedAt: Date.now() };
  if (b.title !== undefined) set.title = b.title;
  if (b.content !== undefined) set.content = b.content;
  if (b.tags !== undefined) set.tags = b.tags;
  db.update(concepts).set(set).where(eq(concepts.id, b.id)).run();
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { t } = await getT();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: t.api.idRequired }, { status: 400 });
  db.delete(concepts).where(eq(concepts.id, id)).run();
  return Response.json({ ok: true });
}
