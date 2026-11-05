"use client";

let sessionId = "";
let turnId: string | null = null;

/** Called by Chat (render) so cards/visuals know the session. */
export function setTelemetrySession(id: string) {
  sessionId = id;
}

/** Turn that produced the last assistant message (comes in message.metadata.turnId). */
export function setTelemetryTurn(id: string | null) {
  turnId = id;
}

/** Sends a client event to /api/telemetry. Fire-and-forget; never throws. */
export function track(name: string, data: Record<string, unknown> = {}) {
  if (!sessionId) return;
  try {
    fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, turnId, name, data }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
