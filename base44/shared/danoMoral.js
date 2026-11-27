// DANO MORAL — lista "o reclamante teve os seguintes direitos lesados" (27/11/2026).
//
// Capítulo novo do escritório (modelo v49): o texto é fixo e o meio é uma lista
// com um item por direito lesado. Itens genéricos (jornada, intervalo, noturno,
// FGTS, verbas rescisórias...) saem daqui, determinísticos. Os que dependem dos
// fatos do caso (acúmulo, desvio, insalubridade, folgas, doença/acidente,
// humilhação, assalto...) a IA escreve com os detalhes da entrevista
// (BLOCO_DANO_MORAL, um item por linha "- "); sem IA, entra a frase-base.

const fem = (caso) => String(caso?.recl_genero || '').toUpperCase() === 'F';
const g = (caso, m, f) => (fem(caso) ? f : m);

function limpar(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().replace(/[\s.;,:]+$/, '');
}

// Teses cujo item depende dos fatos: a IA escreve; base = reserva.
export function tesesFatoDanoMoral(d = {}, caso = {}) {
  const out = [];
  const atvAcumulo = limpar(caso.acumulo_atividades).toLowerCase();
  if (d.acumulo_funcao) {
    out.push({ tese: 'acúmulo de função', base: `${g(caso, 'Foi compelido', 'Foi compelida')} a acumular, sem qualquer contraprestação, ${atvAcumulo ? `as atividades de ${atvAcumulo}` : 'funções alheias à contratada'}` });
  }
  if (d.desvio_funcao) {
    const atv = limpar(caso.desvio_atividades).toLowerCase();
    out.push({ tese: 'desvio de função', base: `Exerceu, de forma habitual, ${atv ? `as atividades de ${atv}` : 'funções diversas daquela para a qual foi contratad' + g(caso, 'o', 'a')}, sem a correspondente remuneração` });
  }
  if (d.gratificacao_funcao) {
    out.push({ tese: 'gratificação de função', base: 'Exerceu função que dá direito à gratificação prevista na norma coletiva, sem jamais recebê-la' });
  }
  if (d.insalubridade) {
    out.push({ tese: 'insalubridade', base: `Trabalhou ${g(caso, 'exposto', 'exposta')} a agentes insalubres, sem equipamentos de proteção suficientes e sem jamais receber o adicional de insalubridade` });
  }
  if (d.folgas_trabalhadas) {
    const porFora = d.integracao_por_fora || caso.tem_integracao_por_fora;
    out.push({ tese: 'folgas trabalhadas', base: `Trabalhou habitualmente em seus dias de folga${porFora ? ', recebendo por fora, sem integração ao salário' : ' sem o pagamento em dobro'}` });
  } else if (d.integracao_por_fora || caso.tem_integracao_por_fora) {
    out.push({ tese: 'pagamento por fora', base: 'Recebeu parte da remuneração por fora, sem integração ao salário e sem os recolhimentos devidos' });
  }
  if (d.acidente_trabalho) {
    out.push({ tese: 'acidente de trabalho', base: `Sofreu acidente de trabalho${caso.doenca_descricao ? ` (${limpar(caso.doenca_descricao).replace(/^[A-ZÀ-Ý](?=[a-zà-ÿ])/, (c) => c.toLowerCase())})` : ''}` });
  } else if (d.doenca_ocupacional) {
    out.push({ tese: 'doença ocupacional', base: `${g(caso, 'Foi acometido', 'Foi acometida')} de doença relacionada ao trabalho${caso.doenca_descricao ? ` (${limpar(caso.doenca_descricao).replace(/^[A-ZÀ-Ý](?=[a-zà-ÿ])/, (c) => c.toLowerCase())})` : ''}` });
  }
  return out;
}

