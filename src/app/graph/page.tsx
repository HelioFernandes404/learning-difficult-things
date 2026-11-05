"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { GraphCanvas } from "@/components/graph/canvas";
import { NodeDrawer } from "@/components/graph/node-drawer";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/i18n/client";
import { MASTERY_COLOR, pathSet, type GraphData, type Mastery } from "@/components/graph/types";
import { startSessionFromGraph } from "@/lib/graph/client";

const MASTERIES: Mastery[] = ["mastered", "learning", "misconception", "unseen"];
type Plan = { goalId: string; goal: string; matched: boolean; created: number; path: { id: string; title: string; mastery: string }[] };

export default function GraphPage() {
  return (
    <Suspense>
      <GraphView />
    </Suspense>
  );
}

function GraphView() {
  const t = useT();
  const sp = useSearchParams();
  const [data, setData] = useState<GraphData | null>(null);
  const [selected, setSelected] = useState<string | null>(sp.get("node"));
  const [domain, setDomain] = useState("");
  const [q, setQ] = useState("");
  const [on, setOn] = useState<Set<Mastery>>(new Set(MASTERIES));
  const [goal, setGoal] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sessions, setSessions] = useState<{ id: string; topic: string }[]>([]);
  const [reSession, setReSession] = useState("");
  const [reMsg, setReMsg] = useState("");

  const load = useCallback(() => fetch("/api/graph").then((r) => r.json()).then(setData), []);
  useEffect(() => {
    fetch("/api/graph").then((r) => r.json()).then(setData);
    fetch("/api/sessions").then((r) => r.json()).then(setSessions);
  }, []);

  const view = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    const nq = q.trim().toLowerCase();
    const nodes = data.nodes.filter(
      (n) => (!domain || n.domain === domain) && on.has(n.mastery) && (!nq || n.title.toLowerCase().includes(nq) || n.summary.toLowerCase().includes(nq)),
    );
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, edges: data.edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId)) };
  }, [data, domain, q, on]);

  const highlight = useMemo(() => (plan && data ? pathSet(plan.goalId, data.edges, data.nodes) : null), [plan, data]);
  const goalNode = plan && data?.nodes.find((n) => n.id === plan.goalId);

  async function submitGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!goal.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/graph/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? t.graph.planFailed);
      await load();
      setDomain("");
      setOn(new Set(MASTERIES));
      setPlan({ ...j, goal });
      setSelected(j.goalId);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  }

  const chain = plan?.path.filter((p) => p.mastery !== "mastered").map((p) => p.title) ?? [];
  async function reextract() {
    if (!reSession) return;
    setReMsg(t.graph.extracting);
    const r = await fetch("/api/graph/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: reSession }) });
    const j = await r.json();
    setReMsg(j.error ? t.graph.errorPrefix(j.error) : t.graph.extracted(j.nodesAdded, j.edgesAdded, j.evidenceAdded));
    load();
  }

  const s = data?.stats;
  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="space-y-2 border-b bg-sidebar px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {t.graph.sessions}</Link>
          <h1 className="font-serif text-xl font-semibold">{t.graph.title}</h1>
          {s && (
            <div className="ml-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {MASTERIES.map((m) => <span key={m}><span style={{ color: MASTERY_COLOR[m] }}>●</span> {s[m]} {t.graph.mastery[m]}</span>)}
              <span title={t.graph.calibrationTitle}>{t.graph.calibration(s.overconfident)}</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2"><LanguageSwitcher /><ThemeToggle /></div>
        </div>
        <form onSubmit={submitGoal} className="flex flex-wrap items-center gap-2">
          <Target className="size-4 text-primary" />
          <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={t.graph.goalPlaceholder} className="max-w-md min-w-60 flex-1" aria-label={t.graph.goalLabel} />
          <Button type="submit" size="sm" disabled={busy || !goal.trim()}>{busy ? t.graph.planning : t.graph.planBtn}</Button>
          {plan && goalNode && (
            <>
              <Button type="button" size="sm" variant="secondary" onClick={() => startSessionFromGraph({ title: plan.goal, domain: goalNode.domain, goal: plan.goal, plan: chain })}>{t.graph.teach}</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => startSessionFromGraph({ title: plan.goal, domain: goalNode.domain, goal: plan.goal, plan: chain, mode: "practice" })}>{t.graph.practice}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPlan(null)}>{t.graph.clear}</Button>
              <span className="text-xs text-muted-foreground">{plan.matched ? t.graph.existingNode : t.graph.newNodes(plan.created)} · {t.graph.nodesInPath(plan.path.length)}</span>
            </>
          )}
          {err && <span className="text-xs text-destructive">{err}</span>}
        </form>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select value={domain} onChange={(e) => setDomain(e.target.value)} className="h-8 rounded-lg border bg-background px-2" aria-label={t.graph.domain}>
            <option value="">{t.graph.allDomains}</option>
            {data?.domains.map((d) => <option key={d}>{d}</option>)}
          </select>
          {MASTERIES.map((m) => (
            <button
              key={m}
              onClick={() => setOn((p) => { const n = new Set(p); if (n.has(m)) n.delete(m); else n.add(m); return n; })}
              className={`rounded-full border px-2.5 py-1 transition-opacity ${on.has(m) ? "" : "opacity-40"}`}
              style={{ borderColor: MASTERY_COLOR[m] }}
            >{t.graph.mastery[m]}</button>
          ))}
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.graph.search} className="h-8 w-44" aria-label={t.graph.search} />
          <div className="ml-auto flex items-center gap-2">
            <select value={reSession} onChange={(e) => setReSession(e.target.value)} className="h-8 max-w-48 rounded-lg border bg-background px-2" aria-label={t.graph.session}>
              <option value="">{t.graph.reextractPick}</option>
              {sessions.map((x) => <option key={x.id} value={x.id}>{x.topic.slice(0, 40)}</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={!reSession} onClick={reextract}>{t.graph.reextract}</Button>
            {reMsg && <span className="text-muted-foreground">{reMsg}</span>}
          </div>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        {data && view.nodes.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{data.nodes.length ? t.graph.noMatch : t.graph.empty}</p>
        ) : (
          <GraphCanvas nodes={view.nodes} edges={view.edges} highlight={highlight} selectedId={selected} onSelect={setSelected} />
        )}
        {selected && data && <NodeDrawer key={selected} id={selected} all={data.nodes} onClose={() => setSelected(null)} onSelect={setSelected} onChanged={load} />}
      </div>
    </div>
  );
}
