/**
 * petitionBuilder.js
 * Monta os dados fixos da petição por código (qualificação, contrato, cálculos, fecho).
 * O esqueleto estrutural da peça é SEMPRE o conteúdo do PetitionTemplate selecionado.
 * A IA preenche os slots dinâmicos dentro desse esqueleto.
 */

function fmt(v) { return v || "[A PREENCHER]"; }

function fmtMoney(v) {
  if (!v) return "[A PREENCHER]";
  return `R$ ${parseFloat(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  if (!d) return "[A PREENCHER]";
  try {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  } catch (_) { return d; }
}

function calcDuration(start, end) {
  if (!start) return "";
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} mês(es)`;
  return `${years} ano(s) e ${rem} mês(es)`;
}

function buildQualificacao(form, config) {
  const extra = (form.extra_defendants || []).map((d, i) =>
    `${i + 2}ª RECLAMADA: ${fmt(d.name)}, CNPJ ${fmt(d.cnpj)}, com endereço em ${fmt(d.address)};`
  ).join("\n");

  return `EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DO TRABALHO DA ${fmt(form.jurisdiction)}

${fmt(form.claimant_name)}, CPF ${fmt(form.claimant_cpf)}, residente e domiciliado(a) em ${fmt(form.claimant_address)}, por seu advogado que esta subscreve, vem respeitosamente à presença de Vossa Excelência propor

RECLAMAÇÃO TRABALHISTA

em face de

1ª RECLAMADA: ${fmt(form.defendant_name)}, CNPJ ${fmt(form.defendant_cnpj)}, com endereço em ${fmt(form.defendant_address)};${extra ? "\n" + extra : ""}

pelos fatos e fundamentos jurídicos a seguir expostos.`;
}

function buildContrato(form) {
  const vigente = !form.contract_end;
  const duracao = calcDuration(form.contract_start, form.contract_end);
  return `O(A) Reclamante foi admitido(a) em ${fmtDate(form.contract_start)}, exercendo a função de ${fmt(form.claimant_role)}, com salário mensal de ${fmtMoney(form.salary)}, jornada de trabalho ${fmt(form.work_schedule)}.
${vigente
    ? "O contrato de trabalho encontra-se vigente até a presente data."
    : `O contrato foi rescindido em ${fmtDate(form.contract_end)}, totalizando ${duracao} de vínculo empregatício.`}`;
}

function buildBeneficios(form) {
  const parts = [];
  if (form.free_justice) {
    parts.push(`O(A) Reclamante declara, para os fins do art. 790, §§ 3º e 4º da CLT e art. 99 do CPC, não possuir condições de arcar com as custas e despesas processuais sem prejuízo do sustento próprio e familiar, requerendo os benefícios da JUSTIÇA GRATUITA.`);
  }
  if (form.digital_court) {
    parts.push(`O(A) Reclamante concorda com a tramitação do processo pelo JUÍZO 100% DIGITAL, nos termos da Resolução CNJ nº 345/2020.`);
  }
  return parts.join("\n\n");
}

function buildCalculos(form) {
  const calc = form.calculations;
  if (!calc?.items?.length) {
    return `Os valores das verbas pleiteadas serão apurados em sede de liquidação de sentença.`;
  }
  const lines = calc.items.map((item) =>
    `- ${item.label}: ${fmtMoney(item.value)}`
  );
  const total = calc.total ? `\nTOTAL ESTIMADO: ${fmtMoney(calc.total)}` : "";
  return `Com base nos documentos e informações disponíveis, estima-se o seguinte:\n\n${lines.join("\n")}${total}`;
}

function buildValorCausa(form) {
  const calc = form.calculations;
  if (calc?.total) {
    return `Dá-se à presente causa o valor de ${fmtMoney(calc.total)}, correspondente ao total das verbas pleiteadas.`;
  }
  if (form.salary) {
    const estimado = parseFloat(form.salary) * 12;
    return `Dá-se à presente causa o valor de ${fmtMoney(estimado)}, estimado com base no salário mensal × 12, a ser atualizado em liquidação.`;
  }
  return `Dá-se à presente causa o valor de [A PREENCHER: valor da causa], a ser apurado em liquidação de sentença.`;
}

function buildFecho(form, config) {
  const cidade = config?.cidade_sede || fmt(form.jurisdiction?.split(" ").pop());
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const advogado = config?.advogado_principal || "[A PREENCHER: advogado]";
  const oab = config ? `OAB/${config.uf_oab || ""} ${config.oab}` : "[A PREENCHER: OAB]";

  return `Nestes termos,
Pede deferimento.

${cidade}, ${hoje}.

${advogado}
${oab}
${config?.email_contato ? config.email_contato : ""}
${config?.telefone ? config.telefone : ""}`.trim();
}

