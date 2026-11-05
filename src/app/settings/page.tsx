"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, Eye, EyeOff, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/i18n/client";

type Provider = "openai" | "openrouter" | "ollama" | "custom";
type Effort = "none" | "low" | "medium" | "high";
type Pub = {
  provider: Provider;
  baseUrl: string;
  model: string;
  reasoningEffort: Effort;
  graphModel: string;
  hasKey: boolean;
  ready: boolean;
  keyHint: string;
  keySource: "db" | "env" | "none";
};
type TestResult = { ok: boolean; latencyMs: number; model: string; error?: string };

const PRESET: Record<Exclude<Provider, "custom">, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434/v1",
};
const PROVIDER_IDS: Provider[] = ["openai", "openrouter", "ollama", "custom"];
const EFFORT_IDS: Effort[] = ["none", "low", "medium", "high"];
const RECOMMENDED = "gpt-6-luna";

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <h2 className="font-serif text-lg font-semibold">
        <span className="mr-2 text-primary">{n}.</span>
        {title}
      </h2>
      {hint && <p className="mt-0.5 mb-3 text-sm text-muted-foreground">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

function Combobox({ value, onChange, options, recommended, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; recommended?: string | null; placeholder?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const q = value.trim().toLowerCase();
  const list = options.filter((o) => !q || o.toLowerCase().includes(q)).slice(0, 80);
  return (
    <div ref={ref} className="relative">
      <Input value={value} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(e) => (onChange(e.target.value), setOpen(true))} />
      <ChevronDown className="pointer-events-none absolute top-2.5 right-3 size-4 text-muted-foreground" />
      {open && list.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl bg-popover p-1 text-sm shadow-lg ring-1 ring-foreground/10">
          {list.map((o) => (
            <li key={o}>
              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-muted" onClick={() => (onChange(o), setOpen(false))}>
                <span className="min-w-0 flex-1 truncate">{o}</span>
                {o === recommended && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{t.settings.recommendedCheapest}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const t = useT();
  const router = useRouter();
  const [cur, setCur] = useState<Pub | null>(null);
  const [provider, setProvider] = useState<Provider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState<Effort>("low");
  const [graphModel, setGraphModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [recommended, setRecommended] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsNote, setModelsNote] = useState("");
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const wasReady = useRef(true);

  const apply = useCallback((p: Pub) => {
    setCur(p);
    setProvider(p.provider);
    setBaseUrl(p.baseUrl);
    setModel(p.model);
    setEffort(p.reasoningEffort);
    setGraphModel(p.graphModel);
    setApiKey("");
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 403 ? t.settings.forbidden : t.settings.loadError))))
      .then((p: Pub) => {
        wasReady.current = p.ready;
        apply(p);
      })
      .catch((e: Error) => setError(e.message));
  }, [apply, t]);

  const effBase = provider === "custom" ? baseUrl : advanced && baseUrl ? baseUrl : PRESET[provider];
  const draft = () => ({ provider, apiKey: apiKey || undefined, baseUrl: effBase, model, reasoningEffort: effort });

  function pickProvider(p: Provider) {
    setProvider(p);
    setBaseUrl(p === "custom" ? (cur?.provider === "custom" ? cur.baseUrl : "") : PRESET[p]);
    setModels([]);
    setTest(null);
    setModelsNote("");
    if (p === "ollama" && (model === RECOMMENDED || !model)) setModel("llama3.1");
    if (p === "openai" && !model) setModel(RECOMMENDED);
  }

  async function loadModels() {
    setLoadingModels(true);
    setModelsNote("");
    try {
      const r = await fetch("/api/settings/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, baseUrl: effBase, apiKey: apiKey || undefined }) });
      const j = (await r.json()) as { models: string[]; recommended: string | null; source: string; error?: string };
      if (!r.ok) {
        setModelsNote(j.error ?? t.settings.modelsLoadFailed);
        setLoadingModels(false);
        return;
      }
      setModels(j.models);
      setRecommended(j.recommended);
      setModelsNote(j.source === "api" ? t.settings.modelsFound(j.models.length) : t.settings.modelsFallback);
    } catch {
      setModelsNote(t.settings.modelsLoadFailed);
    }
    setLoadingModels(false);
  }

  async function runTest(): Promise<TestResult> {
    setTesting(true);
    setTest(null);
    let res: TestResult;
    try {
      const r = await fetch("/api/settings/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft()) });
      res = await r.json();
    } catch {
      res = { ok: false, latencyMs: 0, model, error: t.settings.testFailed };
    }
    setTest(res);
    setTesting(false);
    return res;
  }

  async function save() {
    setSaving(true);
    setError("");
    const r = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft(), baseUrl: effBase, graphModel }),
    });
    const j = await r.json();
    setSaving(false);
    if (!r.ok) return setError(j.error ?? t.settings.saveError);
    apply(j as Pub);
    setToast(t.settings.saved);
    setTimeout(() => setToast(""), 3000);
    if (!wasReady.current && (j as Pub).ready) {
      const res = await runTest();
      if (res.ok) router.push("/");
    }
  }

  async function clearKey() {
    const r = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clearKey: true }) });
    if (r.ok) {
      const p = (await r.json()) as Pub;
      setCur(p);
      setToast(t.settings.keyRemoved);
      setTimeout(() => setToast(""), 3000);
    }
  }

  if (error && !cur) return <div className="p-8 text-sm text-destructive">{error}</div>;
  if (!cur) return <div className="p-8 text-sm text-muted-foreground">{t.settings.loading}</div>;

  const needsKey = provider !== "ollama";
  const effortOk = provider === "openai" || provider === "openrouter" || provider === "custom";
  const hint = cur.hasKey && cur.provider === provider ? (cur.keySource === "db" ? t.settings.keyConfiguredDb(cur.keyHint) : t.settings.keyConfiguredEnv(cur.keyHint)) : "";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {t.settings.back}
        </Link>
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">{t.settings.title}</h1>
          <LanguageSwitcher />
        </div>
        <p className="text-sm text-muted-foreground">{t.settings.intro}</p>

        <Section n={1} title={t.settings.providerSection}>
          <div className="grid gap-2 sm:grid-cols-2">
            {PROVIDER_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => pickProvider(id)}
                className={`rounded-xl p-3 text-left ring-1 transition-colors ${provider === id ? "bg-primary/10 ring-2 ring-primary" : "ring-foreground/10 hover:bg-muted"}`}
              >
                <div className="text-sm font-medium">{t.settings.providers[id].name}</div>
                <div className="text-xs text-muted-foreground">{t.settings.providers[id].desc}</div>
              </button>
            ))}
          </div>
        </Section>

        <Section n={2} title={t.settings.keySection} hint={needsKey ? t.settings.keyHint : undefined}>
          {needsKey ? (
            <div className="space-y-2">
              <div className="relative">
                <Input type={showKey ? "text" : "password"} autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={hint ? t.settings.keyKeepPlaceholder : t.settings.keyPastePlaceholder} className="pr-10" />
                <button type="button" aria-label={showKey ? t.settings.hide : t.settings.show} className="absolute top-2 right-3 text-muted-foreground hover:text-foreground" onClick={() => setShowKey((v) => !v)}>
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {hint ? <span className="text-success">{hint}</span> : <span className="text-muted-foreground">{t.settings.noKey}</span>}
                {cur.keySource === "db" && cur.provider === provider && (
                  <Button variant="ghost" size="sm" onClick={clearKey}>
                    {t.settings.removeKey}
                  </Button>
                )}
                {provider !== "custom" && (
                  <a className="text-primary underline-offset-4 hover:underline" target="_blank" rel="noreferrer" href={provider === "openai" ? "https://platform.openai.com/api-keys" : "https://openrouter.ai/keys"}>
                    {t.settings.whereKey}
                  </a>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t.settings.ollamaNoKey} <b>ollama.com</b> {t.settings.ollamaThenRun} <code className="rounded bg-muted px-1">ollama pull {t.settings.ollamaModelPlaceholder}</code> {t.settings.ollamaInTerminal} ({t.settings.ollamaExample} <code className="rounded bg-muted px-1">ollama pull llama3.1</code>).
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{t.settings.keyStoredNote}</p>
        </Section>

        {(provider === "custom" || advanced) && (
          <Section n={3} title={t.settings.baseUrlSection} hint={t.settings.baseUrlHint}>
            <Input value={provider === "custom" ? baseUrl : baseUrl || PRESET[provider]} onChange={(e) => setBaseUrl(e.target.value)} placeholder={t.settings.baseUrlPlaceholder} />
          </Section>
        )}
        {provider !== "custom" && (
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setAdvanced((v) => !v)}>
            {advanced ? t.settings.advancedHide : t.settings.advancedShow}
          </button>
        )}

        <Section n={4} title={t.settings.modelSection} hint={t.settings.modelHint}>
          <Combobox value={model} onChange={setModel} options={models} recommended={recommended} placeholder={provider === "openai" ? RECOMMENDED : t.settings.modelPlaceholder} />
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <Button variant="outline" size="sm" onClick={loadModels} disabled={loadingModels}>
              {loadingModels && <Loader2 className="animate-spin" />} {t.settings.loadModels}
            </Button>
            {model === RECOMMENDED && provider === "openai" && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{t.settings.recommendedCheapest}</span>}
            {modelsNote && <span className="text-xs text-muted-foreground">{modelsNote}</span>}
          </div>
        </Section>

        <Section n={5} title={t.settings.effortSection} hint={t.settings.effortHint}>
          <div className={`inline-flex flex-wrap gap-1 rounded-xl bg-muted p-1 ${effortOk ? "" : "pointer-events-none opacity-50"}`}>
            {EFFORT_IDS.map((id) => (
              <button key={id} type="button" onClick={() => setEffort(id)} className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${effort === id ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {t.settings.efforts[id]}
              </button>
            ))}
          </div>
          {!effortOk && <p className="mt-2 text-xs text-muted-foreground">{t.settings.effortLocalNote}</p>}
          {effortOk && provider !== "openai" && effort !== "none" && <p className="mt-2 text-xs text-muted-foreground">{t.settings.effortUnsupportedNote}</p>}
        </Section>

        <Section n={6} title={t.settings.graphSection} hint={t.settings.graphHint}>
          <Combobox value={graphModel} onChange={setGraphModel} options={models} placeholder={t.settings.graphPlaceholder} />
        </Section>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center gap-3 pb-10">
          <Button variant="outline" onClick={runTest} disabled={testing}>
            {testing && <Loader2 className="animate-spin" />} {t.settings.testConnection}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />} {t.settings.save}
          </Button>
          {test &&
            (test.ok ? (
              <span className="inline-flex items-center gap-1 text-sm text-success">
                <Check className="size-4" /> {t.settings.testOk((test.latencyMs / 1000).toFixed(1))}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm text-destructive">
                <X className="size-4" /> {test.error}
              </span>
            ))}
        </div>
      </div>
      {toast && <div className="fixed right-4 bottom-4 rounded-xl bg-foreground px-4 py-2 text-sm text-background shadow-lg">{toast}</div>}
    </div>
  );
}
