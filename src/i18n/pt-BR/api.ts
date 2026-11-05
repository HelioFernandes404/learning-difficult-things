import type { Messages } from "../en";

export const api: Messages["api"] = {
  hostNotAllowed: "Host não permitido",
  originNotAllowed: "Origem não permitida",
  crossSite: "Requisição de outro site bloqueada",
  contentTypeJson: "Content-Type deve ser application/json",
  notAuthenticated: "Não autenticado",
  invalidData: "Dados inválidos",
  notFound: "Não encontrado",
  titleRequired: "O título é obrigatório",
  idRequired: "O id é obrigatório",
  checkFieldsRequired: "sessionId, question, answer e confidence são obrigatórios",
  mergeIdsRequired: "fromId e intoId são obrigatórios e precisam ser diferentes",
  goalRequired: "O objetivo é obrigatório",
  sessionNotFound: "Sessão não encontrada",
  titleExists: "Já existe um nó com esse título (use mesclar)",
  auth: {
    notConfigured: "Senha não configurada",
    tooManyAttempts: "Muitas tentativas. Espere um minuto.",
    wrongPassword: "Senha incorreta",
  },
  settings: {
    baseUrlScheme: "O endereço deve começar com http:// ou https://",
    otherKeyNeeded: "Informe a chave para testar outro endereço",
    pasteKeyFirst: "Cole sua chave da API primeiro",
    invalidKey: "Chave inválida",
    modelNotFound: "Modelo não encontrado",
    rateLimited: "Limite de uso ou saldo esgotado nesse provedor (429)",
    cannotConnect: "Não consegui conectar em {url}",
  },
};