function buildRequerimentos(form, config) {
  const recs = [
    "a) a citação da(s) Reclamada(s) para, querendo, contestar a presente ação, sob pena de revelia e confissão;",
    "b) a produção de todos os meios de prova em direito admitidos, especialmente depoimento pessoal da(s) Reclamada(s), oitiva de testemunhas e juntada de documentos;",
    "c) a procedência integral dos pedidos formulados na presente reclamação trabalhista;",
    "d) a condenação da(s) Reclamada(s) ao pagamento das verbas indicadas no corpo desta peça, com correção monetária e juros de mora;",
    "e) a condenação da(s) Reclamada(s) ao pagamento de honorários advocatícios, nos termos do art. 791-A da CLT;",
  ];
  if (form.free_justice) {
    recs.push("f) a concessão dos benefícios da justiça gratuita, nos termos do art. 790 da CLT.");
  }
  return "Requer:\n\n" + recs.join("\n");
}

/**
 * Retorna os blocos de dados fixos da petição (gerados deterministicamente).
 */
export function buildPetitionTemplate(form, config) {
  return {
    qualificacao: buildQualificacao(form, config),
    contrato: buildContrato(form),
    beneficios: buildBeneficios(form),
    calculos: buildCalculos(form),
    requerimentos: buildRequerimentos(form, config),
    valor_causa: buildValorCausa(form),
    fecho: buildFecho(form, config),
  };
}

/**
 * Monta o prompt para a IA.
 * A IA recebe o esqueleto COMPLETO do modelo selecionado e deve:
 *  - Preservar TODAS as seções e tópicos na mesma ordem
 *  - Preencher apenas os slots dinâmicos com os dados do caso
 *  - Nunca remover ou pular nenhuma seção
 *  - Usar [PENDÊNCIA: descrição] quando faltar dado
 */
