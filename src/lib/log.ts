import fs from "node:fs";
import path from "node:path";
import type { Ev } from "@/lib/trace";

const DIR = path.join(process.cwd(), "logs");
const FILE = path.join(DIR, "llm.jsonl");
const MAX_BYTES = 20 * 1024 * 1024;

function rotateIfNeeded() {
  try {
    if (fs.statSync(FILE).size <= MAX_BYTES) return;
  } catch {
    return;
  }
  const d = new Date().toISOString();
  let target = path.join(DIR, `llm-${d.slice(0, 10)}.jsonl`);
  if (fs.existsSync(target)) target = path.join(DIR, `llm-${d.slice(0, 10)}-${d.slice(11, 19).replace(/:/g, "")}.jsonl`);
  fs.renameSync(FILE, target);
}

const n = (v: unknown) => (typeof v === "number" ? v : "?");

/** One-line summary per event (console). */
function summarize(e: Record<string, unknown>) {
  const head = `[llm] ${String(e.event).padEnd(10)} s=${String(e.sessionId ?? "-").slice(0, 8)} t=${String(e.turnId ?? "-")}`;
  const u = e.usage as { totalTokens?: number } | undefined;
  const tu = e.totalUsage as { totalTokens?: number } | undefined;
  switch (e.event) {
    case "turn_start":
      return `${head} model=${e.model} effort=${e.effort} msgs=${e.messageCount} input=${(e.input as { kind?: string })?.kind}`;
    case "step": {
      const calls = ((e.toolCalls as { name: string }[]) ?? []).map((c) => c.name).join(",");
      return `${head} step=${e.stepIndex} finish=${e.finishReason} tokens=${n(u?.totalTokens)} text=${String(e.text ?? "").length}ch guard=${e.guard ? JSON.stringify(e.guard) : "-"} tools=[${calls}] ${e.stepLatencyMs}ms`;
    }
    case "turn_end":
      return `${head} finish=${e.finishReason} ended=${e.endedWith} tokens=${n(tu?.totalTokens)} ${e.latencyMs}ms flags=[${((e.flags as string[]) ?? []).join(",")}]`;
    case "error":
      return `${head} ERROR ${String(e.error).slice(0, 200)}`;
    case "db_write":
      return `${head} op=${e.op}${e.refused ? " REFUSED" : ""} ${JSON.stringify(e.summary ?? "").slice(0, 120)}`;
    case "graph_extract":
      return `${head} nodes+${e.nodesAdded ?? 0}/~${e.nodesUpdated ?? 0} edges+${e.edgesAdded ?? 0} ev+${e.evidenceAdded ?? 0} ${e.skipped ? `skipped(${e.skipped})` : ""}${e.error ? ` ERR ${String(e.error).slice(0, 120)}` : ""} ${e.latencyMs}ms`;
    case "client_event":
      return `${head} client=${e.name} ${JSON.stringify(e.data ?? {}).slice(0, 120)}`;
    default:
      return head;
  }
}

/** Appends one JSON line to logs/llm.jsonl (rotates at 20MB) and prints a console summary. Never throws. */
export function logEvent(event: string, fields: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), event, ...fields };
  try {
    fs.mkdirSync(DIR, { recursive: true });
    rotateIfNeeded();
    fs.appendFileSync(FILE, JSON.stringify(entry) + "\n");
  } catch (e) {
    console.error("[llm] failed to write log", e);
  }
  console.log(summarize(entry));
}

/** All events (rotated llm-*.jsonl + llm.jsonl), in order. Invalid lines are ignored. */
export function readEvents(): Ev[] {
  if (!fs.existsSync(DIR)) return [];
  const files = fs
    .readdirSync(DIR)
    .filter((f) => /^llm(-.*)?\.jsonl$/.test(f) && f !== "llm.jsonl")
    .sort()
    .concat(fs.existsSync(FILE) ? ["llm.jsonl"] : []);
  const out: Ev[] = [];
  for (const f of files) {
    for (const l of fs.readFileSync(path.join(DIR, f), "utf8").split("\n")) {
      if (!l) continue;
      try {
        out.push(JSON.parse(l) as Ev);
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

/** Compat: last N entries, newest first. */
export function readLogs(limit = 100): unknown[] {
  return readEvents().slice(-limit).reverse();
}
