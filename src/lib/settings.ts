import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/schema";

export const PROVIDERS = ["openai", "openrouter", "ollama", "custom"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const EFFORTS = ["none", "low", "medium", "high"] as const;
export type Effort = (typeof EFFORTS)[number];

export const PRESET_URL: Record<Exclude<Provider, "custom">, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434/v1",
};
export const DEFAULT_MODEL = "gpt-6-luna";
export const SETTING_KEYS = ["provider", "apiKey", "baseUrl", "model", "reasoningEffort", "graphModel"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export type LlmConfig = {
  provider: Provider;
  apiKey: string;
  baseUrl: string;
  model: string;
  reasoningEffort: Effort;
  graphModel: string; // already resolved (empty => model)
  keySource: "db" | "env" | "none";
};

export function readDbSettings(): Partial<Record<SettingKey, string>> {
  const out: Partial<Record<SettingKey, string>> = {};
  for (const r of db.select().from(settings).all()) out[r.key as SettingKey] = r.value;
  return out;
}

export function writeSetting(key: SettingKey, value: string | null) {
  if (value === null) db.delete(settings).where(eq(settings.key, key)).run();
  else
    db.insert(settings)
      .values({ key, value, updatedAt: Date.now() })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: Date.now() } })
      .run();
  cache = null;
}

let cache: { at: number; cfg: LlmConfig } | null = null;

/** Effective config: DB wins; env is the fallback. 2s cache. */
export function getLlmConfig(): LlmConfig {
  if (cache && Date.now() - cache.at < 2000) return cache.cfg;
  const d = readDbSettings();
  const env = process.env;
  const envBase = env.OPENAI_BASE_URL || "";
  const provider: Provider = (PROVIDERS as readonly string[]).includes(d.provider ?? "")
    ? (d.provider as Provider)
    : envBase.includes("openrouter")
      ? "openrouter"
      : envBase.includes("11434")
        ? "ollama"
        : envBase
          ? "custom"
          : "openai";
  const baseUrl = (provider === "custom" ? d.baseUrl || envBase : d.baseUrl || (provider === "openai" && envBase ? envBase : PRESET_URL[provider])) || "";
  const model = d.model || env.LLM_MODEL || DEFAULT_MODEL;
  const eff = d.reasoningEffort || env.LLM_REASONING_EFFORT || "low";
  const reasoningEffort = ((EFFORTS as readonly string[]).includes(eff) ? eff : "low") as Effort;
  const keySource: LlmConfig["keySource"] = d.apiKey ? "db" : env.OPENAI_API_KEY ? "env" : "none";
  const apiKey = d.apiKey || env.OPENAI_API_KEY || (provider === "ollama" ? "ollama" : "");
  const cfg: LlmConfig = {
    provider,
    apiKey,
    baseUrl,
    model,
    reasoningEffort,
    graphModel: d.graphModel || env.GRAPH_MODEL || model,
    keySource,
  };
  cache = { at: Date.now(), cfg };
  return cfg;
}

export const needsKey = (p: Provider) => p !== "ollama";

export function keyHint(key: string): string {
  if (!key) return "";
  return `${key.startsWith("sk-") ? "sk-" : ""}…${key.slice(-4)}`;
}

/** Safe view (without the key) for the UI. */
export function publicConfig() {
  const d = readDbSettings();
  const c = getLlmConfig();
  const hasKey = c.keySource !== "none";
  return {
    provider: c.provider,
    baseUrl: c.baseUrl,
    model: c.model,
    reasoningEffort: c.reasoningEffort,
    graphModel: d.graphModel || process.env.GRAPH_MODEL || "",
    hasKey,
    ready: hasKey || !needsKey(c.provider),
    keyHint: hasKey && c.keySource !== "none" ? keyHint(d.apiKey || process.env.OPENAI_API_KEY || "") : "",
    keySource: c.keySource,
    authEnabled: !!process.env.APP_PASSWORD,
  };
}
