import { desc } from "drizzle-orm";
import { db, newId } from "@/lib/db";
import { sessions } from "@/lib/schema";
import { shortTitle } from "@/lib/lesson-request";
import { isLocale, localeFromRequest, messages } from "@/i18n";
import { LEGACY_LEVELS } from "@/lib/legacy-pt";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(db.select().from(sessions).orderBy(desc(sessions.updatedAt)).all());
}

export async function POST(req: Request) {
  const body = (await req.json()) as { topic?: string; request?: string; context?: string; goal?: string; level?: string; mode?: string; plan?: string; locale?: string };
  const locale = isLocale(body.locale) ? body.locale : localeFromRequest(req);
  const clean = (v?: string) => v?.trim() || null;
  // Accept a stable level key or an old Portuguese label; store the key.
  const rawLevel = clean(body.level);
  const level = rawLevel ? (LEGACY_LEVELS[rawLevel] ?? rawLevel) : null;
  const request = clean(body.request);
  const topic = clean(body.topic) ?? shortTitle(request ?? "");
  if (!topic) return Response.json({ error: messages(locale).tutor.errors.topicRequired }, { status: 400 });
  const now = Date.now();
  const row = {
    id: newId(),
    topic,
    request,
    context: clean(body.context),
    goal: clean(body.goal),
    level,
    mode: body.mode === "practice" ? "practice" : null,
    plan: clean(body.plan),
    locale,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(sessions).values(row).run();
  return Response.json(row, { status: 201 });
}