export function buildShortAIPrompt(form, config, templateContent) {
  const caseData = `DADOS DO CASO:
Reclamante: ${fmt(form.claimant_name)} | CPF: ${fmt(form.claimant_cpf)} | Endereço: ${fmt(form.claimant_address)}
Função: ${fmt(form.claimant_role)} | Salário: ${fmtMoney(form.salary)} | Jornada: ${fmt(form.work_schedule)}
Admissão: ${fmtDate(form.contract_start)} | Rescisão: ${form.contract_end ? fmtDate(form.contract_end) : "vigente"}
Reclamada: ${fmt(form.defendant_name)} | CNPJ: ${fmt(form.defendant_cnpj)} | Endereço: ${fmt(form.defendant_address)}
${(form.extra_defendants || []).map((d, i) => `Reclamada ${i + 2}: ${fmt(d.name)} | CNPJ: ${fmt(d.cnpj)}`).join("\n")}
Jurisdição: ${fmt(form.jurisdiction)}
Justiça gratuita: ${form.free_justice ? "Sim" : "Não"} | Juízo digital: ${form.digital_court ? "Sim" : "Não"}

IRREGULARIDADES RELATADAS PELO ADVOGADO:
${form.irregularities || "[A PREENCHER]"}

FATOS ADICIONAIS:
${form.additional_facts || "Nenhum"}`;

  const fmtCalc = (() => {
    const calc = form.calculations;
    if (!calc?.items?.length) return "Cálculos não informados — usar [PENDÊNCIA: valor].";
    const lines = calc.items.map(i => `  - ${i.label}: ${fmtMoney(i.value)}`).join("\n");
    const total = calc.total ? `\n  TOTAL: ${fmtMoney(calc.total)}` : "";
    return lines + total;
  })();

  const valorCausa = (() => {
    const calc = form.calculations;
    if (calc?.total) return fmtMoney(calc.total);
    if (form.salary) return fmtMoney(parseFloat(form.salary) * 12) + " (estimado)";
    return "[PENDÊNCIA: valor da causa]";
  })();

  const advogado = config?.advogado_principal || "[A PREENCHER: advogado]";
  const oab = config ? `OAB/${config.uf_oab || ""} ${config.oab}` : "[A PREENCHER: OAB]";
  const cidade = config?.cidade_sede || "[A PREENCHER: cidade]";
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  const contextualSlots = `DADOS FIXOS JÁ CALCULADOS (usar exatamente estes valores ao preencher o modelo):
- Qualificação do reclamante: ${fmt(form.claimant_name)}, CPF ${fmt(form.claimant_cpf)}, residente em ${fmt(form.claimant_address)}
- Qualificação da reclamada: ${fmt(form.defendant_name)}, CNPJ ${fmt(form.defendant_cnpj)}, endereço: ${fmt(form.defendant_address)}
- Contrato: admissão ${fmtDate(form.contract_start)}, ${form.contract_end ? "rescisão " + fmtDate(form.contract_end) : "contrato vigente"}, função ${fmt(form.claimant_role)}, salário ${fmtMoney(form.salary)}
- Verbas/cálculos:\n${fmtCalc}
- Valor da causa: ${valorCausa}
- Advogado: ${advogado} | ${oab}
- Cidade/data: ${cidade}, ${hoje}`;

  // Usa prompt_sistema do PetitionConfig se disponível, senão fallback padrão
  const baseSystemPrompt = config?.prompt_sistema?.trim()
    ? config.prompt_sistema.trim()
    : "Você é um advogado trabalhista brasileiro experiente.";

  if (!templateContent || templateContent.trim().length < 50) {
    // Fallback mínimo — sem modelo disponível
    return `${baseSystemPrompt}\n\nRedija uma petição inicial trabalhista completa usando APENAS os dados abaixo. Para qualquer dado ausente use [PENDÊNCIA: descrição].\n\n${caseData}\n\n${contextualSlots}`;
  }

  return `${baseSystemPrompt}

SUA TAREFA: Preencher o modelo de petição abaixo com os dados do caso.

REGRAS ABSOLUTAS — SIGA RIGOROSAMENTE:
1. PRESERVE a estrutura completa do modelo: cada seção, título, tópico e subtópico deve aparecer na saída, NA MESMA ORDEM.
2. NUNCA remova ou pule nenhuma seção do modelo, mesmo que falte dado para preenchê-la.
3. Para cada campo ou slot no modelo, substitua pelo dado real fornecido nos DADOS DO CASO.
4. Se faltar um dado para algum tópico, mantenha o tópico e insira [PENDÊNCIA: descrição do dado ausente].
5. NÃO invente fatos, datas, valores ou jurisprudência. Use apenas o que está nos DADOS DO CASO.
6. Fundamentos jurídicos: cite apenas dispositivos legais reais (CLT, CF, Súmulas TST, OJs). Não invente acórdãos ou súmulas.
7. Substitua todos os espaços em branco, campos genéricos e marcadores do modelo pelos dados reais.
8. O texto final deve ser formal e técnico, próprio de uma peça processual brasileira.

─────────────────────────────────────
MODELO SELECIONADO PELO ADVOGADO (esqueleto obrigatório — preserve todas as seções):
─────────────────────────────────────
${templateContent}
─────────────────────────────────────

${caseData}

${contextualSlots}

IMPORTANTE: Retorne APENAS o texto da petição preenchida, seguindo fielmente o esqueleto do modelo acima. Não adicione comentários, não altere a ordem das seções, não omita nenhum tópico.`;
}

/**
 * Monta o documento final quando há templateContent:
 * neste caso o resultado da IA já É o documento completo (ela preencheu o esqueleto).
 * Quando não há templateContent, usa o layout fallback padrão.
 */
export function assemblePetition(parts, aiResponse, templateContent) {
  // Se o modelo estava disponível, a IA já entregou o documento completo
  if (templateContent && templateContent.trim().length >= 50 && aiResponse) {
    return aiResponse.trim();
  }

  // Fallback: layout padrão quando não havia modelo
  let narrativa = "";
  let fundamentacao = "";
  if (aiResponse) {
    const split = aiResponse.split(/---FUNDAMENTACAO---/i);
    narrativa = split[0]?.trim() || "";
    fundamentacao = split[1]?.trim() || "";
  }

  return `${parts.qualificacao}

──────────────────────────────────────────────────────────────

I – DOS FATOS

${narrativa || "[A PREENCHER: narrativa dos fatos]"}

──────────────────────────────────────────────────────────────

II – DO CONTRATO DE TRABALHO

${parts.contrato}

──────────────────────────────────────────────────────────────

III – DO DIREITO

${fundamentacao || "[A PREENCHER: fundamentação jurídica]"}

──────────────────────────────────────────────────────────────

IV – DOS PEDIDOS

${parts.requerimentos}

──────────────────────────────────────────────────────────────

V – DOS CÁLCULOS

${parts.calculos}

──────────────────────────────────────────────────────────────

VI – DO VALOR DA CAUSA

${parts.valor_causa}

──────────────────────────────────────────────────────────────

${parts.beneficios ? `VII – DA JUSTIÇA GRATUITA / JUÍZO DIGITAL\n\n${parts.beneficios}\n\n──────────────────────────────────────────────────────────────\n\n` : ""}${parts.fecho}`;
}