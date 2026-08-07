// Mapeamento determinístico do payload do webhook → objeto `caso`.
// Fonte unica do contrato do webhook (a copia do frontend foi removida por ser morta).

function parseBRL(s) {
  if (s == null) return null;
  const str = String(s).trim();
  const m = /R\$\s*([\d.,]+)/i.exec(str);
  const raw = m ? m[1] : str.replace(/[^\d.,]/g, '');
  if (!raw) return null;
  const v = parseFloat(raw.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

function normalizarData(s) {
  if (!s) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return s.slice(0, 10);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return s;
}

function mapearTipoDispensa(s) {
  const t = String(s || '').toLowerCase().trim();
  if (/sem\s+justa\s+causa/.test(t)) return 'sem_justa_causa';
  if (/rescis[aã]o\s+indireta/.test(t)) return 'rescisao_indireta';
  if (/coa[çc][aã]o|coagido|nulidade|pedido\s+de\s+demiss[aã]o/.test(t)) return 'nulidade_pedido_demissao';
  if (/revers[aã]o\s+(da\s+)?justa\s+causa/.test(t)) return 'reversao_justa_causa';
  if (/acordo/.test(t)) return 'acordo';
  return 'sem_justa_causa';
}

function parseRange(s) {
  if (!s) return null;
  const nums = String(s).match(/\d+(?:[.,]\d+)?/g);
  if (!nums || !nums.length) return null;
  const vals = nums.map((n) => parseFloat(n.replace(',', '.')));
  if (vals.length === 1) return vals[0];
  return (vals[0] + vals[1]) / 2;
}

// Devolve "Cidade/UF" quando possivel (formato usado na comarca); senao a UF.
function extrairUF(end) {
  const s = String(end || '');
  const cidadeUf = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.\s']{2,40})\/([A-Z]{2})\b/.exec(s);
  if (cidadeUf) return `${cidadeUf[1].trim()}/${cidadeUf[2]}`;
  const m = /,\s*([A-Z]{2})\s*,\s*CEP/i.exec(s) || /\/([A-Z]{2})\b/.exec(s);
  return m ? m[1] : '';
}

// Primeiro valor nao vazio entre varias chaves possiveis do payload.
const pick = (d, ...chaves) => {
  for (const k of chaves) {
    const v = d[k];
    if (v != null && String(v).trim() !== '') return v;
  }
  return '';
};

const juntar = (...partes) => partes.filter((p) => p && String(p).trim()).join(', ');

function inferirGenero(d) {
  const ec = String(d.RECL_ESTADOCIVIL || d.estado_civil || '').toLowerCase().trim();
  if (/a$/.test(ec)) return 'F';
  if (/o$/.test(ec)) return 'M';
  return 'M';
}

// Extrai o ID do modelo enviado pelo sistema de origem.
// Contrato: o formulario externo manda o template_id (um PetitionTemplate do FAV).
// Aceita variacoes de nome para tolerar diferencas do emissor.
export function extrairTemplateId(data, payload) {
  const fontes = [data, payload].filter((o) => o && typeof o === 'object');
  const chaves = ['template_id', 'modelo_id', 'templateId', 'modeloId'];
  for (const o of fontes) {
    for (const k of chaves) {
      const v = o[k];
      if (v != null && String(v).trim()) return String(v).trim();
    }
  }
  return '';
}

export function mapearCasoDeWebhook(data) {
  if (!data || typeof data !== 'object') return {};
  const d = data;
  const caso = {};

  // Modelo a preencher vem pronto do webhook — nao ha matching por IA aqui.
  caso.template_id = extrairTemplateId(d);

  const ctps = pick(d, 'RECL_CTPS', 'ctps');
  const r1 = (d.reclamadas && d.reclamadas[0]) || {};
  const r2 = (d.reclamadas && d.reclamadas[1]) || {};
  const r3 = (d.reclamadas && d.reclamadas[2]) || {};

  caso.recl_nome = pick(d, 'RECL_NOME', 'nome_cliente');
  caso.recl_nacionalidade = pick(d, 'RECL_NACIONALIDADE', 'nacionalidade');
  caso.recl_estado_civil = pick(d, 'RECL_ESTADOCIVIL', 'estado_civil');
  caso.recl_rg = pick(d, 'RECL_RG', 'rg');
  caso.recl_cpf = pick(d, 'RECL_CPF', 'cpf');
  caso.recl_pis = pick(d, 'RECL_PIS', 'pis');
  if (ctps) {
    const m = /(\d+)\s*,?\s*s[ée]rie\s*(\d+)/i.exec(ctps);
    if (m) { caso.recl_ctps = m[1]; caso.recl_serie = m[2]; }
    else caso.recl_ctps = ctps;
  }
  if (!caso.recl_serie && pick(d, 'RECL_SERIE')) caso.recl_serie = pick(d, 'RECL_SERIE');
  caso.recl_nascimento = normalizarData(pick(d, 'RECL_NASC', 'data_nascimento'));
  caso.recl_filiacao = pick(d, 'RECL_FILIACAO', 'filiacao');
  caso.recl_endereco = juntar(pick(d, 'RECL_ENDERECO', 'endereco_cliente'), pick(d, 'RECL_CEP') && `CEP ${pick(d, 'RECL_CEP')}`);
  caso.recl_email = pick(d, 'email');
  caso.recl_genero = inferirGenero(d);

  caso.recl1_nome = pick(d, 'RECL1_NOME') || r1.razao_social || '';
  caso.recl1_cnpj = pick(d, 'RECL1_CNPJ') || r1.cnpj || '';
  caso.recl1_logradouro = juntar(pick(d, 'RECL1_LOGRADOURO') || r1.endereco, pick(d, 'RECL1_ENDCOMPL'));
  caso.recl2_nome = pick(d, 'RECL2_NOME') || r2.razao_social || '';
  caso.recl2_cnpj = pick(d, 'RECL2_CNPJ') || r2.cnpj || '';
  caso.recl2_logradouro = juntar(pick(d, 'RECL2_LOGRADOURO') || r2.endereco, pick(d, 'RECL2_ENDCOMPL'));
  caso.recl3_nome = pick(d, 'RECL3_NOME') || r3.razao_social || '';
  caso.recl3_cnpj = pick(d, 'RECL3_CNPJ') || r3.cnpj || '';
  caso.recl3_logradouro = juntar(pick(d, 'RECL3_LOGRADOURO') || r3.endereco, pick(d, 'RECL3_ENDCOMPL'));
  caso.local_prestacao = caso.recl2_logradouro || caso.recl1_logradouro || '';

  caso.data_admissao = normalizarData(pick(d, 'DATA_ADMISSAO', 'admissao'));
  caso.data_rescisao = normalizarData(pick(d, 'DATA_RESCISAO', 'demissao', 'ultimo_dia'));
  caso.salario = parseBRL(pick(d, 'SALARIO', 'salario'));
  caso.funcao = pick(d, 'FUNCAO', 'cargo') || r1.cargo || '';
  caso.tipo_dispensa = mapearTipoDispensa(pick(d, 'tipo_dispensa', 'TIPO_DISPENSA'));

  caso.escala = pick(d, 'escala', 'ESCALA') || r1.escala || '';
  caso.jornada_horario = pick(d, 'JORNADA_HORARIO', 'jornada_horario');
  if (d.horas_extras) {
    caso.jornada_extrapola = true;
    caso.jornada_freq_extra = pick(d, 'JORNADA_FREQ_EXTRA', 'media_horas_extras');
    // Antes: tol.map(...).join(' — '), que com os dois períodos iguais produzia
    // "30 minutos de tolerância — 30 minutos de tolerância" — saíu assim na peça
    // do Marcos e a revisora marcou o trecho. Agora descreve as POSIÇÕES.
    const antes = d.periodo_antecedente ? String(d.periodo_antecedente).trim() : '';
    const depois = d.periodo_sucedente ? String(d.periodo_sucedente).trim() : '';
    if (antes && depois) {
      caso.prorrogacao_jornada = antes === depois
        ? `${antes} antes e ${depois} depois da jornada`
        : `${antes} antes e ${depois} após a jornada`;
    } else if (antes || depois) {
      caso.prorrogacao_jornada = `${antes || depois} ${antes ? 'antes' : 'após'} a jornada`;
    }
  }
  if (d.intervalo_suprimido) {
    caso.intervalo_gozado = false;
    // O campo entra na frase "concessão parcial do intervalo ... de X", então só
    // aceita DURAÇÃO. Na peça do Marcos a entrevista havia posto "Rádio HT
    // sempre ligado" neste campo e a frase saiu sem sentido no documento.
    // Detalhe que não é duração vai para observação, não para o texto da peça.
    const det = String(pick(d, 'INTERVALO_GOZADO', 'intervalo_detalhes') || '').trim();
    if (det && /\d|minut|hora|meia/i.test(det)) caso.intervalo_usufruido = det;
    else if (det) caso.intervalo_observacao = det.slice(0, 200);
  }

  if (d.folgas_trabalhadas || d.finais_semana) {
    caso.tem_ft = true;
    const ftTxt = String(pick(d, 'FT_QTD_MEDIA', 'ft_quantidade') || '').trim();
    caso.ft_qtd_media = parseRange(ftTxt);
    // Guarda o TEXTO original ("5 a 6 vezes por mês"). A média numérica serve ao
    // cálculo; imprimir ela na peça produziu "em média de 5.5 vezes por mês",
    // marcado como incorreto pela revisora. A peça usa o intervalo declarado.
    if (ftTxt) caso.ft_qtd_texto = ftTxt;
    caso.val_ft = parseRange(pick(d, 'VAL_FT', 'val_ft'));
  }
  if (d.ft_pagamento && /pix|dinheiro/i.test(d.ft_pagamento)) {
    caso.tem_integracao_por_fora = true;
  }
  // O valor pago "por fora" É o valor da FT quitada em PIX/dinheiro — é assim
  // que a especialista redige ("gira em torno de R$ 130,00"). Sem esta linha o
  // token VALOR_POR_FORA ficava vazio e as TRÊS peças saíram com
  // "[A PREENCHER: VALOR_POR_FORA]" no corpo E no rol de pedidos.
  if (caso.tem_integracao_por_fora && !caso.valor_por_fora && caso.val_ft) {
    caso.valor_por_fora = caso.val_ft;
  }

  // O formulário de entrevista tem UMA pergunta ("funções acumuladas") para
  // um conceito que a CCT trata como DOIS institutos distintos por categoria:
  // Vigilante — "desvio de função" (multa 50%, cláusula de inibição ao desvio
  // funcional da CCT de vigilância); Porteiro/Controlador/Limpeza — "acúmulo
  // de função" (multa 20%, cláusula 12ª SIEMACO/SINDEEPRES). Rotear pelo
  // errado subestima a verba (20% em vez de 50%) e cita a tese errada na peça.
  if (d.acumulo_funcao) {
    const ehVigilante = /vigilante|vigil/i.test(caso.funcao || '');
    if (ehVigilante) {
      caso.tem_desvio = true;
      caso.desvio_atividades = d.funcoes_acumuladas || '';
    } else {
      caso.tem_acumulo = true;
      caso.acumulo_atividades = d.funcoes_acumuladas || '';
    }
  }

  if (d.periculosidade || d.tem_periculosidade) caso.tem_periculosidade = true;
  if (d.insalubridade || d.tem_insalubridade) caso.tem_insalubridade = true;
  if (d.adicional_noturno || d.tem_adic_noturno) caso.tem_adic_noturno = true;

  if (d.vale_transporte) caso.tem_vale_transporte = true;
  if (d.vale_alimentacao || d.vale_refeicao) caso.tem_auxilio_alimentacao = true;
  // Valor diário do auxílio-alimentação, quando o formulário informa (antes só
  // vinha da CCT ou do padrão de vigilância, e para SINDEEPRES/SIEMACO ficava
  // vazio — origem do "[A PREENCHER: VALOR_AUX_ALIMENTACAO]").
  const valAux = parseBRL(pick(d, 'VALOR_AUX_ALIMENTACAO', 'valor_aux_alimentacao', 'valor_vale_alimentacao', 'vale_alimentacao', 'vale_refeicao'));
  if (valAux) caso.valor_aux_alimentacao = valAux;
  const valCond = parseBRL(pick(d, 'VAL_CONDUCAO', 'val_conducao', 'valor_conducao', 'vale_transporte'));
  if (valCond) caso.val_conducao = valCond;

  // PRÊMIO DE ASSIDUIDADE. A verba é a DIFERENÇA entre o prometido e o pago
  // (art. 457, §1º, CLT). Não havia mapeamento nenhum aqui, então a tese era
  // inalcançável pelo fluxo do webhook: na peça do Jonathan a IA chegou a
  // NARRAR o fato ("recebimento parcial da bonificação de assiduidade que lhe
  // havia sido prometida") e não pediu a verba — a especialista pediu
  // R$ 3.100,61 (prometido R$ 300, pago R$ 100).
  const assidPrometido = parseBRL(pick(d, 'assiduidade_prometido', 'premio_assiduidade_prometido', 'assiduidade_valor_prometido'));
  const assidPago = parseBRL(pick(d, 'assiduidade_pago', 'premio_assiduidade_pago', 'assiduidade_valor_pago'));
  if (assidPrometido || assidPago || d.assiduidade || d.premio_assiduidade) {
    caso.tem_assiduidade = true;
    if (assidPrometido) caso.assiduidade_prometido = assidPrometido;
    if (assidPago) caso.assiduidade_pago = assidPago;
    const dif = assidPrometido ? assidPrometido - (assidPago || 0) : null;
    if (dif && dif > 0) caso.assiduidade_diferenca = Number(dif.toFixed(2));
  }

  if (d.doenca_acidente || d.tem_doenca) caso.tem_doenca = true;

  // GRATIFICAÇÃO DE FUNÇÃO é a tese do VIGILANTE-CONDUTOR (motoronda): 10%
  // sobre o salário base, cláusula 3º da CCT de vigilância. Ligar a flag por um
  // campo genérico do payload fez a peça do Jonathan — controlador de acesso,
  // SINDEEPRES — pedir 10% "da cláusula 3º" (convenção de outra categoria)
  // CUMULADO com acúmulo de função de 20% sobre o mesmo contrato: tese
  // indevida + bis in idem. Revisado pela especialista como erro crítico.
  if (d.gratificacao) {
    const ehVigilante = /vigilante|vigil/i.test(caso.funcao || '');
    const ehCondutor = /condutor|motorista|motoronda|moto\b|ve[íi]culo|dirig/i.test(
      `${d.gratificacao} ${d.funcoes_acumuladas || ''} ${d.fatos_narrados || ''}`
    );
    if (ehVigilante && ehCondutor) {
      caso.tem_gratificacao = true;
      const v = parseBRL(d.gratificacao);
      if (v) caso.gratificacao_valor = v;
    } else {
      // Registra sem gerar a tese, para o advogado decidir na revisão.
      caso.gratificacao_ignorada = String(d.gratificacao).slice(0, 200);
    }
  }

  caso.entrevista_texto = d.fatos_narrados || '';
  // O relato da entrevista NÃO é a narrativa do dano moral. Copiar o campo cru
  // pôs na peça do Marcos anotações em terceira pessoa ("Alega que não recebia
  // PL") e um fato irrelevante para o dano (empréstimo consignado descontado na
  // rescisão) — a revisora marcou "inserido sem contexto". Só aproveitamos o
  // relato quando ele tem cara de narrativa; se tiver cara de anotação, vai
  // para observação e a narrativa é montada dos fatos (narrativaDanoMoral).
  const relato = String(d.fatos_narrados || '').trim();
  const pareceAnotacao = /\balega\s+que\b|\bhavia\s+solicitad|\brelata\s+que\b|\binforma\s+que\b|^\s*[-•*\d]\s|\bPL\b|consignado/i.test(relato);
  if (relato && !pareceAnotacao) caso.dano_fatos = relato;
  else if (relato) caso.dano_observacao = relato;

  caso.comarca_uf = extrairUF(caso.local_prestacao || caso.recl_endereco);

  return caso;
}