"use client";

import { Component, useEffect, type ReactNode } from "react";
import { track } from "@/lib/telemetry";
import { useT } from "@/i18n/client";

export function VisualCard({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="my-4 w-full max-w-full overflow-hidden rounded-xl border bg-card p-4 font-sans shadow-soft">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
        {title && <span className="font-serif text-base font-medium text-foreground">{title}</span>}
      </div>
      {children}
    </div>
  );
}

export function VisualSkeleton({ label }: { label: string }) {
  return (
    <VisualCard label={label}>
      <div className="animate-pulse space-y-2.5">
        <div className="h-3 w-1/3 rounded bg-muted" />
        <div className="h-24 w-full rounded-lg bg-muted" />
        <div className="h-3 w-2/3 rounded bg-muted" />
      </div>
    </VisualCard>
  );
}

export function VisualError({ label, message, raw, tool }: { label: string; message: string; raw: unknown; tool?: string }) {
  const t = useT();
  useEffect(() => {
    track("visual_error", { tool: tool ?? label, message: message.slice(0, 500) });
  }, [tool, label, message]);
  let json = "";
  try {
    json = JSON.stringify(raw, null, 2) ?? "";
  } catch {
    json = String(raw);
  }
  return (
    <VisualCard label={label}>
      <p className="text-sm text-destructive">{t.visuals.cannotShow} {message}</p>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">{t.visuals.rawData}</summary>
        <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-muted p-2 text-xs">{json}</pre>
      </details>
    </VisualCard>
  );
}

export class VisualBoundary extends Component<{ label: string; raw: unknown; tool?: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) return <VisualError label={this.props.label} tool={this.props.tool} message={this.state.error.message} raw={this.props.raw} />;
    return this.props.children;
  }
}
