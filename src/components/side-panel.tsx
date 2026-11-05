"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "./markdown";
import { GraphCanvas } from "./graph/canvas";
import type { GEdgeDTO, GNodeDTO } from "./graph/types";
import { useT } from "@/i18n/client";
import type { LessonStep } from "@/lib/schema";

type Concept = { id: string; sessionId: string | null; title: string; content: string; tags: string[]; source: "ai" | "user" };
type CheckRow = { id: string; question: string; answer: string; confidence: number; verdict: "correct" | "partial" | "wrong" | null; feedback: string | null };

const VERDICT_CLS = { correct: "text-success", partial: "text-warning", wrong: "text-destructive" } as const;

export function SidePanel({ sessionId, lessonMap, refreshKey }: { sessionId: string; lessonMap: LessonStep[]; refreshKey: number }) {
  const t = useT();
  return (
    <Tabs defaultValue="map" className="flex h-full min-h-0 flex-col gap-3 p-4">
      <TabsList variant="line" className="w-full border-b pb-0">
        <TabsTrigger value="map">{t.panel.tabs.map}</TabsTrigger>
        <TabsTrigger value="notebook">{t.panel.tabs.notebook}</TabsTrigger>
        <TabsTrigger value="checks">{t.panel.tabs.checks}</TabsTrigger>
        <TabsTrigger value="graph">{t.panel.tabs.graph}</TabsTrigger>
      </TabsList>
      <TabsContent value="map" className="min-h-0 overflow-y-auto">
        <MapTab steps={lessonMap} />
      </TabsContent>
      <TabsContent value="notebook" className="min-h-0 overflow-y-auto">
        <NotebookTab sessionId={sessionId} refreshKey={refreshKey} />
      </TabsContent>
      <TabsContent value="checks" className="min-h-0 overflow-y-auto">
        <ChecksTab sessionId={sessionId} refreshKey={refreshKey} />
      </TabsContent>
      <TabsContent value="graph" className="min-h-0 overflow-y-auto">
        <GraphTab sessionId={sessionId} refreshKey={refreshKey} />
      </TabsContent>
    </Tabs>
  );
}

function GraphTab({ sessionId, refreshKey }: { sessionId: string; refreshKey: number }) {
  const t = useT();
  const [g, setG] = useState<{ nodes: GNodeDTO[]; edges: GEdgeDTO[] } | null>(null);
  useEffect(() => {
    // Extraction runs after the turn: also reload a bit later.
    const load = () => fetch(`/api/graph?sessionId=${sessionId}`).then((r) => r.json()).then(setG);
    load();
    const t = setTimeout(load, 8000);
    return () => clearTimeout(t);
  }, [sessionId, refreshKey]);
  if (!g) return <p className="text-sm text-muted-foreground">{t.panel.loading}</p>;
  if (!g.nodes.length) return <p className="text-sm text-muted-foreground">{t.panel.graphEmpty}</p>;
  return (
    <div className="space-y-2">
      <div className="h-80 overflow-hidden rounded-xl border bg-card">
        <GraphCanvas nodes={g.nodes} edges={g.edges} compact onSelect={(id) => window.open(`/graph?node=${id}`, "_blank")} />
      </div>
      <p className="text-xs text-muted-foreground">{t.panel.graphNodes(g.nodes.length)}</p>
    </div>
  );
}

function MapTab({ steps }: { steps: LessonStep[] }) {
  const t = useT();
  if (!steps.length) return <p className="text-sm text-muted-foreground">{t.panel.mapEmpty}</p>;
  return (
    <ol className="relative">
      {steps.map((s, i) => (
        <li key={s.id} className="relative flex items-start gap-3 pb-5 last:pb-0">
          {i < steps.length - 1 && <span className={`absolute top-6 left-[9px] h-[calc(100%-1.5rem)] w-px ${s.status === "done" ? "bg-success/50" : "bg-border"}`} />}
          <span className="relative z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center">
            {s.status === "done" ? (
              <span className="flex size-5 items-center justify-center rounded-full bg-success text-white"><Check className="size-3" strokeWidth={3} /></span>
            ) : s.status === "current" ? (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary/20"><span className="size-2.5 rounded-full bg-primary" /></span>
            ) : (
              <span className="size-4 rounded-full border-2 border-border bg-surface" />
            )}
          </span>
          <span className={`text-sm leading-snug ${s.status === "todo" ? "text-muted-foreground" : ""} ${s.status === "current" ? "font-medium text-foreground" : ""}`}>{s.title}</span>
        </li>
      ))}
    </ol>
  );
}

