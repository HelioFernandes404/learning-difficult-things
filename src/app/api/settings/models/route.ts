import { getT } from "@/i18n/server";
import { z } from "zod";
import { PROVIDERS } from "@/lib/settings";
import { mergeConfig, needsKeyForOther } from "@/lib/settings-server";
import { requireJson } from "@/lib/security";

const body = z.object({ provider: z.enum(PROVIDERS), apiKey: z.string(), baseUrl: z.string() }).partial();

const RECOMMENDED = "gpt-6-luna";
const FALLBACK: Record<string, string[]> = {
  openai: [RECOMMENDED, "gpt-6", "gpt-5.5", "gpt-5-mini", "gpt-4.1", "gpt-4.1-mini", "o4-mini"],
  openrouter: ["openai/gpt-5-mini", "anthropic/claude-sonnet-4.5", "google/gemini-2.5-flash", "meta-llama/llama-3.3-70b-instruct"],
  ollama: ["llama3.1", "qwen2.5", "mistral", "gemma3"],
  custom: [],
};

export async function POST(req: Request) {
  const bad = requireJson(req);
  if (bad) return bad;
  const { t } = await getT();
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  const over = parsed.success ? parsed.data : {};
  if (needsKeyForOther(over)) return Response.json({ error: t.api.settings.otherKeyNeeded }, { status: 400 });
  const cfg = mergeConfig(over);
  const fallback = FALLBACK[cfg.provider] ?? [];
  try {
    const r = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/models`, {
      headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { data?: { id: string }[]; models?: { name: string }[] };
    let ids = (j.data?.map((m) => m.id) ?? j.models?.map((m) => m.name) ?? []).sort();
    if (!ids.length) throw new Error("empty");
    if (cfg.provider === "openai") ids = ids.filter((i) => /^(gpt|o\d|chatgpt)/.test(i) && !/embed|tts|whisper|image|audio|realtime|transcribe|moderation/.test(i));
    if (cfg.provider === "openai") ids = [RECOMMENDED, ...ids.filter((i) => i !== RECOMMENDED)];
    return Response.json({ models: ids, recommended: cfg.provider === "openai" ? RECOMMENDED : null, source: "api" });
  } catch {
    return Response.json({ models: fallback, recommended: cfg.provider === "openai" ? RECOMMENDED : null, source: "fallback" });
  }
}
