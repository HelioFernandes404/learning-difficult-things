"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { startSessionFromGraph } from "@/lib/graph/client";
import { useLocale, useT } from "@/i18n/client";
import { MASTERY_COLOR, type GNodeDTO, type Mastery } from "./types";

type Link = { id: string; title: string; mastery: Mastery; type: string; direction?: string };
type Ev = { id: string; kind: string; verdict: string | null; confidence: number | null; text: string; ts: number; sessionTopic: string | null; question: string | null; answer: string | null };
type Detail = { node: GNodeDTO; prerequisites: Link[]; dependents: Link[]; relations: Link[]; evidence: Ev[]; notes: { id: string; title: string; content: string }[] };

export function NodeDrawer({ id, all, onClose, onSelect, onChanged }: { id: string; all: GNodeDTO[]; onClose: () => void; onSelect: (id: string) => void; onChanged: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [d, setD] = useState<Detail | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [mergeInto, setMergeInto] = useState("");

  const load = useCallback(() => fetch(`/api/graph/nodes/${id}`).then((r) => r.json()).then(setD), [id]);
  useEffect(() => {
    fetch(`/api/graph/nodes/${id}`).then((r) => r.json()).then(setD);
  }, [id]);

  if (!d) return <Shell onClose={onClose}><p className="text-sm text-muted-foreground">{t.graph.drawer.loading}</p></Shell>;
  const n = d.node;

  async function saveSummary() {
    await fetch(`/api/graph/nodes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary: editing }) });
    setEditing(null);
    load();
    onChanged();
  }
  async function remove() {
    if (!confirm(t.graph.drawer.deleteConfirm(n.title))) return;
    await fetch(`/api/graph/nodes/${id}`, { method: "DELETE" });
    onChanged();
    onClose();
  }
  async function merge() {
    if (!mergeInto || !confirm(t.graph.drawer.mergeConfirm(n.title))) return;
    await fetch("/api/graph/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromId: id, intoId: mergeInto }) });
    onChanged();
    onSelect(mergeInto);
    setMergeInto("");
  }
  const linkList = (title: string, items: Link[]) =>
    items.length > 0 && (
      <section className="space-y-1">
        <h4 className="text-xs font-medium text-muted-foreground uppercase">{title}</h4>
        <div className="flex flex-wrap gap-1.5">
          {items.map((l) => (
            <button key={`${l.id}${l.type}`} onClick={() => onSelect(l.id)} className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted" style={{ borderColor: MASTERY_COLOR[l.mastery] }}>
              {l.type !== "prerequisite" && <span className="text-muted-foreground">{t.graph.rel[l.type as keyof typeof t.graph.rel] ?? l.type}: </span>}
              {l.title}
            </button>
          ))}
        </div>
      </section>
    );

  return (
    <Shell onClose={onClose}>
      <div className="space-y-4">
        <div>
          <h3 className="font-serif text-xl font-medium">{n.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="outline">{t.graph.kind[n.kind]}</Badge>
            {n.domain && <Badge variant="secondary">{n.domain}</Badge>}
            <span style={{ color: MASTERY_COLOR[n.mastery] }} className="font-medium">{t.graph.mastery[n.mastery]}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" title={t.graph.drawer.score(n.masteryScore.toFixed(2))}>
            <div className="h-full rounded-full" style={{ width: `${Math.round(n.masteryScore * 100)}%`, background: MASTERY_COLOR[n.mastery === "unseen" ? "learning" : n.mastery] }} />
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{t.graph.drawer.score(n.masteryScore.toFixed(2))} · {t.graph.drawer.evidenceCount(n.evidenceCount)}{n.lastConfidence ? ` · ${t.graph.drawer.lastConfidence(n.lastConfidence)}` : ""}</div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={() => startSessionFromGraph({ title: n.title, domain: n.domain })}>{t.graph.drawer.teachThis}</Button>
          <Button size="sm" variant="outline" onClick={() => startSessionFromGraph({ title: n.title, domain: n.domain, mode: "practice" })}>{t.graph.drawer.practiceThis}</Button>
        </div>

        <section className="space-y-1">
          {editing === null ? (
            <p className="text-sm">{n.summary || <span className="text-muted-foreground">{t.graph.drawer.noSummary}</span>} <button className="text-xs text-primary underline" onClick={() => setEditing(n.summary)}>{t.graph.drawer.edit}</button></p>
          ) : (
            <div className="space-y-2">
              <Textarea rows={3} value={editing} onChange={(e) => setEditing(e.target.value)} />
              <div className="flex gap-2"><Button size="sm" onClick={saveSummary}>{t.graph.drawer.save}</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{t.graph.drawer.cancel}</Button></div>
            </div>
          )}
        </section>

        {linkList(t.graph.drawer.prerequisites, d.prerequisites)}
        {linkList(t.graph.drawer.dependents, d.dependents)}
        {linkList(t.graph.drawer.otherRelations, d.relations)}

        <section className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">{t.graph.drawer.evidence}</h4>
          {d.evidence.length === 0 && <p className="text-xs text-muted-foreground">{t.graph.drawer.noEvidence}</p>}
          {d.evidence.map((e) => (
            <div key={e.id} className="rounded-lg border bg-card p-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                <span className={e.kind === "misconception" ? "font-medium text-destructive" : "font-medium text-foreground"}>{t.graph.evidenceKind[e.kind] ?? e.kind}</span>
                {e.verdict && <span className={e.verdict === "correct" ? "text-success" : e.verdict === "wrong" ? "text-destructive" : "text-warning"}>{t.graph.verdict[e.verdict] ?? e.verdict}</span>}
                {e.confidence && <span>{t.graph.drawer.conf(e.confidence)}</span>}
                <span className="ml-auto">{new Date(e.ts).toLocaleDateString(locale)}{e.sessionTopic ? ` · ${e.sessionTopic.slice(0, 28)}` : ""}</span>
              </div>
              {e.question && <div className="mt-1 text-muted-foreground">{t.graph.drawer.question}: {e.question}</div>}
              {e.answer && <div className="text-muted-foreground">{t.graph.drawer.answer}: {e.answer}</div>}
              <div className="mt-1">{e.text}</div>
            </div>
          ))}
        </section>

        {d.notes.length > 0 && (
          <section className="space-y-1">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">{t.graph.drawer.notebook}</h4>
            {d.notes.map((c) => (
              <div key={c.id} className="rounded-lg border bg-card p-2 text-xs"><div className="font-medium">{c.title}</div><div className="line-clamp-4 text-muted-foreground">{c.content}</div></div>
            ))}
          </section>
        )}

        <section className="space-y-2 border-t pt-3">
          <div className="flex gap-2">
            <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-xs">
              <option value="">{t.graph.drawer.mergeInto}</option>
              {all.filter((x) => x.id !== id).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={!mergeInto} onClick={merge}>{t.graph.drawer.merge}</Button>
          </div>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}>{t.graph.drawer.deleteNode}</Button>
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const t = useT();
  return (
    <aside className="absolute top-0 right-0 z-10 flex h-full w-96 max-w-full flex-col border-l bg-surface shadow-soft">
      <div className="flex justify-end p-2"><Button size="icon-sm" variant="ghost" onClick={onClose} aria-label={t.graph.drawer.close}><X /></Button></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{children}</div>
    </aside>
  );
}