function NotebookTab({ sessionId, refreshKey }: { sessionId: string; refreshKey: number }) {
  const t = useT();
  const [all, setAll] = useState<Concept[]>([]);
  const [scope, setScope] = useState<"session" | "all">("session");
  const [editing, setEditing] = useState<{ id?: string; title: string; content: string } | null>(null);

  const load = useCallback(() => fetch("/api/concepts").then((r) => r.json()).then(setAll), []);
  useEffect(() => {
    fetch("/api/concepts").then((r) => r.json()).then(setAll);
  }, [refreshKey]);

  async function save() {
    if (!editing?.title.trim()) return;
    await fetch("/api/concepts", {
      method: editing.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editing, sessionId }),
    });
    setEditing(null);
    load();
  }
  async function remove(id: string) {
    await fetch(`/api/concepts?id=${id}`, { method: "DELETE" });
    load();
  }

  const list = scope === "session" ? all.filter((c) => c.sessionId === sessionId) : all;
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant={scope === "session" ? "default" : "outline"} onClick={() => setScope("session")}>{t.panel.thisSession}</Button>
        <Button size="sm" variant={scope === "all" ? "default" : "outline"} onClick={() => setScope("all")}>{t.panel.all}</Button>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setEditing({ title: "", content: "" })}>{t.panel.addNote}</Button>
      </div>
      {editing && (
        <div className="space-y-2 rounded-xl border bg-card p-3">
          <Input placeholder={t.panel.titlePlaceholder} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          <Textarea placeholder={t.panel.contentPlaceholder} rows={5} value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>{t.panel.save}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{t.panel.cancel}</Button>
          </div>
        </div>
      )}
      {list.length === 0 && !editing && <p className="text-sm text-muted-foreground">{t.panel.noNotes}</p>}
      {list.map((c) => (
        <div key={c.id} className="space-y-1 rounded-xl border bg-card p-3">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium">{c.title}</span>
            <Badge variant="outline" className="ml-1">{c.source === "ai" ? t.panel.sourceAi : t.panel.sourceUser}</Badge>
            <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label={t.panel.edit} onClick={() => setEditing({ id: c.id, title: c.title, content: c.content })}><Pencil /></Button>
            <Button size="icon-sm" variant="ghost" aria-label={t.panel.delete} onClick={() => remove(c.id)}><Trash2 /></Button>
          </div>
          <Markdown>{c.content}</Markdown>
          {c.tags.length > 0 && <div className="flex flex-wrap gap-1">{c.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>}
        </div>
      ))}
    </div>
  );
}

function ChecksTab({ sessionId, refreshKey }: { sessionId: string; refreshKey: number }) {
  const t = useT();
  const [rows, setRows] = useState<CheckRow[]>([]);
  useEffect(() => {
    fetch(`/api/checks?sessionId=${sessionId}`).then((r) => r.json()).then(setRows);
  }, [sessionId, refreshKey]);

  const graded = rows.filter((r) => r.verdict);
  const hi = graded.filter((r) => r.confidence >= 4);
  const hiRight = hi.filter((r) => r.verdict === "correct").length;
  const lo = graded.filter((r) => r.confidence <= 2);
  const loRight = lo.filter((r) => r.verdict === "correct").length;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">
        <div className="mb-1 font-medium text-foreground">{t.panel.calibration}</div>
        {graded.length === 0 ? t.panel.noData : (
          <>
            <div>{t.panel.highConfidence(hiRight, hi.length)}</div>
            <div>{t.panel.lowConfidence(loRight, lo.length)}</div>
            <div>{t.panel.totalGraded(graded.length)}</div>
          </>
        )}
      </div>
      {rows.map((r) => (
        <div key={r.id} className="space-y-1 rounded-xl border bg-card p-3 text-sm">
          <div className="font-medium">{r.question}</div>
          <div className="text-muted-foreground whitespace-pre-wrap">{r.answer}</div>
          <div className="flex items-center gap-2 text-xs">
            <span>{t.panel.confidenceN(r.confidence)}</span>
            <span className={r.verdict ? VERDICT_CLS[r.verdict] : "text-muted-foreground"}>{r.verdict ? t.panel.verdict[r.verdict] : t.panel.verdict.pending}</span>
          </div>
          {r.feedback && <div className="text-xs italic text-muted-foreground">{r.feedback}</div>}
        </div>
      ))}
    </div>
  );
}
