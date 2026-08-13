// ============================================================
// REFERÊNCIAS (entidade ModeloReferencia) COMO FEW-SHOT DA REDAÇÃO
//
// Como estava:
//   - o caminho da TELA mandava o campo `diferencial` dos 3 modelos mais
//     parecidos, cortado em 4.000 caracteres divididos entre eles (~1.300 cada);
//   - o caminho do WEBHOOK não mandava NADA: a palavra "referencias" não
//     existia em base44/shared/redacao.js. A IA escrevia os capítulos sem nunca
//     ter visto uma peça do escritório.
// Resultado: o mesmo caso saía com prosa de qualidade diferente conforme o
// caminho, e em nenhum dos dois a IA via COMO a especialista escreve — só um
// resumo do que a peça tinha de particular.
//
// Este módulo é a fonte única dos dois caminhos e manda o TRECHO REAL do
// capítulo correspondente na peça de referência (campo `conteudo`, anonimizado),
// que é o que ensina estrutura, extensão e voz. O `diferencial` continua indo,
// como orientação do que é particular naquele tipo de caso.
// ============================================================

const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ------------------------------------------------------------
// Matching determinístico (porte de src/features/entrevista/lib/matching.js,
// que depende do SDK do navegador e não roda no webhook).
// ------------------------------------------------------------
export function pontuarModelo(modelo, attrs = {}) {
  let score = 0;
  const motivos = [];
  if (attrs.tipo_dispensa && modelo.tipo_dispensa === attrs.tipo_dispensa) {
    score += 5;
    motivos.push('Mesma modalidade de rescisão');
  }
  if (attrs.funcao && modelo.funcao) {
    const a = norm(attrs.funcao);
    const m = norm(modelo.funcao);
    const mesmaFuncao =
      (a && (m.includes(a) || a.includes(m))) ||
      (a.includes('controlador') && m.includes('controlador')) ||
      (a.includes('porteiro') && m.includes('porteiro')) ||
      (a.includes('vigilante') && m.includes('vigilante'));
    if (mesmaFuncao) {
      score += 2;
      motivos.push('Mesma função');
    }
  }
  if (attrs.rito && modelo.rito === attrs.rito) {
    score += 1;
    motivos.push('Mesmo rito');
  }
  if (attrs.tem_tomadora === true && modelo.tem_tomadora === true) {
    score += 2;
    motivos.push('Tem tomadora (Súm. 331 TST)');
  }
  const modeloTeses = (modelo.teses || []).map(norm);
  for (const t of attrs.teses || []) {
    const nt = norm(t);
    if (nt && modeloTeses.some((x) => x.includes(nt) || nt.includes(x))) {
      score += 1;
      motivos.push(`Tese: ${t}`);
    }
  }
  return { score, motivos };
}

export function rankearModelos(modelos, attrs) {
  return (modelos || [])
    .map((modelo) => ({ modelo, ...pontuarModelo(modelo, attrs) }))
    .sort((a, b) => b.score - a.score);
}

// Atributos de matching a partir do `caso` — o webhook não tem os `attrs` que a
// tela extrai da entrevista.
export function attrsDoCaso(caso = {}, flags = {}) {
  return {
    tipo_dispensa: caso.tipo_dispensa || 'sem_justa_causa',
    funcao: caso.funcao || '',
    rito: caso.rito || '',
    tem_tomadora: !!(flags.tem_tomadora || caso.recl2_nome),
    teses: [
      caso.tem_desvio && 'desvio de função',
      caso.tem_acumulo && 'acúmulo de função',
      caso.tem_dano_moral && 'dano moral',
      caso.tem_periculosidade && 'periculosidade',
      caso.tem_insalubridade && 'insalubridade',
      caso.tem_adic_noturno && 'adicional noturno',
      (caso.tem_ft || caso.ft_qtd_media) && 'folgas trabalhadas',
      caso.tem_integracao_por_fora && 'pagamento por fora',
    ].filter(Boolean),
  };
}

