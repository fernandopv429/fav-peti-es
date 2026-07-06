/**
 * validarPeticao — validação automática antes de marcar petição como concluída.
 *
 * Correção 5: valida endereçamento com Vara, modalidade de dispensa enquadrada,
 * reclamadas consistentes com a entrevista, e tópicos obrigatórios.
 * Se falhar, o status deve ser "revisao_necessaria" com a lista de pendências.
 *
 * Usado por:
 *  - VigilanteForm (handleGerarDocxIdêntico) — valida dados antes do DOCX
 *  - GerarDocumento (handleGerarVigilante) — valida texto gerado por IA
 *  - PorteiroForm — valida dados antes de enviar ao backend
 */

/**
 * Valida os DADOS estruturados do CasoVigilante antes da geração.
 * @param {object} dados — CasoVigilante (ou objeto de tokens)
 * @returns {{ valido: boolean, pendencias: string[] }}
 */
export function validarDadosPeticao(dados) {
  const pendencias = [];
  const d = dados || {};

  // 1. Endereçamento — COMARCA_UF e REGIAO_TRT preenchidos (Vara do Trabalho)
  if (!d.COMARCA_UF || !String(d.COMARCA_UF).trim()) {
    pendencias.push("Endereçamento: Vara do Trabalho (COMARCA_UF) não preenchida");
  }
  if (!d.REGIAO_TRT || !String(d.REGIAO_TRT).trim()) {
    pendencias.push("Endereçamento: Região do TRT (REGIAO_TRT) não preenchida");
  }

  // 2. Modalidade de dispensa enquadrada
  const temDispensa = d.tipo_dispensa || d.TIPO_RESCISAO ||
    d.t_dispensa || d.t_indireta || d.t_coacao || d.t_reversao;
  if (!temDispensa) {
    pendencias.push("Modalidade de dispensa não enquadrada (tipo_dispensa indefinido na entrevista)");
  }

  // 3. Acúmulo/desvio de função — se indicado na entrevista, flag deve estar ativa
  if (d.acumulo_funcao && !(d.tem_desvio || d.tem_acumulo)) {
    pendencias.push("Acúmulo/desvio de função indicado na entrevista mas flag não ativada — tópico e pedido P02 podem não ser gerados");
  }

  // 4. Dano moral — se há fatos/supervisor, flag deve estar ativa
  if ((d.DANO_FATOS || d.DANO_SUPERVISOR || d.dano_sem_estrutura) && !d.tem_dano_moral) {
    pendencias.push("Fatos de dano moral informados na entrevista mas flag tem_dano_moral não ativada — tópico pode não ser gerado");
  }

  return { valido: pendencias.length === 0, pendencias };
}

/**
 * Valida o TEXTO gerado por IA quanto a tópicos obrigatórios e consistência.
 * @param {string} texto — texto da petição gerada
 * @param {object} dados — CasoVigilante (para checagens contextuais)
 * @returns {{ valido: boolean, pendencias: string[] }}
 */
export function validarTextoPeticao(texto, dados) {
  const pendencias = [];
  const d = dados || {};
  const t = (texto || "").toUpperCase();

  // 1. Endereçamento à Vara do Trabalho
  if (!/VARA DO TRABALHO/i.test(t)) {
    pendencias.push("Endereçamento à Vara do Trabalho ausente no texto gerado");
  }

  // 2. Seções essenciais
  if (!/DOS PEDIDOS|DOS REQUERIMENTOS/i.test(t)) {
    pendencias.push("Seção de pedidos/requerimentos ausente");
  }
  if (!/VALOR DA CAUSA/i.test(t)) {
    pendencias.push("Seção de valor da causa ausente");
  }

  // 3. Responsabilidade subsidiária — se há 2ª reclamada, tópico deve existir
  if (d.RECL2_NOME || d.tem_subsidiaria || d.tem_2a_reclamada) {
    if (!/RESPONSABILIDADE SUBSIDI/i.test(t) && !/SÚMULA 331|SUMULA 331/i.test(t)) {
      pendencias.push("Tópico de responsabilidade subsidiária (Súmula 331 TST) ausente apesar de haver 2ª reclamada");
    }
  }

  // 4. Desvio/acúmulo de função — se indicado, tópico deve existir
  if (d.acumulo_funcao || d.tem_desvio || d.tem_acumulo) {
    if (!/DESVIO DE FUN|ACÚMULO DE FUN|ACUMULO DE FUN/i.test(t)) {
      pendencias.push("Tópico/pedido de desvio/acúmulo de função ausente apesar de indicado na entrevista");
    }
  }

  // 5. Dano moral — se há fatos, tópico deve existir com supervisor citado
  if (d.DANO_FATOS || d.DANO_SUPERVISOR || d.dano_sem_estrutura || d.tem_dano_moral) {
    if (!/DANO MORAL/i.test(t)) {
      pendencias.push("Tópico de dano moral ausente apesar de fatos informados na entrevista");
    }
    if (d.DANO_SUPERVISOR && String(d.DANO_SUPERVISOR).trim() &&
        !t.includes(String(d.DANO_SUPERVISOR).trim().toUpperCase())) {
      pendencias.push("Nome do superior hierárquico não citado no tópico de dano moral");
    }
  }

  // 6. Tokens não substituídos
  if (/\{\{[A-Z0-9_]+\}\}/.test(texto || "")) {
    pendencias.push("Tokens {{...}} não substituídos encontrados no texto");
  }

  // 7. Placeholders não preenchidos
  if (/\[A PREENCHER/i.test(texto || "")) {
    pendencias.push("Campos [A PREENCHER] encontrados — dados incompletos");
  }

  return { valido: pendencias.length === 0, pendencias };
}