// Itens fixos (não dependem de detalhes da entrevista).
function itensFixosInicio(d, caso, { jornada, escala } = {}) {
  const out = [];
  const j = limpar(jornada);
  const e = limpar(escala);
  const jOk = j && !/^\[|A PREENCHER/i.test(j) && j.length <= 80;
  const eOk = e && !/^\[|A PREENCHER/i.test(e) && e.length <= 40;
  out.push(`${g(caso, 'Foi obrigado', 'Foi obrigada')} a cumprir jornada extraordinária habitual durante todo o pacto contratual${jOk ? `, das ${j}` : ''}${eOk ? `, em escala ${e}` : ''}, sem a correspondente contraprestação`);
  if (d.escala_12x36) out.push('Teve a escala 12x36 descaracterizada pela prestação habitual de horas extras');
  out.push('Jamais usufruiu do intervalo para refeição e descanso de 1 (uma) hora, dispondo de apenas 10 (dez) a 15 (quinze) minutos para se alimentar');
  if (d.adicional_noturno) out.push('Laborou habitualmente em período noturno sem o pagamento correto do adicional noturno e sem a observância da hora noturna reduzida');
  if (d.dez_minutos_cct) out.push('Não usufruiu dos 10 (dez) minutos de descanso previstos na norma coletiva');
  return out;
}

function itensFixosFim(d, caso) {
  const out = [];
  if (d.periculosidade) out.push('Não teve o adicional de periculosidade integrado ao cálculo das horas extras');
  if (d.vale_transporte || d.auxilio_alimentacao) out.push(`Não recebeu ${[d.vale_transporte && 'vale-transporte', d.auxilio_alimentacao && 'auxílio-alimentação'].filter(Boolean).join(' e ')} nos dias de folga trabalhados`);
  if (d.assiduidade) out.push('Não recebeu integralmente a bonificação de assiduidade prometida');
  if (d.salarios_em_aberto) out.push('Teve salários pagos com atraso ou não pagos');
  if (d.desconto_indevido || caso.tem_desconto_indevido) out.push('Sofreu descontos indevidos em sua remuneração');
  if (d.tem_ferias_vencidas) out.push('Não usufruiu nem recebeu as férias vencidas');
  out.push('Teve o FGTS recolhido de forma incorreta');
  out.push('Não recebeu corretamente as verbas rescisórias');
  return out;
}

// Texto da IA -> lista de itens ("- item" por linha).
export function itensDaIA(texto) {
  const linhas = String(texto || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // Só linhas com marcador: o bloco antigo (prosa em parágrafos, até o v48)
  // não vira lista e cai na reserva determinística.
  const marcadas = linhas.filter((l) => /^[-•*–]\s+/.test(l));
  if (!marcadas.length) return [];
  return marcadas.map((l) => limpar(l.replace(/^[-•*–]\s+/, ''))).filter((l) => l.length >= 10)
    .map((l) => l[0].toUpperCase() + l.slice(1));
}

// Lista final: fixos do início + fatos (IA ou reserva) + fixos do fim,
// cada item em ";" e o último em ".".
export function itensDanoMoral(d = {}, caso = {}, { blocoIA = '', jornada = '', escala = '' } = {}) {
  const daIA = itensDaIA(blocoIA);
  const fatos = daIA.length ? daIA : [
    ...tesesFatoDanoMoral(d, caso).map((t) => t.base),
    ...(() => {
      // Na reversão de justa causa o relato costuma ser a história da dispensa:
      // não entra (a peça não narra o motivo; ônus da empresa).
      if (d.reversao_justa_causa || caso.tipo_dispensa === 'reversao_justa_causa') return [];
      const raw = limpar(caso.dano_fatos || caso.dano_supervisor);
      return raw.length >= 40 && raw.length <= 400 ? [raw[0].toUpperCase() + raw.slice(1)] : [];
    })(),
  ];
  const todos = [...itensFixosInicio(d, caso, { jornada, escala }), ...fatos, ...itensFixosFim(d, caso)];
  const vistos = new Set();
  const unicos = todos.filter((t) => { const k = t.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; });
  return unicos.map((t, i) => `${limpar(t)}${i === unicos.length - 1 ? '.' : ';'}`);
}

// Frase da saúde no par. "Os fatos acima elencados...".
export function fraseSaudeDanoMoral(d = {}, caso = {}) {
  const partes = [];
  if (d.insalubridade) {
    partes.push(` A exposição habitual a agentes nocivos sem o fornecimento de equipamentos de proteção suficientes atingiu diretamente a saúde e a integridade física ${g(caso, 'do reclamante', 'da reclamante')}, bens jurídicos expressamente tutelados pelo artigo 223-C da CLT e pelo artigo 7º, inciso XXII, da Constituição Federal.`);
  }
  if (d.acidente_trabalho || d.doenca_ocupacional) {
    const qual = d.acidente_trabalho ? 'O acidente de trabalho sofrido' : 'A doença ocupacional adquirida';
    partes.push(d.insalubridade
      ? ` ${qual} ofendeu esses mesmos bens jurídicos.`
      : ` ${qual} atingiu diretamente a saúde e a integridade física ${g(caso, 'do reclamante', 'da reclamante')}, bens jurídicos expressamente tutelados pelo artigo 223-C da CLT e pelo artigo 7º, inciso XXII, da Constituição Federal.`);
  }
  return partes.join('');
}

// Complemento do par. da jornada: ", em jornada que se encerrava na madrugada,".
export function complementoJornadaDanoMoral(d = {}, jornada = '') {
  const horas = [...String(jornada || '').matchAll(/(\d{1,2})(?::|h)(\d{2})?/g)].map((m) => Number(m[1]) + Number(m[2] || 0) / 60);
  if (horas.length >= 2) {
    const ini = horas[0];
    const fim = horas[horas.length - 1];
    if (fim < ini && fim <= 8) return ', em jornada que se encerrava na madrugada,';
  }
  return d.adicional_noturno ? ', em jornada que adentrava o período noturno,' : '';
}

// Instrução da IA (webhook e tela de entrevista usam a mesma).
export function instrucaoDanoMoral(d = {}, caso = {}) {
  const teses = tesesFatoDanoMoral(d, caso);
  const lista = teses.length
    ? teses.map((t) => `- ${t.tese}: frase-base "${t.base}"`).join('\n')
    : '(nenhuma tese de fato específica)';
  return 'Escreva SOMENTE itens da lista "direitos lesados" do capítulo de dano moral, UM item por linha, cada linha começando com "- ". ' +
    'Os itens genéricos (jornada extraordinária, intervalo, adicional noturno, 10 minutos, periculosidade, FGTS, verbas rescisórias) JÁ estão no modelo: NÃO os escreva. ' +
    'Escreva um item para cada tese abaixo, partindo da frase-base e acrescentando os detalhes CONCRETOS da entrevista (atividades, quantidades, locais, equipamentos, agentes nocivos, datas) quando existirem, no estilo: ' +
    '"Foi compelido a acumular, sem qualquer contraprestação, as funções de auxiliar de serviços gerais, com a limpeza diária de 2 (dois) banheiros utilizados por mais de 12 (doze) pessoas" e ' +
    '"Trabalhou exposto ao frio da câmara fria, ao calor do forno industrial e a produtos químicos de limpeza, com apenas 1 (uma) japona térmica para mais de 7 (sete) empregados, sem jamais receber o adicional de insalubridade". ' +
    'Se a entrevista relatar humilhação, xingamento, ameaça, perseguição, revista vexatória, assalto ou violência no trabalho, acrescente 1 item com esse fato. ' +
    'NUNCA mencione o motivo, a acusação ou os fatos da dispensa por justa causa (provar a falta é ônus da empresa; a peça não narra nem rebate o motivo). ' +
    `Cada item: uma frase, verbo no passado, sujeito oculto (${fem(caso) ? 'a reclamante — concordância no FEMININO' : 'o reclamante — concordância no masculino'}), sem número de artigo, sem R$, sem nomes de pessoas, terminando em ";". ` +
    'Use SOMENTE fatos da entrevista: não invente quantidade, equipamento nem data; o que faltar, fique na frase-base. Sem introdução, sem conclusão, sem fundamentação.\n\nTESES:\n' + lista;
}
