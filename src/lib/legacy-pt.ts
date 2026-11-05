/**
 * LEGACY PORTUGUESE (allowed exception to the English-only rule).
 * Data written by older versions (stored values, message prefixes) and Portuguese
 * stop-words for the bilingual heuristics live here, and only here.
 */

/** Old stored `sessions.level` values -> stable level keys. */
export const LEGACY_LEVELS: Record<string, string> = {
  "Nunca vi": "never_seen",
  "Já ouvi falar": "heard_of",
  "Uso, mas sem profundidade": "use_shallow",
  "Quero aprofundar": "go_deeper",
};

/** Prefixes that older sessions used in the first message. */
export const LEGACY_LEARN_PREFIX = /^quero aprender:?\s*/i;
export const LEGACY_PRACTICE_PREFIX = /^praticar:/i;

/** Portuguese part of the "user asked to stop" heuristic (audit.ts ended_text_only). */
export const STOP_WORDS_PT = "encerr\\w*|parar|chega\\w*|tchau";
/** Portuguese part of the "confidence mentioned as a number" heuristic (audit.ts). */
export const CONFIDENCE_NUMBER_PT = "confian[çc]a";
/** Portuguese exercise prefix (old sessions + pt-BR locale). */
export const EXERCISE_PREFIX_PT = "Exercício:";
/** Portuguese exercise prefix, normalized (lowercase, no accents) for question matching. */
export const EXERCISE_PREFIX_PT_NORMALIZED = "exercicio";
/** Portuguese stop-words ignored when comparing graph node titles (graph/normalize.ts). */
export const GRAPH_STOP_WORDS_PT = ["de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "no", "na", "um", "uma", "para", "por", "com"];
