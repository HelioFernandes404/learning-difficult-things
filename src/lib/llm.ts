import { createOpenAI } from "@ai-sdk/openai";
import { getLlmConfig, needsKey, type LlmConfig } from "@/lib/settings";

export class MissingKeyError extends Error {
  constructor() {
    super("Set your API key in Settings (/settings) before using the tutor.");
    this.name = "MissingKeyError";
  }
}

export function getModel(name?: string, cfg: LlmConfig = getLlmConfig()) {
  if (!cfg.apiKey && needsKey(cfg.provider)) throw new MissingKeyError();
  const provider = createOpenAI({ apiKey: cfg.apiKey || "ollama", baseURL: cfg.baseUrl });
  const id = name || cfg.model;
  // Only official OpenAI has the Responses API; the others use Chat Completions.
  return cfg.provider === "openai" ? provider(id) : provider.chat(id);
}

export const getGraphModel = (cfg: LlmConfig = getLlmConfig()) => getModel(cfg.graphModel, cfg);

/** Reasoning providerOptions. 'none' is only sent to OpenAI (which accepts it); omitted for the others. */
export function reasoningOptions(cfg: LlmConfig = getLlmConfig(), effort: string = cfg.reasoningEffort) {
  if (effort === "none" && cfg.provider !== "openai") return undefined;
  return { openai: { reasoningEffort: effort as "low" } };
}
