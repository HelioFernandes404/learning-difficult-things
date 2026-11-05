import { logEvent } from "@/lib/log";

const NAMES = new Set(["card_shown", "check_answered", "choice_picked", "visual_error", "render_error"]);

/** Browser events -> log (`client_event`). */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { sessionId?: string; turnId?: string | null; name?: string; data?: Record<string, unknown> };
    if (!b.sessionId || !b.name || !NAMES.has(b.name)) return Response.json({ error: "invalid" }, { status: 400 });
    const data = JSON.parse(JSON.stringify(b.data ?? {}).slice(0, 4000)) as Record<string, unknown>;
    logEvent("client_event", { sessionId: b.sessionId, turnId: typeof b.turnId === "string" ? b.turnId.slice(0, 40) : null, name: b.name, data });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
}
