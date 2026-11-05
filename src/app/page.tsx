"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Plus, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { SessionView } from "@/components/session-view";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/i18n/client";
import { LessonStart, type StartData } from "@/components/lesson-start";

type SessionRow = { id: string; topic: string };

export default function Home() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(true);
  const router = useRouter();
  const t = useT();
  const [auth, setAuth] = useState(false);

  const load = useCallback(() => fetch("/api/sessions").then((r) => r.json()).then(setSessions), []);
  useEffect(() => {
    fetch("/api/sessions").then((r) => r.json()).then(setSessions);
    fetch("/api/settings").then((r) => (r.ok ? r.json() : null)).then((c) => {
      if (!c) return;
      setReady(!!c.ready);
      setAuth(!!c.authEnabled);
    }).catch(() => {});
    const sid = new URLSearchParams(window.location.search).get("session");
    if (sid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads ?session= on the client only
      setActiveId(sid);
      window.history.replaceState(null, "", "/");
    }
  }, []);

  async function create(data: StartData) {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const s = (await res.json()) as SessionRow;
    await load();
    setActiveId(s.id);
  }

  async function remove(id: string) {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (activeId === id) setActiveId(null);
    load();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    router.replace("/login");
  }

  return (
    <div className="flex h-screen bg-background">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="flex items-start gap-2 p-4 pb-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-xl font-semibold tracking-tight">{t.common.appName}</h1>
            <p className="text-xs text-muted-foreground">{t.common.tagline}</p>
          </div>
          <ThemeToggle />
        </div>
        <div className="px-3 pb-3">
          <Button className="w-full" onClick={() => setActiveId(null)}>
            <Plus /> {t.home.newSession}
          </Button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {sessions.length === 0 && <p className="p-2 text-xs text-muted-foreground">{t.home.noSessions}</p>}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-sidebar-accent/70 ${activeId === s.id ? "bg-sidebar-accent font-medium" : ""}`}
            >
              <button className="min-w-0 flex-1 truncate text-left" onClick={() => setActiveId(s.id)}>
                {s.topic}
              </button>
              <button className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" aria-label={t.home.deleteSession} onClick={() => remove(s.id)}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="border-t px-4 pt-3 pb-1"><LanguageSwitcher /></div>
        <Link href="/graph" className="p-4 pb-2 pt-2 text-sm text-foreground transition-colors hover:text-primary">
          {t.home.graph}
        </Link>
        <Link href="/settings" className="flex items-center gap-1.5 px-4 pb-2 text-sm text-foreground transition-colors hover:text-primary">
          <Settings className="size-4" /> {t.home.settings}
        </Link>
        <Link href="/debug" className={`px-4 text-xs text-muted-foreground transition-colors hover:text-foreground ${auth ? "pb-2" : "pb-4"}`}>
          {t.home.debug}
        </Link>
        {auth && (
          <button onClick={logout} className="flex items-center gap-1.5 px-4 pb-4 text-left text-xs text-muted-foreground transition-colors hover:text-foreground">
            <LogOut className="size-3.5" /> {t.home.logout}
          </button>
        )}
      </aside>
      {activeId ? (
        <SessionView key={activeId} sessionId={activeId} />
      ) : (
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          {!ready && (
            <div className="m-4 mb-0 rounded-2xl bg-primary/10 p-5 ring-1 ring-primary/40">
              <h2 className="font-serif text-lg font-semibold">{t.home.setup.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.home.setup.body}</p>
              <Link href="/settings" className="mt-3 inline-flex h-8 items-center rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-[#c6613f]">
                {t.home.setup.open}
              </Link>
            </div>
          )}
          <LessonStart onSubmit={create} />
        </div>
      )}
    </div>
  );
}
