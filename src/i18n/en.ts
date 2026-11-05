import { common } from "./en/common";
import { home } from "./en/home";
import { lesson } from "./en/lesson";
import { chat } from "./en/chat";
import { cards } from "./en/cards";
import { panel } from "./en/panel";
import { visuals } from "./en/visuals";
import { login } from "./en/login";
import { settings } from "./en/settings";
import { graph } from "./en/graph";
import { debug } from "./en/debug";
import { tutor } from "./en/tutor";
import { api } from "./en/api";

/** Source of truth for UI strings. Values are strings or (args) => string functions; keep every key in pt-BR.ts too. */
export const en = { common, home, lesson, chat, cards, panel, visuals, login, settings, graph, debug, tutor, api };

export type Messages = typeof en;
