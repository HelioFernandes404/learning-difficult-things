import { and, desc, eq, like, ne, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { checks, concepts, lessonMaps, sessions } from "@/lib/schema";
import { knownNodeLines } from "@/lib/graph/store";
import { LOCALES, messages } from "@/i18n";
import { EXERCISE_PREFIX_PT } from "@/lib/legacy-pt";
import type { PromptContext } from "./prompt";

/** Every exercise prefix a stored question may start with: all locales plus legacy Portuguese. */
const EXERCISE_PREFIXES = [...new Set([...LOCALES.map((l) => messages(l).tutor.exercisePrefix), EXERCISE_PREFIX_PT])];

export function loadContext(sessionId: string): PromptContext {
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  const map = db.select().from(lessonMaps).where(eq(lessonMaps.sessionId, sessionId)).get();
  const cs = db.select({ title: concepts.title }).from(concepts).where(eq(concepts.sessionId, sessionId)).all();
  const recent = db
    .select()
    .from(checks)
    .where(eq(checks.sessionId, sessionId))
    .orderBy(desc(checks.createdAt))
    .limit(8)
    .all();
  const exercisesDone = db
    .select({ id: checks.id })
    .from(checks)
    .where(and(eq(checks.sessionId, sessionId), or(...EXERCISE_PREFIXES.map((p) => like(checks.question, `${p}%`))), ne(checks.answer, "")))
    .all().length;
  return {
    exercisesDone,
    topic: session?.topic ?? "(unknown)",
    request: session?.request ?? null,
    context: session?.context ?? null,
    goal: session?.goal ?? null,
    level: session?.level ?? null,
    mode: session?.mode ?? null,
    plan: session?.plan ?? null,
    knownNodes: session ? knownNodeLines(session) : [],
    lessonMap: map?.steps ?? [],
    conceptTitles: cs.map((c) => c.title),
    recentChecks: recent.map((c) => ({ question: c.question, confidence: c.confidence, verdict: c.verdict })),
  };
}
