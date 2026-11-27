// VALOR DOS PEDIDOS APÓS A ADI 6.002/STF (regra FAV v1.0, 27/11/2026).
//
// O STF (25/11/2026) manteve o art. 840, § 1º, da CLT: cada pedido com valor; o
// valor LIMITA a condenação, salvo estimativa JUSTIFICADA com elementos
// concretos nas hipóteses do art. 324, § 1º, do CPC. Daqui saem:
//   - classeDoItem: L (líquido, limita) / E (estimado justificado) / S;
//   - modulosEstimativa: a justificativa concreta de cada pedido E (seção III
//     do tópico "DO VALOR DOS PEDIDOS..."), com os parâmetros do cálculo;
//   - documentosExibicao: a lista da seção IV, ajustada aos pedidos do caso;
//   - tabelaLES / avisosAdi6002: a conferência para o advogado.
// Decisões do Luis (27/11/2026): acúmulo, desvio, gratificação e assiduidade
// são L; estabilidade é L (calculada); pensão vai para o advogado.

export const REMISSAO_E = ' (valor estimativo, justificado no tópico “DO VALOR DOS PEDIDOS, DA ESTIMATIVA JUSTIFICADA E DA NÃO LIMITAÇÃO DA CONDENAÇÃO”, seção III, não limitativo da condenação, nos termos do artigo 840, § 1º, da CLT, do artigo 324, § 1º, do CPC e da ADI 6.002 do STF)';

const RX_E = /^(Folgas trabalhadas|Reflexos de |Integração de valores por fora|Auxílio-alimentação nas folgas|Vale-transporte nas folgas|Horas extras|Intervalo intrajornada|Adicional noturno|10 minutos|Adicional de periculosidade|Adicional de insalubridade|Reflexo DSR)/i;
const RX_FORA = /^(Honorários|Duração do contrato)/i;

export function classeDoItem(rotulo = '') {
  if (RX_FORA.test(rotulo)) return null;
  return RX_E.test(rotulo) ? 'E' : 'L';
}

function memoria(calculos, rx) {
  const it = (calculos || []).find((c) => rx.test(String(c.item || '')) && !/^Reflexos/.test(String(c.item || '')));
  return it?.memoria ? String(it.memoria).replace(/\s+/g, ' ').trim() : '';
}

function params(calculos, rx, extra = '') {
  const m = memoria(calculos, rx);
  const base = m ? `Parâmetros da estimativa: ${m}` : 'Parâmetros da estimativa: os narrados na causa de pedir';
  return `${base}${extra}.`;
}

const DOC_PONTO = 'controles de jornada e espelhos de ponto';
const DOC_ESCALA = 'escalas de serviço e registros de convocação para plantões extras e dobras';
const DOC_HOLERITE = 'holerites, fichas financeiras e comprovantes de pagamento';
const DOC_COMPENSACAO = 'acordos de compensação, de prorrogação e de banco de horas, com os respectivos extratos';
const DOC_CCT = 'instrumentos coletivos que entenda aplicáveis';
const DOC_SST = 'PGR, PCMSO, LTCAT, PPP e fichas de entrega de EPI, com o respectivo certificado de aprovação';
const DOC_SAUDE = 'atestados de saúde ocupacional, prontuário médico e Comunicação de Acidente de Trabalho';
const DOC_TRANSF = 'comprovantes de transferência bancária e de pagamentos realizados fora da folha';

