// ============================================================
// PONTE — não há implementação aqui.
//
// O cálculo das verbas vive em base44/shared/mathUtils.js, o MESMO arquivo que
// o backend usa para gerar a peça pelo webhook. Este arquivo era uma CÓPIA
// completa (664 linhas) que precisava ser editada à mão a cada correção — fuso
// horário, matriz de reflexos, verbas por hora, exclusão desvio/acúmulo,
// leitura de cláusula por extenso. Enquanto foram duas, o mesmo caso gerado
// pela tela e pelo webhook podia sair com números diferentes; foi exatamente
// o que aconteceu com o "valor pago por fora" em 08/2026.
//
// Os imports existentes (`from './mathUtils'`) continuam funcionando: este
// arquivo reexporta tudo. Para mudar qualquer regra de cálculo, edite
// base44/shared/mathUtils.js — e só ele.
// ============================================================
export * from '../../../../base44/shared/mathUtils.js';
