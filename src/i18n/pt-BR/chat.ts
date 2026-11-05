import type { Messages } from "../en";

export const chat: Messages["chat"] = {
  send: "Enviar",
  placeholder: "Responda ao tutor... (Enter envia, Shift+Enter nova linha)",
  thinking: "Pensando...",
  conceptSaved: (title) => `Conceito salvo: ${title}`,
  mapUpdated: "Mapa atualizado",
  checkGraded: (verdict) => `Checagem avaliada: ${verdict}`,
  configureKeyBefore: "Configure sua chave em",
  configureKeyLink: "Configurações",
  configureKeyAfter: "para começar.",
  errorPrefix: "Erro:",
  imageAlt: (alt) => `[imagem: ${alt}]`,
  diagramInvalid: "Diagrama inválido",
  diagramRendering: "Renderizando...",
};