// d = dados do template (flags + VALOR_*); calculos = itens do mathUtils.
export function modulosEstimativa(d = {}, calculos = []) {
  const mods = [];
  const docs = new Set();
  const add = (titulo, texto, ds) => { mods.push({ MOD_TITULO: titulo, MOD_TEXTO: texto }); ds.forEach((x) => docs.add(x)); };

  const temHe = d.VALOR_HE_PRORROGACAO || d.VALOR_HE_12X36 || d.escala_12x36 || d.escala_4x2 || true;
  if (temHe) {
    add(
      d.escala_12x36 ? 'Horas extras e descaracterização da escala 12x36' : 'Horas extras',
      'A quantificação das horas extras não depende apenas da jornada narrada, mas de dados que somente os documentos da reclamada revelam: os dias efetivamente trabalhados em cada mês, descontadas faltas, férias e afastamentos; a quantidade de plantões extras, dobras e convocações em folgas; a extensão real da antecipação da entrada e da prorrogação da saída em cada jornada; a evolução da base de cálculo pelos reajustes normativos e pela integração das parcelas salariais, inclusive do adicional noturno (Orientação Jurisprudencial nº 97 da SDI-1 do C. TST); e os valores eventualmente pagos sob o mesmo título, que deverão ser abatidos, e nunca tratados como quitação (Orientação Jurisprudencial nº 415 da SDI-1 do C. TST). Esses dados constam dos controles de jornada, das escalas, dos registros de convocação, dos holerites e dos acordos de compensação e de banco de horas, com os respectivos extratos, todos em poder exclusivo da reclamada, o que atrai o artigo 324, § 1º, inciso III, do CPC. ' +
        params(calculos, d.VALOR_HE_12X36 ? /^Horas extras — descaracterização/ : /^Horas extras/),
      [DOC_PONTO, DOC_ESCALA, DOC_HOLERITE, DOC_COMPENSACAO],
    );
  }
  if (d.VALOR_ART71 || d.tem_intervalo_suprimido) {
    add('Intervalo intrajornada',
      'O valor do intervalo suprimido depende do número de dias de efetivo labor e da duração do intervalo efetivamente usufruído em cada jornada, dados registrados nos controles de jornada e nas escalas em poder da reclamada (artigo 324, § 1º, inciso III, do CPC), observado, para o período posterior a 11/11/2017, o artigo 71, § 4º, da CLT. ' +
        params(calculos, /^Intervalo intrajornada/),
      [DOC_PONTO, DOC_ESCALA]);
  }
  if (d.VALOR_NOTURNO || d.adicional_noturno) {
    add('Adicional noturno e prorrogação da jornada noturna',
      'A apuração exige identificar, jornada a jornada, as horas laboradas entre 22h e 5h e as horas de prorrogação, com a observância da hora noturna reduzida (artigo 73, § 1º, da CLT), o que somente os controles de jornada, as escalas e os holerites com as rubricas pagas, em poder da reclamada, permitem (artigo 324, § 1º, inciso III, do CPC). ' +
        params(calculos, /^Adicional noturno/),
      [DOC_PONTO, DOC_ESCALA, DOC_HOLERITE]);
  }
  if (d.dez_minutos_cct) {
    add('10 (dez) minutos de descanso previstos na norma coletiva',
      'O valor depende do número de horas efetivamente trabalhadas em cada jornada e dos dias de efetivo labor, registrados nos controles de jornada e nas escalas em poder da reclamada (artigo 324, § 1º, inciso III, do CPC). ' +
        params(calculos, /^10 minutos/),
      [DOC_PONTO, DOC_ESCALA, DOC_CCT]);
  }
  if (d.folgas_trabalhadas) {
    const vtAux = [d.vale_transporte && 'o vale-transporte', d.auxilio_alimentacao && 'o auxílio-alimentação'].filter(Boolean).join(' e ');
    add(`Labor em folgas e feriados${vtAux ? ` e ${vtAux.replace(/^o /, '').replace(' e o ', ' e ')} correspondentes` : ''}`,
      `A quantidade de folgas e feriados trabalhados indicada na causa de pedir é a média que o reclamante consegue reconstituir de memória e representa o mínimo da pretensão; o número exato consta das escalas, dos registros de ponto e das convocações internas, em poder da reclamada (artigo 324, § 1º, inciso III, do CPC)${vtAux ? `, e dele dependem também ${vtAux} devidos nesses dias` : ''}. ` +
        params(calculos, /^Folgas trabalhadas/),
      [DOC_PONTO, DOC_ESCALA, DOC_HOLERITE]);
  }
  if (d.VALOR_PERICULOSIDADE_HE) {
    add('Adicional de periculosidade sobre as horas extras',
      'O valor depende da quantidade de horas extras e de folgas efetivamente trabalhadas e da base de cálculo mês a mês, apuráveis pelos controles de jornada, pelas escalas e pelos holerites em poder da reclamada (artigo 324, § 1º, inciso III, do CPC). ' +
        params(calculos, /^Adicional de periculosidade/),
      [DOC_PONTO, DOC_ESCALA, DOC_HOLERITE]);
  }
  if (d.insalubridade) {
    add('Adicional de insalubridade',
      'A caracterização, o grau e o período da insalubridade dependem de perícia obrigatória (artigo 195, § 2º, da CLT) e da documentação de saúde e segurança do trabalho da reclamada, PGR, PCMSO, LTCAT, PPP e fichas de entrega de EPI com o certificado de aprovação, o que atrai o artigo 324, § 1º, incisos II e III, do CPC. A estimativa adota o grau e o período postulados. ' +
        params(calculos, /^Adicional de insalubridade/),
      [DOC_SST, DOC_HOLERITE]);
  }
  if (d.pensao_vitalicia) {
    add('Pensão mensal vitalícia',
      'O valor depende do grau de redução da capacidade laborativa, a ser fixado em perícia médica, e da documentação médica e de saúde ocupacional em poder da reclamada, o que atrai o artigo 324, § 1º, incisos II e III, do CPC. Parâmetros da estimativa: remuneração do reclamante e grau de redução postulado.',
      [DOC_SAUDE, DOC_SST]);
  }
  if (d.integracao_por_fora) {
    add('Valores pagos fora da folha de pagamento',
      'A integração depende do histórico completo de holerites, fichas financeiras e comprovantes de transferência, documentos em poder da reclamada que revelam a frequência e o montante dos pagamentos realizados à margem da folha (artigo 324, § 1º, inciso III, do CPC). ' +
        params(calculos, /^Integração de valores por fora/),
      [DOC_HOLERITE, DOC_TRANSF]);
  }
  if (!d.sem_multas_conv && d.tem_multas_conv !== false && d.VALOR_MULTAS_CONV) {
    add('Multas convencionais',
      'O valor depende do número de cláusulas descumpridas e da reiteração mês a mês, apuráveis pelos controles de jornada, pelos holerites e pelos documentos contratuais em poder da reclamada, observado o teto do instrumento coletivo (artigo 324, § 1º, inciso III, do CPC). Parâmetros da estimativa: os indicados no próprio pedido.',
      [DOC_PONTO, DOC_HOLERITE, DOC_CCT]);
  }
  if (mods.length) {
    add('Reflexos',
      'Os reflexos decorrem da média das parcelas principais acima e herdam a mesma impossibilidade de liquidação exata nesta fase, dependendo dos mesmos documentos. Parâmetros da estimativa: percentuais de reflexo discriminados em cada pedido do rol.',
      []);
  }
  if (d.doenca_ocupacional || d.acidente_trabalho) docs.add(DOC_SAUDE);
  const ordem = [DOC_PONTO, DOC_ESCALA, DOC_HOLERITE, DOC_COMPENSACAO, DOC_TRANSF, DOC_CCT, DOC_SST, DOC_SAUDE];
  const lista = ordem.filter((x) => docs.has(x));
  return { modulos: mods, documentos: lista.length ? lista.join('; ') : [DOC_PONTO, DOC_HOLERITE].join('; ') };
}

