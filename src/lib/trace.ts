/** Pure grouping of log events into turns (used by the CLI and the /debug page). */

export interface Ev {
  ts: string;
  event: string;
  sessionId?: string;
  turnId?: string | null;
  [k: string]: unknown;
}

export type Usage = { inputTokens?: number; outputTokens?: number; totalTokens?: number; reasoningTokens?: number; cachedInputTokens?: number };
export type ToolCallView = { name: string; input?: unknown };
export type ToolResultView = { name: string; output?: unknown };

export interface StartEv extends Ev {
  model?: string;
  effort?: string;
  systemHash?: string;
  systemLength?: number;
  messageCount?: number;
  input?: { kind: string; text?: string; answer?: string; confidence?: number; checkId?: string; choice?: string };
}
export interface StepEv extends Ev {
  stepIndex: number;
  text?: string;
  reasoningText?: string | null;
  toolCalls?: ToolCallView[];
  toolResults?: ToolResultView[];
  finishReason?: string;
  usage?: Usage;
  stepLatencyMs?: number;
  guard?: { toolChoice?: string } | null;
}
export interface EndEv extends Ev {
  finishReason?: string;
  totalUsage?: Usage;
  latencyMs?: number;
  endedWith?: string;
  flags?: string[];
  legacy?: boolean;
}
export interface WriteEv extends Ev {
  op?: string;
  summary?: unknown;
  refused?: boolean;
}
export interface Turn {
  turnId: string;
  sessionId: string;
  ts: string;
  start?: StartEv;
  steps: StepEv[];
  end?: EndEv;
  error?: Ev;
  writes: WriteEv[];
}

export function groupTurns(events: Ev[]): { turns: Turn[]; client: Ev[]; graph: Ev[] } {
  const byId = new Map<string, Turn>();
  const turns: Turn[] = [];
  const client: Ev[] = [];
  const graph: Ev[] = [];
  const legacyOpen = new Map<string, string>(); // sessionId -> turnId (old entries, without turnId)
  let legacyN = 0;

  for (const e of events) {
    if (e.event === "graph_extract") {
      graph.push(e);
      continue;
    }
    if (e.event === "client_event") {
      client.push(e);
      continue;
    }
    const sid = e.sessionId ?? "";
    let id = e.turnId ?? undefined;
    let ev: Ev = e;
    if (!id) {
      if (!["step", "finish", "error"].includes(e.event) || !sid) continue;
      let open = legacyOpen.get(sid);
      if (!open || (e.event === "step" && e.step === 1)) {
        open = `legacy-${++legacyN}`;
        legacyOpen.set(sid, open);
      }
      id = open;
      if (e.event === "finish" || e.event === "error") legacyOpen.delete(sid);
      if (e.event === "step") {
        ev = { ...e, stepIndex: Number(e.step ?? 1) - 1 };
        if (e.step === 1 && !byId.has(id)) {
          const t = newTurn(id, sid, e.ts);
          t.start = { ts: e.ts, event: "turn_start", sessionId: sid, model: e.model as string, effort: e.reasoningEffort as string, systemHash: e.systemHash as string, systemLength: e.systemLength as number, input: { kind: "text", text: String(e.lastUserMessage ?? "") } };
          byId.set(id, t);
          turns.push(t);
        }
      } else if (e.event === "finish") {
        ev = { ...e, event: "turn_end", legacy: true, flags: [] };
      }
    }
    let t = byId.get(id);
    if (!t) {
      t = newTurn(id, sid, e.ts);
      byId.set(id, t);
      turns.push(t);
    }
    switch (ev.event) {
      case "turn_start": t.start = ev as StartEv; break;
      case "step": t.steps.push(ev as StepEv); break;
      case "turn_end": t.end = ev as EndEv; break;
      case "error": t.error = ev; break;
      case "db_write": t.writes.push(ev as WriteEv); break;
    }
  }
  return { turns, client, graph };
}

function newTurn(turnId: string, sessionId: string, ts: string): Turn {
  return { turnId, sessionId, ts, steps: [], writes: [] };
}

export interface SessionStat {
  id: string;
  turns: number;
  tokens: number;
  flags: number;
  flaggedTurns: number;
  errors: number;
  avgLatencyMs: number;
  lastTs: string;
}

export function turnTokens(t: Turn) {
  return t.end?.totalUsage?.totalTokens ?? t.steps.reduce((a, s) => a + (s.usage?.totalTokens ?? 0), 0);
}

export function sessionStats(turns: Turn[]): SessionStat[] {
  const m = new Map<string, SessionStat & { lat: number }>();
  for (const t of turns) {
    const s = m.get(t.sessionId) ?? { id: t.sessionId, turns: 0, tokens: 0, flags: 0, flaggedTurns: 0, errors: 0, avgLatencyMs: 0, lastTs: "", lat: 0 };
    s.turns++;
    s.tokens += turnTokens(t);
    const nf = t.end?.flags?.length ?? 0;
    s.flags += nf;
    if (nf) s.flaggedTurns++;
    if (t.error) s.errors++;
    s.lat += t.end?.latencyMs ?? 0;
    const last = t.end?.ts ?? t.ts;
    if (last > s.lastTs) s.lastTs = last;
    m.set(t.sessionId, s);
  }
  return [...m.values()]
    .map(({ lat, ...s }) => ({ ...s, avgLatencyMs: s.turns ? Math.round(lat / s.turns) : 0 }))
    .sort((a, b) => b.lastTs.localeCompare(a.lastTs));
}