// ------------------------------------------------------------
// EXTRAÇÃO DO CAPÍTULO NA PEÇA DE REFERÊNCIA
//
// Cada BLOCO_* da redação corresponde a um capítulo com título próprio na peça
// da especialista. Mandar a peça inteira estouraria o prompt e afogaria o
// exemplo em texto padrão que o modelo .docx já imprime; mandamos só o capítulo
// equivalente ao que está sendo escrito.
// ------------------------------------------------------------
const TITULOS_POR_CAMPO = {
  BLOCO_ESPINHA_RESCISAO: [/RESCIS[ÃA]O\s+INDIRETA/i, /JUSTA\s+CAUSA/i, /PEDIDO\s+DE\s+DEMISS[ÃA]O/i, /DA\s+DISPENSA/i],
  BLOCO_DANO_MORAL: [/DANO[S]?\s+MORA/i],
  BLOCO_ENQUADRAMENTO: [/DESVIO\s+DE\s+FUN/i, /AC[ÚU]MULO\s+DE\s+FUN/i, /ENQUADRAMENTO/i, /GRATIFICA[ÇC][ÃA]O\s+DE\s+FUN/i],
  BLOCO_INSALUBRIDADE: [/INSALUBR/i],
  BLOCO_MULTAS_CONVENCIONAIS: [/MULTA[S]?\s+CONVENCION/i],
  BLOCO_JORNADA: [/JORNADA\s+DE\s+TRABALHO/i, /HORAS\s+EXTRAS/i],
  BLOCO_SUMULA_331: [/S[ÚU]MULA\s+331/i, /RESPONSABILIDADE\s+SUBSIDI/i],
};

// Título de capítulo na peça: linha curta, em maiúsculas, começando por DO/DA/DOS/DAS.
const RX_TITULO = /^\s*(?:\d+[.)]\s*)?((?:DO|DA|DOS|DAS)\s+[^\n]{3,80})\s*$/;

function ehTitulo(linha) {
  const m = RX_TITULO.exec(linha);
  if (!m) return null;
  const t = m[1].trim();
  // Maiúsculas: descarta frase comum que começa com "Do contrato..." em prosa.
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (!letras || letras !== letras.toUpperCase()) return null;
  return t;
}

export function capitulosDaPeca(conteudo) {
  const linhas = String(conteudo || '').split(/\r?\n/);
  const caps = [];
  let atual = null;
  for (const linha of linhas) {
    const titulo = ehTitulo(linha);
    if (titulo) {
      atual = { titulo, corpo: [] };
      caps.push(atual);
      continue;
    }
    if (atual && linha.trim()) atual.corpo.push(linha.trim());
  }
  return caps.map((c) => ({ titulo: c.titulo, texto: c.corpo.join('\n\n') }));
}

// Capítulos que a IA escreve — os únicos que vale guardar como exemplo. O resto
// da peça (competência, justiça gratuita, juros, IR, ofícios...) é texto padrão
// que o modelo .docx já imprime: guardar não ensina nada e infla o registro.
export const CAMPOS_COM_EXEMPLO = [
  'BLOCO_ESPINHA_RESCISAO',
  'BLOCO_DANO_MORAL',
  'BLOCO_ENQUADRAMENTO',
  'BLOCO_INSALUBRIDADE',
  'BLOCO_MULTAS_CONVENCIONAIS',
  'BLOCO_JORNADA',
  'BLOCO_SUMULA_331',
];

// Texto a gravar em ModeloReferencia.conteudo na importação: só os capítulos
// acima, com o título preservado para que trechoDoCapitulo consiga lê-los de
// volta. Antes gravava-se `texto.slice(0, 1500)` — 3,7% da peça da especialista,
// que são o endereçamento e a qualificação das partes: nada de aproveitável
// como exemplo de redação.
export function conteudoDeReferencia(textoAnonimizado, limitePorCapitulo = 6000) {
  const caps = capitulosDaPeca(textoAnonimizado);
  const fora = [];
  for (const campo of CAMPOS_COM_EXEMPLO) {
    const padroes = TITULOS_POR_CAMPO[campo] || [];
    const achado = caps.find((c) => padroes.some((rx) => rx.test(c.titulo)) && c.texto.trim().length >= 200);
    if (achado && !fora.some((f) => f.titulo === achado.titulo)) {
      fora.push({ titulo: achado.titulo, texto: achado.texto.trim().slice(0, limitePorCapitulo) });
    }
  }
  return fora.map((c) => `${c.titulo}\n\n${c.texto}`).join('\n\n');
}

