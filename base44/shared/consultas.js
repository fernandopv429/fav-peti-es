// Consultas oficiais determinísticas para o backend (sem SDK de usuário):
// CNPJ (BrasilAPI), CEP (ViaCEP) e CCT (ccts.nexusdevhub.com com X-API-Key).
// Replicam os backends cnpj/cep/cct, que exigem usuário autenticado —
// incompatíveis com o contexto do webhook (sem usuário).

const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
// CEP escrito com PONTO também conta: "04.902-170" é formato comum nos cadastros
// e nos payloads do webhook. Com `\d{5}` os cinco primeiros dígitos precisavam ser
// seguidos, então "04.902-170" não casava, o CEP não era extraído, não era
// consultado no ViaCEP e o município ficava sem fonte — foi um dos motivos de a
// peça do Carlos Gabriel sair com "[VARA / CIDADE / REGIÃO]".
const CEP_LABEL_RE = /CEP:?\s*(\d{2}\.?\d{3}-?\d{3})/gi;
const CEP_DASH_RE = /\b\d{2}\.?\d{3}-\d{3}\b/g;

export function extrairCnpjs(texto) {
  const encontrados = new Set();
  for (const m of (texto || '').matchAll(CNPJ_RE)) {
    const d = m[0].replace(/\D/g, '');
    if (d.length === 14) encontrados.add(d);
  }
  return [...encontrados];
}

export function extrairCeps(texto) {
  const encontrados = new Set();
  const t = texto || '';
  for (const m of t.matchAll(CEP_LABEL_RE)) {
    const d = m[1].replace(/\D/g, '');
    if (d.length === 8) encontrados.add(d);
  }
  for (const m of t.matchAll(CEP_DASH_RE)) {
    const d = m[0].replace(/\D/g, '');
    if (d.length === 8) encontrados.add(d);
  }
  return [...encontrados];
}

function formatarCnpj(digits) {
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export async function enriquecerCnpjs(cnpjs) {
  const unicos = [...new Set((cnpjs || []).map((c) => (c || '').replace(/\D/g, '')).filter((d) => d.length === 14))];
  if (!unicos.length) return [];
  return Promise.all(unicos.map(async (digits) => {
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (res.status === 404) return { cnpj: formatarCnpj(digits), erro: 'não encontrado na Receita' };
      if (!res.ok) return { cnpj: formatarCnpj(digits), erro: `erro HTTP ${res.status}` };
      const d = await res.json();
      const cep = (d.cep || '').replace(/\D/g, '');
      const endereco = [
        `${d.descricao_tipo_de_logradouro || ''} ${d.logradouro || ''}`.trim(),
        d.numero,
        d.complemento,
        d.bairro,
        [d.municipio, d.uf].filter(Boolean).join('/'),
      ].filter(Boolean).join(', ');
      return {
        cnpj: formatarCnpj(digits),
        razao_social: d.razao_social || '',
        endereco,
        cep: cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep,
        situacao: d.descricao_situacao_cadastral || '',
      };
    } catch (e) {
      return { cnpj: formatarCnpj(digits), erro: 'falha de rede ao consultar a Receita' };
    }
  }));
}

export async function enriquecerCeps(ceps) {
  const unicos = [...new Set((ceps || []).map((c) => (c || '').replace(/\D/g, '')).filter((d) => d.length === 8))];
  if (!unicos.length) return [];
  return Promise.all(unicos.map(async (digits) => {
    const fmt = `${digits.slice(0, 5)}-${digits.slice(5)}`;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (res.ok) {
        const d = await res.json();
        if (!d.erro) {
          return { cep: fmt, logradouro: d.logradouro || '', bairro: d.bairro || '', municipio: d.localidade || '', uf: d.uf || '', ibge: d.ibge || '' };
        }
      }
    } catch (e) { /* segue */ }
    try {
      const res2 = await fetch(`https://brasilapi.com.br/api/cep/v1/${digits}`);
      if (res2.ok) {
        const d2 = await res2.json();
        return { cep: fmt, logradouro: d2.street || '', bairro: d2.neighborhood || '', municipio: d2.city || '', uf: d2.state || '', ibge: '' };
      }
    } catch (e) { /* ignora */ }
    return { cep: fmt, erro: 'não encontrado' };
  }));
}

export function categoriaCct(caso = {}, attrs = {}) {
  const t = `${caso.funcao || attrs.funcao || ''} ${caso.sindicato || ''}`.toLowerCase();
  if (/vigilante|seevissp|sesvesp|segurança/.test(t)) return 'vigilancia';
  if (/asseio|limpeza|conserva|siemaco|seac/.test(t)) return 'asseio_conservacao';
  return 'terceirizados';
}

