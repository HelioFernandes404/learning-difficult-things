"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/i18n/client";

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (r.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? t.login.failed);
    } catch {
      setError(t.login.failed);
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-card p-6 ring-1 ring-border">
        <div>
          <h1 className="font-serif text-xl font-semibold tracking-tight">{t.common.appName}</h1>
          <p className="text-sm text-muted-foreground">{t.login.prompt}</p>
        </div>
        <Input type="password" autoFocus autoComplete="current-password" placeholder={t.login.password} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || !password}>
          {busy && <Loader2 className="animate-spin" />} {t.login.submit}
        </Button>
        <LanguageSwitcher />
      </form>
    </main>
  );
}