export function trechoDoCapitulo(conteudo, campo, limite = 6000) {
  const padroes = TITULOS_POR_CAMPO[campo];
  if (!padroes) return null;
  for (const cap of capitulosDaPeca(conteudo)) {
    if (!padroes.some((rx) => rx.test(cap.titulo))) continue;
    const texto = cap.texto.trim();
    if (texto.length < 200) continue; // título sem corpo aproveitável
    return { titulo: cap.titulo, texto: texto.slice(0, limite) };
  }
  return null;
}

// ------------------------------------------------------------
// BLOCO DE REFERÊNCIAS PARA O PROMPT
//
// Um exemplo por capítulo: percorre os modelos do mais parecido para o menos e
// pega o PRIMEIRO que tenha aquele capítulo escrito. Duas versões do mesmo
// capítulo não ensinam mais que uma boa — só gastam contexto.
// ------------------------------------------------------------
export function blocoReferencias({ modelos = [], attrs = {}, campos = [], limitePorCapitulo = 6000, limiteTotal = 20000 } = {}) {
  const ranking = rankearModelos(modelos, attrs).filter((r) => r.score > 0);
  const candidatos = (ranking.length ? ranking.map((r) => r.modelo) : modelos).slice(0, 5);

  const exemplos = [];
  let gasto = 0;
  for (const campo of campos) {
    if (gasto >= limiteTotal) break;
    for (const m of candidatos) {
      const t = trechoDoCapitulo(m.conteudo, campo, Math.min(limitePorCapitulo, limiteTotal - gasto));
      if (!t) continue;
      exemplos.push({ campo, titulo: t.titulo, origem: m.titulo || '', texto: t.texto });
      gasto += t.texto.length;
      break;
    }
  }

  // O `diferencial` do PADRÃO OURO tem ~2.100 caracteres de regras numeradas do
  // escritório. A tela mandava 4.000 dividido por 3 modelos (~1.333 cada) e
  // cortava no meio da regra 5 — a IA nunca via as regras 5 a 10, entre elas
  // "ROL DE PEDIDOS DETALHADO: reflexos discriminados um a um", exatamente o que
  // a especialista apontou como faltando. O mais semelhante agora vai inteiro.
  const diferenciais = candidatos
    .slice(0, 3)
    .map((m) => ({ titulo: m.titulo || '', texto: String(m.diferencial || m.resumo || '').trim() }))
    .filter((d) => d.texto)
    .map((d, i) => `--- Referência ${i + 1}${d.titulo ? ` (${d.titulo})` : ''} ---\n${d.texto.slice(0, i === 0 ? 6000 : 1200)}`);

  if (!exemplos.length && !diferenciais.length) {
    return '(nenhuma peça de referência disponível — siga apenas os dispositivos legais, Súmulas e a CCT acima.)';
  }

  const partes = [];
  if (exemplos.length) {
    partes.push(
      'COMO O ESCRITÓRIO ESCREVE — TRECHOS REAIS DE PEÇAS REVISADAS (padrão a seguir):',
      'Use estes trechos como MODELO DE FORMA: extensão do capítulo, ordem dos argumentos, como os dispositivos e cláusulas entram na frase, o tom. NÃO copie os FATOS: eles são de OUTRO cliente. Todo fato que você escrever tem de vir do caso em julgamento descrito abaixo — nome, datas, função, jornada, valores e episódios do caso atual, nunca os do exemplo. Copiar fato do exemplo é erro grave.',
      ...exemplos.map((e) => `--- exemplo para ${e.campo} — "${e.titulo}"${e.origem ? ` (peça: ${e.origem})` : ''} ---\n${e.texto}`),
    );
  }
  if (diferenciais.length) {
    partes.push(
      '',
      'PONTOS PARTICULARES DE CASOS SEMELHANTES (inspiração para as teses; só inclua o que tiver suporte no relato deste caso):',
      diferenciais.join('\n\n'),
    );
  }
  return partes.join('\n');
}
