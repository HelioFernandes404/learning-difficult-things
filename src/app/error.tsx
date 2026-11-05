"use client";

import { useEffect } from "react";
import { track } from "@/lib/telemetry";
import { useT } from "@/i18n/client";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    track("render_error", { message: error.message, stack: error.stack?.slice(0, 1500), digest: error.digest });
  }, [error]);
  return (
    <div className="mx-auto max-w-md space-y-3 p-8 text-center">
      <h2 className="font-serif text-xl font-semibold">{t.home.error.title}</h2>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <button className="text-sm text-primary underline underline-offset-4" onClick={reset}>
        {t.home.error.retry}
      </button>
    </div>
  );
}
