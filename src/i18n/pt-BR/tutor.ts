import type { Messages } from "../en";

export const tutor: Messages["tutor"] = {
  exercisePrefix: "Exercício:",
  errors: {
    missingFields: "sessionId e messages são obrigatórios",
    sessionNotFound: "Sessão não encontrada",
    missingKey: "Configure sua chave em Configurações (/settings)",
    topicRequired: "topic ou request é obrigatório",
    notFound: "Não encontrado",
  },
  evalScenarios: {
    burnRate: "Burn rate em SRE",
    nodeCluster: "nó e cluster",
    nodeClusterRequest: "o que é nó e cluster? me explicaram que nó seria a máquina e cluster o conjunto de máquinas",
    vagueTopic: "burn rate",
    devops: "DevOps",
    sre: "SRE",
    stepErrorBudget: "Error budget",
    stepBurnWhat: "Burn rate: o que é",
    stepBurnCalc: "Calcular burn rate",
    stepBurnAlerts: "Alertas por burn rate",
    dAssistantText: "Burn rate mede a velocidade de consumo do error budget. Um SLO de 99,9% dá 0,1% de budget.",
    dQuestion: "Se o serviço falha o dobro do permitido, o budget dura mais ou menos tempo?",
    dAnswer: "Menos tempo, dura metade.",
    dFollowUp: "Entendi. Ensine como calcular.",
    eAssistantText: "Um burn rate de 14,4 consome 2% do budget em 1 hora. Por isso ele aciona o alerta rápido.",
    eQuestion: "Como o burn rate se relaciona com o alerta de 1 hora?",
    eAnswer: "Burn rate alto significa que o budget acaba rápido, então o alerta de 1 hora dispara quando passa de 14,4.",
  },
};
