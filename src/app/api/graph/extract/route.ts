import { getT } from "@/i18n/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/schema";
import { extractSession } from "@/lib/graph/extract";

export const maxDuration = 300;

/** Re-extracts the graph of a whole session (deletes the session's evidence first). */
export async function POST(req: Request) {
  const { t } = await getT();
  const { sessionId } = (await req.json()) as { sessionId?: string };
  if (!sessionId || !db.select().from(sessions).where(eq(sessions.id, sessionId)).get()) {
    return Response.json({ error: t.api.sessionNotFound }, { status: 404 });
  }
  return Response.json(await extractSession(sessionId));
}
