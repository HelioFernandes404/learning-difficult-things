"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useT } from "@/i18n/client";
import { FLAG_SEVERITY, type Flag } from "@/lib/tutor/audit";
import { turnTokens, type Ev, type SessionStat, type Turn } from "@/lib/trace";

type SessionRow = { id: string; topic: string; updatedAt: number; inDb: boolean; stat: SessionStat | null };
type AuditRow = { id: string; ts: number; sessionId: string; turnId: string | null; kind: string; payload: Record<string, unknown> };
type Detail = { turns: Turn[]; client: Ev[]; audit: AuditRow[] };

const secs = (ms?: number) => (ms == null ? "?" : `${(ms / 1000).toFixed(1)}s`);
const hhmmss = (ts: string) => ts.slice(11, 19);

function FlagBadge({ flag }: { flag: string }) {
  const high = FLAG_SEVERITY[flag as Flag] === "high";
  return (
    <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + (high ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning")}>
      {flag}
    </span>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: "primary" }) {
  return (
    <span className={"rounded-full border px-2 py-0.5 text-xs " + (tone === "primary" ? "border-primary/40 bg-primary/10 text-primary" : "bg-surface text-muted-foreground")}>
      {children}
    </span>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-mono text-muted-foreground">{label}</summary>
      <pre className="mt-1 max-h-72 overflow-auto rounded-lg border bg-surface p-2 font-mono text-xs whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function TurnCard({ t, idx }: { t: Turn; idx: number }) {
  const m = useT().debug;
  const i = t.start?.input;
  const flags = t.end?.flags ?? [];
  return (
    <div className={"space-y-3 rounded-2xl border bg-card p-4 shadow-soft " + (flags.length ? "border-l-4 border-l-destructive" : "")}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-serif text-base font-semibold text-foreground">{m.turn(idx)}</span>
        <span className="font-mono">{t.turnId}</span>
        <span>{hhmmss(t.ts)}</span>
        {t.start && (
          <>
            <Pill>{t.start.model}</Pill>
            <Pill>{m.effort} {t.start.effort}</Pill>
            <Pill>sys {t.start.systemHash}</Pill>
          </>
        )}
        <span className="ml-auto flex flex-wrap gap-1">{flags.map((f) => <FlagBadge key={f} flag={f} />)}</span>
      </div>

      {i && (
        <div className="rounded-xl bg-user-bubble p-3 text-sm">
          <div className="mb-1 flex items-center gap-2">
            <Pill tone="primary">{i.kind}</Pill>
            {i.confidence != null && <Pill>{m.confidence(i.confidence)}</Pill>}
            {i.checkId && <span className="font-mono text-xs text-muted-foreground">{i.checkId.slice(0, 8)}</span>}
            {i.choice && <Pill>{i.choice}</Pill>}
          </div>
          <div className="whitespace-pre-wrap">{i.answer ?? i.text}</div>
        </div>
      )}

      <div className="space-y-2">
        {t.steps.map((s) => (
          <div key={s.stepIndex} className="space-y-1.5 rounded-xl border bg-surface/60 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{m.step(s.stepIndex)}</span>
              <Pill>{s.guard ? `guard: ${s.guard.toolChoice}` : "guard: -"}</Pill>
              <span>{secs(s.stepLatencyMs)}</span>
              <span>{s.usage?.totalTokens ?? "?"} tok</span>
              {!!s.usage?.reasoningTokens && <span>{m.reasoningTokens(s.usage.reasoningTokens)}</span>}
              <span>{s.finishReason}</span>
            </div>
            {s.text?.trim() ? (
              <div className="font-serif text-[0.9375rem] leading-relaxed whitespace-pre-wrap">{s.text}</div>
            ) : (
              <div className="text-xs text-muted-foreground italic">{m.noText}</div>
            )}
            {s.reasoningText && <Json label={m.reasoning} value={s.reasoningText} />}
            {(s.toolCalls ?? []).map((c, k) => (
              <Json key={k} label={m.call(c.name)} value={c.input} />
            ))}
            {(s.toolResults ?? []).map((r, k) => (
              <Json key={k} label={m.result(r.name)} value={r.output} />
            ))}
          </div>
        ))}
      </div>

      {t.writes.map((w, k) => (
        <div key={k} className="text-xs text-muted-foreground">
          <span className={"font-mono " + (w.refused ? "text-destructive" : "text-primary")}>db {w.op}{w.refused ? ` ${m.refused}` : ""}</span> {String(w.summary ?? "")}
        </div>
      ))}
      {t.error && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {String(t.error.error)}
          {!!t.error.stack && <Json label="stack" value={t.error.stack} />}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
        {t.end ? (
          <>
            <Pill tone="primary">{m.end}: {t.end.endedWith ?? (t.end.legacy ? m.legacy : "?")}</Pill>
            <span>{t.end.finishReason}</span>
            <span>{secs(t.end.latencyMs)}</span>
            <span>{turnTokens(t)} tok</span>
            <span>
              in {t.end.totalUsage?.inputTokens ?? "?"} / out {t.end.totalUsage?.outputTokens ?? "?"}
            </span>
          </>
        ) : (
          !t.error && <span>{m.noTurnEnd}</span>
        )}
      </div>
    </div>
  );
}

export default function DebugPage() {
  const m = useT().debug;
  const locale = useLocale();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<"turns" | "audit">("turns");
  const [onlyFlags, setOnlyFlags] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetch("/api/debug/sessions")
      .then((r) => r.json())
      .then((rows: SessionRow[]) => {
        setSessions(rows);
        setSel((cur) => cur ?? rows[0]?.id ?? null);
      });
  }, [tick]);

  useEffect(() => {
    if (!sel) return;
    fetch(`/api/debug/session/${sel}`)
      .then((r) => r.json())
      .then(setDetail);
  }, [sel, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const totals = useMemo(() => {
    const turns = detail?.turns ?? [];
    const flagCounts: Record<string, number> = {};
    for (const t of turns) for (const f of t.end?.flags ?? []) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
    const lat = turns.filter((t) => t.end?.latencyMs).map((t) => t.end!.latencyMs!);
    return {
      turns: turns.length,
      tokens: turns.reduce((a, t) => a + turnTokens(t), 0),
      avg: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0,
      flagCounts,
    };
  }, [detail]);

  const shown = (detail?.turns ?? []).map((t, i) => ({ t, i: i + 1 })).filter(({ t }) => !onlyFlags || t.end?.flags?.length || t.error);

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center gap-4 border-b px-5 py-3">
        <h1 className="font-serif text-xl font-semibold">Debug</h1>
        <button className="text-sm text-primary underline underline-offset-4" onClick={refresh}>{m.refresh}</button>
        <Link href="/" className="ml-auto text-sm text-primary underline underline-offset-4">{m.back}</Link>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 overflow-y-auto border-r bg-surface/50 p-3">
          <div className="mb-2 px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{m.sessions}</div>
          {sessions.length === 0 && <p className="px-1 text-sm text-muted-foreground">{m.noSessions}</p>}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setSel(s.id)}
              className={"mb-1.5 w-full rounded-xl border p-2.5 text-left text-sm transition-colors " + (sel === s.id ? "border-primary bg-primary/10" : "bg-card hover:border-primary/50")}
            >
              <div className="truncate font-medium">{s.topic}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="font-mono">{s.id.slice(0, 8)}</span>
                {s.stat ? <span>{m.turnsShort(s.stat.turns, s.stat.tokens)}</span> : <span>{m.noLogs}</span>}
                {!!s.stat?.flags && <span className="font-medium text-destructive">{m.flagsCount(s.stat.flags)}</span>}
                {!!s.stat?.errors && <span className="font-medium text-destructive">{m.errorsCount(s.stat.errors)}</span>}
              </div>
            </button>
          ))}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-5">
          {!sel || !detail ? (
            <p className="text-sm text-muted-foreground">{m.selectSession}</p>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 text-sm">
                <span>{m.turnsCount(totals.turns)}</span>
                <span>{m.tokensCount(totals.tokens)}</span>
                <span>{m.avgLatency} <b>{secs(totals.avg)}</b></span>
                <span className="ml-auto flex flex-wrap gap-1">
                  {Object.entries(totals.flagCounts).map(([f, n]) => (
                    <span key={f} className="inline-flex items-center gap-1"><FlagBadge flag={f} /><span className="text-xs text-muted-foreground">x{n}</span></span>
                  ))}
                  {Object.keys(totals.flagCounts).length === 0 && <span className="text-xs text-muted-foreground">{m.noFlags}</span>}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {(["turns", "audit"] as const).map((k) => (
                  <button key={k} onClick={() => setTab(k)} className={"rounded-full border px-3 py-1 text-sm " + (tab === k ? "border-primary bg-primary/10 text-primary" : "bg-card text-muted-foreground")}>
                    {k === "turns" ? m.tabTurns : m.tabAudit(detail.audit.length)}
                  </button>
                ))}
                {tab === "turns" && (
                  <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={onlyFlags} onChange={(e) => setOnlyFlags(e.target.checked)} /> {m.onlyFlags}
                  </label>
                )}
              </div>

              {tab === "turns" ? (
                <div className="space-y-4">
                  {shown.length === 0 && <p className="text-sm text-muted-foreground">{m.noTurns}</p>}
                  {shown.map(({ t, i }) => <TurnCard key={t.turnId} t={t} idx={i} />)}
                  {detail.client.length > 0 && (
                    <details className="rounded-xl border bg-card p-3 text-sm">
                      <summary className="cursor-pointer">{m.clientEvents(detail.client.length)}</summary>
                      <ul className="mt-2 space-y-0.5 font-mono text-xs text-muted-foreground">
                        {detail.client.map((e, k) => (
                          <li key={k} className={e.name === "visual_error" || e.name === "render_error" ? "text-destructive" : ""}>
                            {hhmmss(e.ts)} {String(e.name)} {JSON.stringify(e.data)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border bg-card">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-surface text-muted-foreground">
                      <tr><th className="p-2">{m.colTime}</th><th className="p-2">{m.colTurn}</th><th className="p-2">{m.colKind}</th><th className="p-2">{m.colPayload}</th></tr>
                    </thead>
                    <tbody>
                      {detail.audit.length === 0 && <tr><td colSpan={4} className="p-3 text-muted-foreground">{m.noRecords}</td></tr>}
                      {detail.audit.map((a) => (
                        <tr key={a.id} className="border-b align-top last:border-0">
                          <td className="p-2 whitespace-nowrap">{new Date(a.ts).toLocaleTimeString(locale)}</td>
                          <td className="p-2 font-mono">{a.turnId}</td>
                          <td className="p-2">{a.kind === "flag" ? <FlagBadge flag={String(a.payload.flag)} /> : <span className={a.kind.endsWith("_refused") ? "text-destructive" : ""}>{a.kind}</span>}</td>
                          <td className="p-2"><Json label={String(a.payload.summary ?? a.payload.flag ?? "payload")} value={a.payload} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
