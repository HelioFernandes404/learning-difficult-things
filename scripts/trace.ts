/**
 * pnpm trace [sessionId|last] [--turns N] [--flags] [--full]
 * pnpm trace sessions
 * Reads logs/llm*.jsonl and prints turns in a compact, greppable form.
 */
import { readEvents } from "@/lib/log";
import { groupTurns, sessionStats, turnTokens, type Ev, type Turn } from "@/lib/trace";

const args = process.argv.slice(2);
const flag = (k: string) => args.includes(`--${k}`);
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--turns"].includes(args[i - 1])));
const target = positional[0] ?? "last";
const FULL = flag("full");
const tty = process.stdout.isTTY;
const c = (code: number, s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = (s: string) => c(2, s);
const red = (s: string) => c(31, s);
const yellow = (s: string) => c(33, s);
const bold = (s: string) => c(1, s);

const one = (s: unknown, n = 200) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return FULL || t.length <= n ? t : `${t.slice(0, n)}… (+${t.length - n}ch)`;
};
const json = (v: unknown, n = 140) => one(JSON.stringify(v), n);
const hhmmss = (ts: string) => ts.slice(11, 19);
const secs = (ms?: number) => (ms == null ? "?" : `${(ms / 1000).toFixed(1)}s`);

const { turns, client, graph } = groupTurns(readEvents());
const stats = sessionStats(turns);

if (target === "sessions") {
  console.log("session   turns  tokens  avg-lat  flagged  flags  errors  last");
  for (const s of stats) {
    console.log(`${s.id.slice(0, 8)}  ${String(s.turns).padStart(5)}  ${String(s.tokens).padStart(6)}  ${secs(s.avgLatencyMs).padStart(7)}  ${String(s.flaggedTurns).padStart(7)}  ${String(s.flags).padStart(5)}  ${String(s.errors).padStart(6)}  ${s.lastTs}`);
  }
  process.exit(0);
}

const sid = target === "last" ? stats[0]?.id : stats.find((s) => s.id.startsWith(target))?.id;
if (!sid) {
  console.error(`session not found: ${target} (use: pnpm trace sessions)`);
  process.exit(1);
}

let list = turns.filter((t) => t.sessionId === sid);
const total = list.length;
if (flag("flags")) list = list.filter((t) => t.end?.flags?.length || t.error);
const n = Number(opt("turns"));
if (n > 0) list = list.slice(-n);

console.log(bold(`session ${sid}`) + dim(`  ${list.length}/${total} turns${flag("flags") ? " (flagged)" : ""}`));

function printTurn(t: Turn, idx: number) {
  const st = t.start;
  console.log(`\n${bold(`T${idx}`)} ${t.turnId} ${hhmmss(t.ts)} ${st?.model ?? "?"} effort=${st?.effort ?? "?"} sys=${st?.systemHash ?? "?"}(${st?.systemLength ?? "?"}ch) msgs=${st?.messageCount ?? "?"}`);
  const i = st?.input;
  if (i) {
    const body =
      i.kind === "ask_check"
        ? `check=${i.checkId?.slice(0, 8)} conf=${i.confidence} "${one(i.answer)}"`
        : i.kind === "offer_choices"
          ? `choice=${i.choice} "${one(i.text)}"`
          : `"${one(i.text)}"`;
    console.log(`  in  ${i.kind}: ${body}`);
  }
  for (const s of t.steps) {
    const guard = s.guard ? `guard=${s.guard.toolChoice}` : "guard=-";
    console.log(`  s${s.stepIndex} ${guard} ${secs(s.stepLatencyMs)} tok=${s.usage?.totalTokens ?? "?"} (reason=${s.usage?.reasoningTokens ?? 0}) finish=${s.finishReason}`);
    if (s.reasoningText) console.log(dim(`     think: ${one(s.reasoningText, 160)}`));
    if (s.text?.trim()) console.log(`     txt: ${one(s.text)}`);
    for (const call of s.toolCalls ?? []) console.log(`     call ${call.name} ${json(call.input)}`);
    for (const r of s.toolResults ?? []) console.log(`     res  ${r.name} ${json(r.output, 100)}`);
  }
  for (const w of t.writes) console.log(`  db  ${w.op}${w.refused ? " REFUSED" : ""} ${one(w.summary, 120)}`);
  if (t.error) console.log(red(`  ERR ${one(t.error.error, 300)}`));
  const e = t.end;
  if (e) {
    const fl = e.flags ?? [];
    console.log(`  end ${e.endedWith ?? "?"} finish=${e.finishReason} ${secs(e.latencyMs)} tok=${turnTokens(t)} flags: ${fl.length ? red(fl.join(",")) : dim(e.legacy ? "n/a (legacy)" : "none")}`);
  } else if (!t.error) console.log(yellow("  end ? (turn without turn_end: in progress or aborted)"));
}

function graphLine(g: Ev) {
  const ms = typeof g.latencyMs === "number" ? secs(g.latencyMs as number) : "?";
  if (g.skipped) return dim(`  graph_extract ${g.turnId} skipped: ${g.skipped}`);
  const u = (g.usage as { totalTokens?: number } | undefined)?.totalTokens;
  const body = `+${g.nodesAdded ?? 0}n ~${g.nodesUpdated ?? 0}n +${g.edgesAdded ?? 0}e +${g.evidenceAdded ?? 0}ev ${ms} tok=${u ?? "?"}${g.manual ? " (manual)" : ""}`;
  return g.error ? red(`  graph_extract ${g.turnId} ERR ${one(g.error, 160)} ${ms}`) : `  graph_extract ${g.turnId} ${body}`;
}

const since = list[0]?.ts ?? "";
const clientIn = (ev: Ev, t: Turn | undefined, next: Turn | undefined) => ev.ts >= (t?.ts ?? since) && (!next || ev.ts < next.ts);
list.forEach((t, k) => {
  printTurn(t, total - list.length + k + 1);
  for (const g of graph.filter((x) => x.sessionId === sid && x.turnId === t.turnId)) console.log(graphLine(g));
  for (const ev of client.filter((x) => x.sessionId === sid && clientIn(x, t, list[k + 1]))) {
    console.log(dim(`  ~ client ${hhmmss(ev.ts)} ${ev.name} ${json(ev.data, 120)}`));
  }
});

const manual = graph.filter((x) => x.sessionId === sid && String(x.turnId).startsWith("gx_"));
if (manual.length) {
  console.log(`\n${bold("graph (manual re-extraction)")}`);
  for (const g of manual) console.log(graphLine(g));
}
