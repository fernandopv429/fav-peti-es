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

// Aceita valor unico ("R$ 180,00") ou faixa ("5 a 6", "R$ 180 a R$ 200"),
// devolvendo o numero ou a media da faixa.
//
// CUIDADO COM O SEPARADOR DE MILHAR. A versao anterior casava numeros com
// /\d+(?:[.,]\d+)?/g e, em "R$ 1.180,00", encontrava DOIS tokens ("1.180" e
// "00"): tratava o valor como faixa e devolvia a media, 0,59. Ou seja, qualquer
// folga trabalhada de R$ 1.000 ou mais entrava no rol como centavos, em
// silencio, contaminando tambem valor_por_fora e o valor da causa. Agora o
// formato pt-BR e reconhecido ANTES de decidir se ha faixa.
function parseRange(s) {
  if (!s) return null;
  const nums = String(s).match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?|\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const vals = nums
    .map((n) => {
      if (n.includes(',')) return parseFloat(n.replace(/\./g, '').replace(',', '.'));
      if (/^\d{1,3}(?:\.\d{3})+$/.test(n)) return parseFloat(n.replace(/\./g, ''));
      return parseFloat(n);
    })
    .filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
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

// Endereço + complemento, sem repetir o que já está no logradouro.
//
// O payload costuma mandar o CEP nas DUAS chaves: RECL1_LOGRADOURO já termina em
// "… São Paulo/SP, CEP: 04.902-170" e RECL1_ENDCOMPL vem com "CEP: 04.902-170".
// Com `juntar` a peça saiu com "…, CEP: 04.902-170, CEP: 04.902-170" nas duas
// reclamadas e também no capítulo da competência, que reaproveita o endereço.
//
// Duas checagens: complemento inteiro já contido no logradouro, e complemento
// que é só um CEP cujos dígitos já aparecem lá (pega o caso em que um lado tem
// o rótulo "CEP:" e o outro não).
const soAlnum = (s) => String(s || '').toLowerCase().replace(/[^0-9a-zà-ÿ]/g, '');
function juntarEndereco(base, complemento) {
  const b = String(base || '').trim();
  const c = String(complemento || '').trim();
  if (!c) return b;
  if (!b) return c;
  const nb = soAlnum(b);
  const nc = soAlnum(c);
  if (!nc || nb.includes(nc)) return b;
  if (/^(?:cep)?\d{8}$/.test(nc)) {
    const digitos = nc.replace(/\D/g, '');
    if (digitos.length === 8 && nb.includes(digitos)) return b;
  }
  return `${b}, ${c}`;
}

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
  const r4 = (d.reclamadas && d.reclamadas[3]) || {};

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
  // O endereço de cada reclamada vem em TRÊS chaves: logradouro, complemento e
  // agora RECLn_CEP (campo novo do formulário). juntarEndereco cuida de não
  // repetir o CEP quando ele já aparece no logradouro ou no complemento.
  const endReclamada = (n, r) =>
    juntarEndereco(
      juntarEndereco(pick(d, `RECL${n}_LOGRADOURO`) || r.endereco, pick(d, `RECL${n}_ENDCOMPL`)),
      pick(d, `RECL${n}_CEP`) && `CEP ${pick(d, `RECL${n}_CEP`)}`,
    );

  caso.recl1_logradouro = endReclamada(1, r1);
  caso.recl2_nome = pick(d, 'RECL2_NOME') || r2.razao_social || '';
  caso.recl2_cnpj = pick(d, 'RECL2_CNPJ') || r2.cnpj || '';
  caso.recl2_logradouro = endReclamada(2, r2);
  caso.recl3_nome = pick(d, 'RECL3_NOME') || r3.razao_social || '';
  caso.recl3_cnpj = pick(d, 'RECL3_CNPJ') || r3.cnpj || '';
  caso.recl3_logradouro = endReclamada(3, r3);
  // 4ª RECLAMADA — campo novo do formulário. Sem isto uma quarta tomadora era
  // lida do payload e descartada em silêncio, como já havia ocorrido com a 3ª.
  caso.recl4_nome = pick(d, 'RECL4_NOME') || r4.razao_social || '';
  caso.recl4_cnpj = pick(d, 'RECL4_CNPJ') || r4.cnpj || '';
  caso.recl4_logradouro = endReclamada(4, r4);
  // Tempo laborado em cada tomadora (campo novo) — usado para delimitar o
  // período de responsabilidade subsidiária de cada reclamada.
  for (const n of [1, 2, 3, 4]) {
    const t = pick(d, `RECL${n}_TEMPO_LABORADO`);
    if (t) caso[`recl${n}_tempo_laborado`] = String(t).trim();
  }
  caso.local_prestacao = caso.recl2_logradouro || caso.recl1_logradouro || '';

  caso.data_admissao = normalizarData(pick(d, 'DATA_ADMISSAO', 'admissao'));
  caso.data_rescisao = normalizarData(pick(d, 'DATA_RESCISAO', 'demissao', 'ULTIMO_DIA_TRABALHADO', 'ultimo_dia'));
  caso.salario = parseBRL(pick(d, 'SALARIO', 'salario'));
  caso.funcao = pick(d, 'FUNCAO', 'cargo') || r1.cargo || '';
  caso.tipo_dispensa = mapearTipoDispensa(pick(d, 'tipo_dispensa', 'TIPO_DISPENSA'));

  // RECL1_ESCALA_HORARIO (campo novo) traz escala + horário juntos
  // ("12x36 — das 19h às 07h") e serve de reserva para os dois campos.
  const escalaHorario1 = String(pick(d, 'RECL1_ESCALA_HORARIO') || '').trim();
  caso.escala = pick(d, 'escala', 'ESCALA') || r1.escala
    || (/(\d+\s*x\s*\d+)/i.exec(escalaHorario1)?.[1] || '').replace(/\s+/g, '')
    || '';
  caso.jornada_horario = pick(d, 'JORNADA_HORARIO', 'jornada_horario')
    || escalaHorario1.split(/[—–-]/).slice(1).join('-').trim();
  if (d.horas_extras) {
    caso.jornada_extrapola = true;
    caso.jornada_freq_extra = pick(d, 'JORNADA_FREQ_EXTRA', 'media_horas_extras');
    // Antes: tol.map(...).join(' — '), que com os dois períodos iguais produzia
    // "30 minutos de tolerância — 30 minutos de tolerância" — saiu assim na peça
    // do Marcos e a revisora marcou o trecho. Agora descreve as POSIÇÕES.
    const antes = d.periodo_antecedente ? String(d.periodo_antecedente).trim() : '';
    const depois = d.periodo_sucedente ? String(d.periodo_sucedente).trim() : '';
    if (antes && depois) {
      caso.prorrogacao_jornada = `${antes} antes e ${depois} depois`;
    } else if (antes || depois) {
      caso.prorrogacao_jornada = `${antes || depois} ${antes ? 'antes' : 'depois'}`;
    }
  }
  if (d.intervalo_suprimido) {
    caso.intervalo_gozado = false;
    // O campo entra na frase "concessão parcial do intervalo ... de X", então só
    // aceita DURAÇÃO. Na peça do Marcos a entrevista havia posto "Rádio HT
    // sempre ligado" neste campo e a frase saiu sem sentido no documento.
    // Detalhe que não é duração vai para observação, não para o texto da peça.
    // O campo do formulário pode trazer DURAÇÃO ("15 minutos") ou a CONDIÇÃO em
    // que o intervalo era usufruído ("sempre à disposição com rádio HT ligado").
    // Antes só a duração era aproveitada e a condição virava observação: o token
    // {{INTERVALO_USUFRUIDO}} saía vazio na peça (caso do Carlos Gabriel). Agora
    // os dois casos preenchem o campo — quem ajusta a frase é dadosTemplate.
    const det = String(pick(d, 'INTERVALO_USUFRUIDO', 'INTERVALO_GOZADO', 'intervalo_detalhes') || '').trim();
    if (det) caso.intervalo_usufruido = det.slice(0, 300);
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
  // VALOR_POR_FORA agora é campo próprio no formulário. Ele COMPLEMENTA: quando
  // informado, é o valor mensal pago por fora e prevalece — o val_ft é valor POR
  // FOLGA e servia só como aproximação. A dedução antiga fica como fallback,
  // para as entrevistas que não trazem o campo.
  const porForaInformado = parseRange(pick(d, 'VALOR_POR_FORA', 'valor_por_fora'));
  if (porForaInformado) {
    caso.valor_por_fora = porForaInformado;
    caso.tem_integracao_por_fora = true;
  }
  if (caso.tem_integracao_por_fora && !caso.valor_por_fora && caso.val_ft) {
    caso.valor_por_fora = caso.val_ft;
  }

  // SALÁRIOS EM ABERTO: o cálculo (mathUtils) e o capítulo do modelo já
  // existiam, faltava a pergunta. `salarios_aberto` é o texto que sai na peça
  // ("outubro e novembro/2025"); `salarios_aberto_qtd` é o que multiplica pelo
  // salário. A flag liga com qualquer um dos dois — se vier só o texto, o
  // capítulo sai e o valor fica a apurar, que é a estratégia já usada nas
  // demais verbas sem número.
  const salAbertoTxt = String(pick(d, 'SALARIOS_ABERTO', 'salarios_aberto') || '').trim();
  const salAbertoQtd = parseRange(pick(d, 'SALARIOS_ABERTO_QTD', 'salarios_aberto_qtd'));
  if (salAbertoTxt) caso.salarios_aberto = salAbertoTxt;
  if (salAbertoQtd) caso.salarios_aberto_qtd = salAbertoQtd;
  if (salAbertoTxt || salAbertoQtd) caso.tem_salarios_aberto = true;

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
  // Percentuais informados na entrevista (campos novos) — quando ausentes o
  // cálculo segue com o grau legal padrão.
  const pctInsal = parseRange(pick(d, 'insalubridade_porcentagem'));
  if (pctInsal) caso.insalubridade_percentual = pctInsal;
  const pctPeric = parseRange(pick(d, 'periculosidade_porcentagem'));
  if (pctPeric) caso.periculosidade_percentual = pctPeric;

  // DESCONTOS INDEVIDOS (campos novos): entram como fato do dano moral e como
  // pedido de restituição. `desconto_qual` descreve o desconto.
  if (d.desconto_indevido) {
    caso.tem_desconto_indevido = true;
    const qual = String(pick(d, 'desconto_qual') || '').trim();
    if (qual) caso.desconto_descricao = qual.slice(0, 300);
  }

  // Superior hierárquico apontado na entrevista (campo novo) — é quem a
  // narrativa do dano moral identifica como autor da perseguição.
  const responsavel = String(pick(d, 'RESPONSAVEL_HIERARQUICO', 'dano_supervisor') || '').trim();
  if (responsavel) caso.dano_supervisor = responsavel;
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