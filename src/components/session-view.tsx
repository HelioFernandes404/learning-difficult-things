"use client";

import { useCallback, useEffect, useState } from "react";
import type { UIMessage } from "ai";
import { Chat } from "./chat";
import { SidePanel } from "./side-panel";
import { composeFirstMessage } from "@/lib/lesson-request";
import { isLocale, messages, type Locale } from "@/i18n";
import { useT } from "@/i18n/client";
import type { LessonStep } from "@/lib/schema";

type Loaded = { session: { id: string; topic: string; request?: string | null; context?: string | null; goal?: string | null; level?: string | null; locale?: string | null }; messages: UIMessage[]; lessonMap: LessonStep[] };

export function SessionView({ sessionId }: { sessionId: string }) {
  const t = useT();
  const [data, setData] = useState<Loaded | null>(null);
  const [lessonMap, setLessonMap] = useState<LessonStep[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => r.json())
      .then((d: Loaded) => {
        setData(d);
        setLessonMap(d.lessonMap);
      });
  }, [sessionId]);

  // Called when the chat state changes: reloads map, notebook and checks.
  const onActivity = useCallback(async () => {
    const d = (await (await fetch(`/api/sessions/${sessionId}`)).json()) as Loaded;
    setLessonMap(d.lessonMap);
    setRefreshKey((k) => k + 1);
  }, [sessionId]);

  if (!data) return <div className="p-4 text-sm text-muted-foreground">{t.common.loading}</div>;
  const locale: Locale = isLocale(data.session.locale) ? data.session.locale : "pt-BR";
  const firstMessage = data.session.request
    ? composeFirstMessage(data.session, locale)
    : `${messages(locale).lesson.iWantToLearn} ${data.session.topic}`;
  return (
    <div className="flex min-h-0 flex-1">
      <main className="min-w-0 flex-1">
        <Chat sessionId={sessionId} firstMessage={firstMessage} initialMessages={data.messages} onActivity={onActivity} />
      </main>
      <aside className="hidden w-96 shrink-0 border-l bg-surface lg:block">
        <SidePanel sessionId={sessionId} lessonMap={lessonMap} refreshKey={refreshKey} />
      </aside>
    </div>
  );
}
