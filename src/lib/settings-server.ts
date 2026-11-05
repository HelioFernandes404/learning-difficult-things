import { fmt, type Messages } from "@/i18n";
import { PRESET_URL, getLlmConfig, needsKey, type Effort, type LlmConfig, type Provider } from "@/lib/settings";

export function friendlyError(e: unknown, baseUrl: string, t: Messages): string {
  const err = e as { statusCode?: number; message?: string };
  const msg = String(err?.message ?? e);
  const st = err?.statusCode;
  if (st === 401 || st === 403 || /incorrect api key|invalid api key/i.test(msg)) return t.api.settings.invalidKey;
  if (st === 404 || /model.*(not found|does not exist)|not a valid model/i.test(msg)) return t.api.settings.modelNotFound;
  if (st === 429) return t.api.settings.rateLimited;
  if (st === undefined || /fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(msg)) return fmt(t.api.settings.cannotConnect, { url: baseUrl });
  return msg.slice(0, 200);
}

type Over = { provider?: Provider; apiKey?: string; baseUrl?: string; model?: string; reasoningEffort?: Effort };

const norm = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();

/**
 * Effective config + optional fields not yet saved.
 * The saved key ONLY applies to the same provider AND the same saved address: it never goes to a baseUrl coming from the request.
 */
export function mergeConfig(over: Over): LlmConfig {
  const saved = getLlmConfig();
  const provider = over.provider ?? saved.provider;
  const sameProvider = provider === saved.provider;
  const baseUrl = over.baseUrl || (sameProvider ? saved.baseUrl : provider === "custom" ? "" : PRESET_URL[provider]);
  const same = sameProvider && norm(baseUrl) === norm(saved.baseUrl);
  const apiKey = over.apiKey || (same ? saved.apiKey : "") || (provider === "ollama" ? "ollama" : "");
  return {
    ...saved,
    provider,
    baseUrl,
    apiKey,
    model: over.model || saved.model,
    reasoningEffort: over.reasoningEffort ?? saved.reasoningEffort,
  };
}

/** Different address/provider than the saved one with no key in the request: refuse (do not reuse the saved key). */
export function needsKeyForOther(over: Over): boolean {
  const saved = getLlmConfig();
  const provider = over.provider ?? saved.provider;
  if (!needsKey(provider) || over.apiKey) return false;
  const baseUrl = over.baseUrl || (provider === saved.provider ? saved.baseUrl : provider === "custom" ? "" : PRESET_URL[provider]);
  return provider !== saved.provider || norm(baseUrl) !== norm(saved.baseUrl);
}
