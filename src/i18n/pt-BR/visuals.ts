import type { Messages } from "../en";

export const visuals: Messages["visuals"] = {
  labels: {
    show_chart: "Gráfico",
    show_simulator: "Simulador",
    show_formula: "Fórmula",
    show_comparison: "Comparação",
    show_steps: "Passos",
  },
  cannotShow: "Não foi possível exibir este visual.",
  rawData: "Dados brutos",
  noPoints: "Sem pontos.",
  undefinedNumber: "indefinido",
  errorLabel: "Erro:",
  sim: {
    tooLong: "Expressão muito longa",
    badSymbols: "Expressão contém símbolos não permitidos",
    unknownVariable: (id) => `Variável desconhecida: ${id}`,
    notNumeric: "Resultado não numérico",
    invalidId: (id) => `Id inválido: ${id}`,
    duplicateId: (id) => `Id duplicado: ${id}`,
    invalidRange: (id) => `Faixa inválida em ${id}`,
    unknownXInput: "chart.xInput desconhecido",
    unknownYOutput: "chart.yOutput desconhecido",
  },
};
