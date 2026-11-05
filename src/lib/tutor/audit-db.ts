import { db, newId } from "@/lib/db";
import { audit } from "@/lib/schema";
import { logEvent } from "@/lib/log";

/** Writes a row to the audit table (survives log rotation). Never throws. */
export function recordAudit(sessionId: string, turnId: string | null, kind: string, payload: Record<string, unknown>) {
  try {
    db.insert(audit).values({ id: newId(), ts: Date.now(), sessionId, turnId, kind, payload }).run();
  } catch (e) {
    console.error("[llm] failed to write audit", e);
  }
}

/** Tool side effect: `db_write` event in the log + a row in audit. */
export function recordDbWrite(sessionId: string, turnId: string | null, op: string, payload: Record<string, unknown>, summary: string, refused = false) {
  logEvent("db_write", { sessionId, turnId, op, refused, summary, ...payload });
  recordAudit(sessionId, turnId, refused ? `${op}_refused` : op, { summary, ...payload });
}