// ------------------------------------------------------------------
// BASE DE CCTs CADASTRADAS (entidade CCT) como fonte de valores.
//
// A entidade CCT guarda três convenções curadas à mão, com `beneficios` e
// `adicionais` conferidos — fonte melhor do que raspar R$ do texto devolvido
// pela API. Ela era lida apenas por auditarPeticao; o gerador não a consultava.
//
// Atenção: são DUAS taxonomias de categoria. `categoriaCct` (acima) devolve
// vigilancia/asseio_conservacao/terceirizados; a entidade usa
// vigilante/porteiro_siemaco/porteiro_sindeepres. O mapa abaixo liga as duas.
// ------------------------------------------------------------------
const CATEGORIA_ENTIDADE = {
  vigilancia: 'vigilante',
  asseio_conservacao: 'porteiro_siemaco',
  terceirizados: 'porteiro_sindeepres',
};

export function categoriaEntidadeCct(caso = {}, attrs = {}) {
  return CATEGORIA_ENTIDADE[categoriaCct(caso, attrs)] || null;
}

// Valor DIÁRIO por categoria, extraído das peças reais revisadas pela
// especialista (INICIAIS_REAIS). Último recurso: só vale quando nem o
// formulário, nem a base de CCTs, nem a cláusula consultada trazem o número.
const AUX_ALIMENTACAO_TABELA = {
  vigilante: 42.00,          // "R$ 42,00/dia" — Cl. 17ª SESVESP 2026/2027
  porteiro_siemaco: 21.80,   // "R$ 21,80/dia" — Cl. 15ª SIEMACO-SP 2026/2027
  porteiro_sindeepres: 26.03, // "R$ 26,03/dia" — Cl. 10ª Termo Aditivo SINDEEPRES 2026
};

export function auxAlimentacaoDaTabela(categoriaEntidade) {
  return AUX_ALIMENTACAO_TABELA[categoriaEntidade] || null;
}

// Procura o valor diário de alimentação nos `beneficios` do registro de CCT.
// Exige a marca "/dia" (ou "por dia") de propósito: os mesmos campos citam
// descontos ("R$ 1,46"), cestas mensais ("R$ 205,91/mês") e totais anuais
// ("totalizando R$ 43,60") que NÃO são o valor diário.
const RX_DIARIO = /R\$\s*([\d.]+,\d{2})\s*(?:\/\s*dia|por\s*dia|ao\s*dia)/i;

export function valorDiarioDaBaseCct(registroCct, tema = 'alimentacao') {
  const beneficios = registroCct?.beneficios;
  if (!beneficios || typeof beneficios !== 'object') return null;
  const rxTema = tema === 'conducao'
    ? /transporte|condu[çc][ãa]o|passagen/i
    : /refei[çc][ãa]o|aliment/i;
  for (const [chave, texto] of Object.entries(beneficios)) {
    if (!rxTema.test(chave) && !rxTema.test(String(texto))) continue;
    const m = RX_DIARIO.exec(String(texto));
    if (!m) continue;
    const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(v) && v > 1 && v < 200) return { valor: v, clausula: chave };
  }
  return null;
}

const CCT_PERGUNTAS_BASE = [
  'piso salarial / salário normativo da categoria',
  'adicional noturno e hora noturna reduzida',
  'auxílio alimentação / refeição e vale-transporte',
  'multa convencional por descumprimento de cláusula',
  'adicional de horas extras e intervalo intrajornada',
];
const CCT_PERGUNTAS_CONDICIONAIS = [
  [/desvio de fun/i, 'desvio de função e a multa convencional correspondente'],
  [/ac[uú]mulo de fun/i, 'acúmulo de função e a multa convencional correspondente'],
  [/periculos/i, 'adicional de periculosidade e sua integração nas horas extras'],
  [/insalubr/i, 'adicional de insalubridade'],
  [/10 minutos|descanso sentad/i, 'os 10 minutos de descanso sentado durante a jornada'],
  [/12x36|escala|jornada|hora[s]? extra/i, 'compensação de jornada, escala 12x36 e prorrogação'],
  [/folga|dsr|descanso semanal|feriado/i, 'trabalho em folgas, feriados e descanso semanal remunerado'],
  [/dano moral|ass[eé]dio/i, 'garantias e direitos do trabalhador previstos na convenção'],
  [/gratifica[çc][aã]o|condutor|motorista/i, 'gratificação de função do condutor de veículo'],
  [/assiduidade/i, 'prêmio de assiduidade e seu valor previsto em convenção'],
];

