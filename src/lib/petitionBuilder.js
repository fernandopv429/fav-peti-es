/**
 * petitionBuilder.js
 * Monta o texto fixo da petição por código, sem IA.
 * A IA só preenche os slots: NARRATIVA_DOS_FATOS e FUNDAMENTACAO_ESPECIFICA.
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

/** Calcula anos/meses entre duas datas (string ISO) */
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

/**
 * Monta a qualificação das partes (texto fixo).
 */
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

/**
 * Monta os dados do contrato (texto fixo).
 */
function buildContrato(form) {
  const vigente = !form.contract_end;
  const duracao = calcDuration(form.contract_start, form.contract_end);
  return `O(A) Reclamante foi admitido(a) em ${fmtDate(form.contract_start)}, exercendo a função de ${fmt(form.claimant_role)}, com salário mensal de ${fmtMoney(form.salary)}, jornada de trabalho ${fmt(form.work_schedule)}.
${vigente
    ? "O contrato de trabalho encontra-se vigente até a presente data."
    : `O contrato foi rescindido em ${fmtDate(form.contract_end)}, totalizando ${duracao} de vínculo empregatício.`}`;
}

/**
 * Monta os pedidos de justiça gratuita / juízo digital (texto fixo).
 */
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

/**
 * Monta o bloco de cálculos (texto fixo a partir dos dados do form).
 */
function buildCalculos(form) {
  const calc = form.calculations;
  if (!calc?.items?.length) {
    return `Os valores das verbas pleiteadas serão apurados em sede de liquidação de sentença, uma vez que não foi possível apurar todos os dados necessários para o cálculo neste momento.`;
  }
  const lines = calc.items.map((item) =>
    `- ${item.label}: ${fmtMoney(item.value)}`
  );
  const total = calc.total ? `\nTOTAL ESTIMADO: ${fmtMoney(calc.total)}` : "";
  return `Com base nos documentos e informações disponíveis, estima-se o seguinte:\n\n${lines.join("\n")}${total}`;
}

/**
 * Monta o valor da causa (determinístico).
 */
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

/**
 * Monta o fecho / assinatura (texto fixo).
 */
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

/**
 * Monta os requerimentos padrão (texto fixo).
 */
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
 * Retorna o template completo com os slots para a IA.
 * Os slots são substituídos pelo backend após a chamada de IA.
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
 * Monta o prompt CURTO para a IA — apenas narrativa + fundamentação.
 */
export function buildShortAIPrompt(form, config, templateContent) {
  const systemBase = `Você é um advogado trabalhista brasileiro experiente. Sua tarefa é escrever APENAS dois trechos curtos de uma petição já estruturada:

1. NARRATIVA DOS FATOS: relato objetivo e cronológico dos fatos do caso, em 3 a 5 parágrafos. Use apenas os dados fornecidos. Não invente nada.
2. FUNDAMENTAÇÃO JURÍDICA: fundamentos legais e jurisprudenciais específicos para as irregularidades descritas, em 3 a 5 parágrafos. Cite apenas dispositivos legais reais (CLT, CF, Súmulas TST). Não invente jurisprudência.

REGRAS:
- Escreva APENAS esses dois trechos, separados pela linha "---FUNDAMENTACAO---"
- Não escreva qualificação das partes, requerimentos, fecho ou valor da causa — isso já está montado
- Para qualquer dado ausente use [A PREENCHER: descrição]
- Seja conciso: cada trecho deve ter no máximo 500 palavras`;

  const caseData = `
DADOS DO CASO:
Reclamante: ${fmt(form.claimant_name)} | Função: ${fmt(form.claimant_role)}
Reclamada: ${fmt(form.defendant_name)}
Admissão: ${fmtDate(form.contract_start)} | Rescisão: ${fmtDate(form.contract_end) || "vigente"}
Salário: ${fmtMoney(form.salary)} | Jornada: ${fmt(form.work_schedule)}

IRREGULARIDADES:
${form.irregularities || "[A PREENCHER]"}

FATOS ADICIONAIS:
${form.additional_facts || "Nenhum"}
${templateContent ? `\nESTRUTURA DO MODELO (referência para o estilo):\n${templateContent.slice(0, 800)}` : ""}`;

  return `${systemBase}\n\n${caseData}`;
}

/**
 * Monta o documento final combinando template + resposta da IA.
 */
export function assemblePetition(parts, aiResponse) {
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