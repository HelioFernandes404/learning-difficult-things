import type { Messages } from "../en";

export const home: Messages["home"] = {
  newSession: "Nova sessão",
  noSessions: "Nenhuma sessão ainda. Crie uma com um tema.",
  deleteSession: "Apagar sessão",
  graph: "Grafo",
  settings: "Configurações",
  debug: "Debug / logs do LLM",
  logout: "Sair",
  setup: {
    title: "Antes de começar: configure sua IA",
    body: "Falta escolher o provedor e colar sua chave. Leva um minuto.",
    open: "Abrir Configurações",
  },
  error: { title: "Algo deu errado", retry: "Tentar de novo" },
};