export function perguntasCct(caso = {}, attrs = {}) {
  const contexto = [
    ...(attrs.teses || []),
    caso.acumulo_funcao,
    caso.funcao,
    caso.jornada_horario,
    caso.tem_desvio && 'desvio de função',
    caso.tem_acumulo && 'acúmulo de função',
    caso.tem_periculosidade && 'periculosidade',
    caso.tem_insalubridade && 'insalubridade',
    caso.tem_adic_noturno && 'adicional noturno',
    caso.tem_ft && 'folgas trabalhadas',
    caso.tem_dano_moral && 'dano moral',
    caso.tem_assiduidade && 'assiduidade',
  ].filter(Boolean).join(' ');
  const condicionais = CCT_PERGUNTAS_CONDICIONAIS.filter(([re]) => re.test(contexto)).map(([, p]) => p);
  return [...new Set([...CCT_PERGUNTAS_BASE, ...condicionais])];
}

function municipioDeLocal(local) {
  if (!local) return '';
  const s = String(local).replace(/\d{5}-?\d{3}/g, '').trim();
  // Aceita "Cidade/UF" além de "Cidade - UF": os endereços montados pelo
  // mapeamento usam a barra, então o regex antigo (só hífen) devolvia vazio e a
  // consulta de CCT ia sem município nenhum.
  const m = s.match(/([A-ZÀ-Ý][A-ZÀ-Ý\s'.-]*?)\s*[-/]\s*([A-Z]{2})\b/i);
  return m ? m[1].trim().replace(/[.,;]+$/, '') : '';
}

export async function enriquecerCct(caso, attrs, config, apiKey) {
  if (!config?.cct_ativo) return null;
  if (!apiKey) return null;
  const categoria = config.cct_categoria || categoriaCct(caso, attrs);
  const data_fato = caso?.data_rescisao || caso?.data_admissao || undefined;
  // caso.comarca não existe no contrato do caso — o campo é comarca_uf
  // ("Cidade/UF"), de onde tiramos só a cidade.
  const daComarca = String(caso?.comarca_uf || caso?.comarca || '').split('/')[0].trim();
  const municipio = municipioDeLocal(caso?.local_prestacao)
    || (daComarca.length > 2 ? daComarca : '')
    || undefined;
  const uf = undefined;
  const perguntas = perguntasCct(caso, attrs);

  const consultar = async (body) => {
    let res;
    for (let attempt = 0; attempt <= 2; attempt++) {
      res = await fetch('https://ccts.nexusdevhub.com/consultar-cct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify(body),
      });
      if (res.status !== 429 && res.status < 500) break;
      await new Promise((r) => setTimeout(r, 800));
    }
    if (!res.ok) return [];
    const data = await res.json();
    return data?.resultados || [];
  };

  let semMunicipio = false;
  const buscas = await Promise.all(perguntas.map(async (pergunta) => {
    const body = { pergunta, limite: 3 };
    if (categoria) body.categoria = categoria;
    if (municipio) body.municipio = municipio;
    if (data_fato) body.data_fato = data_fato;
    try {
      let resultados = await consultar(body);
      // O filtro de município zera a busca quando a CCT cadastrada tem base
      // territorial mais estreita que o caso — conferido contra a API: a de
      // asseio é municipal de SP capital e devolve 0 para "Guarulhos", ainda que
      // a categoria esteja certa. Sem cláusula nenhuma a peça sai sem citar
      // número de cláusula. Então, quando o filtro zera, refazemos sem ele e
      // sinalizamos, para o advogado conferir a abrangência antes de protocolar.
      if (!resultados.length && municipio) {
        const { municipio: _fora, ...semMun } = body;
        resultados = await consultar(semMun);
        if (resultados.length) semMunicipio = true;
      }
      return { pergunta, resultados };
    } catch (e) {
      return { pergunta, resultados: [] };
    }
  }));

  const vistos = new Set();
  const clausulas = [];
  for (const b of buscas) {
    for (const r of b.resultados) {
      const id = `${r.titulo}||${r.clausula_ref}`;
      if (vistos.has(id)) continue;
      vistos.add(id);
      clausulas.push(r);
    }
  }
  // A CCT de referência (meta) alimenta o ano citado na peça e vinha do PRIMEIRO
  // resultado da busca semântica — que pode ser uma convenção antiga. A peça do
  // Marcos citou "CCT 2024" onde a especialista cita a de 2026, e a revisora
  // marcou o tópico das multas. Agora preferimos a convenção cuja vigência cobre
  // a data do fato e, na falta dela, a mais recente.
  const fimVigencia = (c) => c?.vigencia_fim || c?.vigencia_fim_sociais || c?.vigencia_fim_economicas || '';
  const cobreDataFato = (c) => {
    if (!data_fato || !c?.vigencia_inicio) return false;
    const fim = fimVigencia(c);
    return String(c.vigencia_inicio) <= String(data_fato) && (!fim || String(data_fato) <= String(fim));
  };
  const porInicioDesc = (a, b) => String(b?.vigencia_inicio || '').localeCompare(String(a?.vigencia_inicio || ''));
  const top = clausulas.filter(cobreDataFato).sort(porInicioDesc)[0]
    || [...clausulas].sort(porInicioDesc)[0]
    || null;
  return {
    categoria,
    data_fato,
    municipio,
    // true = as cláusulas vieram de uma busca SEM o filtro de município, ou
    // seja, a abrangência territorial da CCT precisa ser conferida.
    municipio_nao_filtrado: semMunicipio,
    uf,
    perguntas,
    clausulas,
    meta: top ? {
      titulo: top.titulo,
      ano_base: top.ano_base,
      vigencia_inicio: top.vigencia_inicio,
      vigencia_fim: top.vigencia_fim,
      sindicato_laboral: top.sindicato_laboral,
      fonte_url: top.fonte_url,
    } : null,
  };
}

// Pisos de último recurso. NÃO são usados por padrão — ver extrairPisoCct.
const PISOS_FALLBACK = {
  vigilante_2025: 2127.66,
  vigilante_2026: 2271.74,
  porteiro_2025: 1699.23,
  porteiro_2026: 1805.00,
  asseio_2025: 1699.23,
  asseio_2026: 1805.00,
};

/**
 * Piso salarial da categoria a partir das cláusulas realmente retornadas pela
 * CCT consultada. O piso "chapado" de PISOS_FALLBACK só sai com
 * { permitirFallback: true } — e quem pedir tem de avisar o advogado.
 *
 * Por quê: duas peças reais (Jonathan e Luciano) foram calculadas sobre
 * R$ 1.699,23, que é exatamente PISOS_FALLBACK.porteiro_2025, quando o salário
 * real dos dois era R$ 1.912,07. Dano moral, aviso, 13º, férias, FGTS e multas
 * saíram todos ~11% abaixo, e a peça afirmava um salário que não era o do
 * empregado — sem uma linha de alerta em lugar nenhum.
 *
 * @returns {number|{valor:number,origem:string,fonte?:string}|null}
 *   número quando vem de cláusula (compatibilidade com quem já chamava);
 *   null quando não há piso confiável e o fallback não foi autorizado.
 */
export function extrairPisoCct(dadosCct, funcao = '', { permitirFallback = false } = {}) {
  if (!dadosCct?.clausulas?.length) {
    if (!permitirFallback) return null;
    return pisoDeFallback(dadosCct, funcao);
  }
  const PADROES_PISO = /piso\s*salarial|sal[áa]rio\s*normativo|sal[áa]rio\s*base|sal[áa]rio\s*m[íi]nimo\s*(?:da\s*categoria|convencional)/i;
  for (const c of dadosCct.clausulas) {
    const texto = [c.ementa, c.texto, c.conteudo, c.clausula_titulo, c.clausula_ref].filter(Boolean).join(' ');
    if (!PADROES_PISO.test(texto)) continue;
    const m = texto.match(/R\$\s*([\d.]+,\d{2})/i) || texto.match(/\b(\d{3,4}[\.,]\d{2})\b/);
    if (m) {
      const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
      if (Number.isFinite(v) && v > 500 && v < 20000) return v;
    }
  }
  if (!permitirFallback) return null;
  return pisoDeFallback(dadosCct, funcao);
}

function pisoDeFallback(dadosCct, funcao = '') {
  const ano = dadosCct?.meta?.ano_base ? String(dadosCct.meta.ano_base) : String(new Date().getFullYear());
  const cat = dadosCct?.categoria || categoriaCct({ funcao }, {});
  const ehVig = /vigilante|vigil/i.test(funcao || '');
  const chave = ehVig ? `vigilante_${ano}` : `${cat}_${ano}`;
  if (PISOS_FALLBACK[chave]) return PISOS_FALLBACK[chave];
  return null;
}