// Tabela L/E/S para o advogado (texto), a partir dos itens calculados.
export function tabelaLES(calculos = [], { pedidosSemValor = [], pedidosS = [] } = {}) {
  const L = [];
  const E = [];
  let total = 0;
  for (const c of calculos || []) {
    const cl = classeDoItem(c.item);
    if (!cl || c.valor == null) continue;
    const v = Number(c.valor) || 0;
    const linha = `${c.item}: R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${c.foraDaCausa ? ' (subsidiário, fora da causa)' : ''}`;
    (cl === 'E' ? E : L).push(linha);
    if (!c.foraDaCausa) total += v;
  }
  return { L, E, S: pedidosS, semValor: pedidosSemValor, total };
}

export function avisosAdi6002({ calculos = [], rito = '', pedidosSemValor = [], pedidosS = [] } = {}) {
  const t = tabelaLES(calculos, { pedidosSemValor, pedidosS });
  const brl = (n) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const out = [];
  out.push(`ADI 6.002, tabela de pedidos. L (líquido, o valor LIMITA a condenação): ${t.L.join('; ') || 'nenhum'}. E (estimado justificado, não limita): ${t.E.join('; ') || 'nenhum'}. S (sem conteúdo econômico): ${t.S.join('; ') || 'declaratórios e obrigações de fazer do rol'}. Soma calculada: ${brl(t.total)}. Estimativa mais vulnerável: horas extras (a defesa dirá que quem narra a jornada sabe calcular); conferir os parâmetros.`);
  if (t.semValor.length) out.push(`ADI 6.002: pedido(s) sem valor, PREENCHER antes de protocolar: ${t.semValor.join('; ')}.`);
  out.push('ADI 6.002, vigência: a regra vale para ações ajuizadas após a publicação da ata do julgamento (data ainda não conferida). Conferir a data; se a inicial puder ser distribuída antes, o protocolo imediato preserva o regime anterior. Conferir também e apagar a marca em VERMELHO do tópico "DO VALOR DOS PEDIDOS".');
  if (/suma/i.test(rito)) out.push('ADI 6.002, rito SUMARÍSSIMO: o art. 852-B da CLT exige pedido líquido; a justificativa ajuda, mas o risco de limitação ao valor indicado é maior.');
  return out;
}
