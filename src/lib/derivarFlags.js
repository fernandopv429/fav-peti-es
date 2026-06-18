/**
 * derivarFlags — lógica determinística ÚNICA para calcular todas as flags
 * booleanas de um caso a partir dos dados estruturados (CasoVigilante).
 *
 * Usada por:
 *  - gerarDocxVigilante.js  (montarDadosTemplate)
 *  - gerarDocxPorteiro.js   (montarDadosTemplate)
 *  - ConfirmarTeses.jsx     (buildInitialFlags)
 *  - ConfirmarTesesPorteiro.jsx (buildInitialFlags)
 *
 * Regras (especificação do usuário):
 *  1. TIPO DE SAÍDA — campo tipo_dispensa → flags mutuamente exclusivas t_*
 *     sem_justa_causa → t_dispensa
 *     reversao_justa_causa → t_reversao
 *     nulidade_pedido_demissao → t_coacao
 *     rescisao_indireta → t_indireta
 *     (aliases legados também aceitos: dispensa_sem_justa_causa, pedido_demissao)
 *
 *  2. RECLAMADAS — tem_2a_reclamada = RECL2_NOME preenchido
 *                  tem_3a_reclamada = RECL3_NOME preenchido
 *
 *  3. FUNÇÃO ACESSÓRIA (acumulo_funcao)
 *     perfil "vigilante"                → tem_desvio = true  (multa 50% CCT)
 *     perfis "porteiro"|"controlador"|"limpeza" → tem_acumulo = true (20% CLT)
 *
 *  4. ADICIONAL NOTURNO — tem_adic_noturno = jornada cruza 22h–05h
 *
 *  5. PERICULOSIDADE
 *     perfil "vigilante" → tem_periculosidade = true por padrão
 *     demais perfis       → só true se marcado explicitamente no caso
 *
 *  6. INSALUBRIDADE — tem_insalubridade, GRAU_INSALUBRIDADE, INSALUBRIDADE_FATOS
 *
 *  7. FLAGS DE FATO — tem_ft, tem_vt_folgas, tem_va_folgas, tem_he_folgas
 *     derivados de VAL_FT, VAL_CONDUCAO, VAL_ALIMENTACAO preenchidos
 *
 * @param {object} d        — dados do CasoVigilante
 * @param {string} perfil   — "vigilante" | "porteiro" | "controlador" | "limpeza" | ""
 * @returns {object}        — flags booleanas prontas para injetar no template
 */

// Mapa tipo_dispensa → flag interna (aceita campo estruturado e aliases legados)
const TIPO_DISPENSA_MAP = {
  sem_justa_causa:          "t_dispensa",
  reversao_justa_causa:     "t_reversao",
  nulidade_pedido_demissao: "t_coacao",
  rescisao_indireta:        "t_indireta",
  // aliases legados (string da tela antiga)
  dispensa_sem_justa_causa: "t_dispensa",
  pedido_demissao:          "t_coacao",
};

/**
 * Detecta se a jornada cruza o período noturno (22h–05h).
 * Aceita formatos: "18:30 às 07:30", "22h00 a 06h00", "22:00-06:00" etc.
 */
function detectarNoturno(jornada) {
  if (!jornada) return false;
  // Extrai todos os horários HH:MM ou HHhMM presentes na string
  const matches = jornada.match(/\b(\d{1,2})[h:](\d{2})\b/g) || [];
  const horas = matches.map(m => {
    const [h, min] = m.replace("h", ":").split(":").map(Number);
    return h + min / 60;
  });
  if (horas.length === 0) return false;
  // Se qualquer hora estiver no intervalo [22, 24) ou [0, 5]
  return horas.some(h => h >= 22 || h < 5);
}

/**
 * Deriva perfil a partir da função (FUNCAO) e de um hint externo (perfilHint).
 * Retorna "vigilante" | "porteiro" | "controlador" | "limpeza" | "generico"
 */
export function derivarPerfil(funcao, perfilHint) {
  const f = (funcao || perfilHint || "").toLowerCase();
  if (/vigilante/i.test(f)) return "vigilante";
  if (/porteiro/i.test(f))  return "porteiro";
  if (/controlador|controladora/i.test(f)) return "controlador";
  if (/limpeza|copeira|auxiliar\s+de\s+limpeza/i.test(f)) return "limpeza";
  return "generico";
}

/**
 * Calcula TODAS as flags booleanas deterministicamente.
 * Flags já gravadas no objeto `d` têm MÁXIMA prioridade (o advogado já confirmou).
 * Derivações automáticas só preenchem o que ainda não está definido.
 *
 * @param {object} d        — dados do CasoVigilante (pode ter flags já salvas)
 * @param {string} perfil   — "vigilante" | "porteiro" | "controlador" | "limpeza" | "generico"
 * @returns {object}        — todas as flags booleanas
 */
export function derivarFlags(d, perfil) {
  const flags = {};

  // ── 1. TIPO DE RESCISÃO ─────────────────────────────────────────────────
  // Prioridade: flags booleanas já salvas > tipo_dispensa > TIPO_RESCISAO legado
  const RESCISAO_FLAGS = ["t_dispensa", "t_coacao", "t_indireta", "t_reversao"];

  // Lê flags já salvas
  RESCISAO_FLAGS.forEach(f => { flags[f] = !!(d[f]); });

  // Se nenhuma flag está marcada, derivar do campo estruturado
  if (!RESCISAO_FLAGS.some(f => flags[f])) {
    const src = d.tipo_dispensa || d.TIPO_RESCISAO || "";
    const mapped = TIPO_DISPENSA_MAP[src];
    if (mapped) {
      RESCISAO_FLAGS.forEach(f => { flags[f] = f === mapped; });
    }
  }

  // alias legado t_demissao = t_coacao (compatibilidade com template Vigilante)
  flags.t_demissao = flags.t_coacao;

  // ── 2. RECLAMADAS ────────────────────────────────────────────────────────
  flags.tem_2a_reclamada = !!(d.tem_2a_reclamada ?? (d.RECL2_NOME ? true : undefined)) ||
                            !!(d.RECL2_NOME);
  flags.tem_3a_reclamada = !!(d.tem_3a_reclamada ?? (d.RECL3_NOME ? true : undefined)) ||
                            !!(d.RECL3_NOME);
  // Subsidiária = mesma coisa que 2ª reclamada
  flags.tem_subsidiaria  = flags.tem_2a_reclamada;

  // ── 3. FUNÇÃO ACESSÓRIA ──────────────────────────────────────────────────
  const temAcumulo = !!(d.acumulo_funcao || d.tem_acumulo || d.tem_desvio);
  if (perfil === "vigilante") {
    // Vigilante: desvio de função (multa 50% CCT cláusula 64ª)
    flags.tem_desvio  = d.tem_desvio !== undefined ? !!(d.tem_desvio)  : temAcumulo;
    flags.tem_acumulo = flags.tem_desvio; // alias
  } else {
    // Porteiro / Controlador / Limpeza: acúmulo de função (20% CLT)
    flags.tem_acumulo = d.tem_acumulo !== undefined ? !!(d.tem_acumulo) : temAcumulo;
    flags.tem_desvio  = flags.tem_acumulo; // alias
  }

  // ── 4. ADICIONAL NOTURNO ─────────────────────────────────────────────────
  // Prioridade: campo explícito > derivação automática da jornada
  if (d.tem_adic_noturno !== undefined) {
    flags.tem_adic_noturno = !!(d.tem_adic_noturno);
  } else {
    flags.tem_adic_noturno = detectarNoturno(d.JORNADA_HORARIO);
  }

  // ── 5. PERICULOSIDADE ────────────────────────────────────────────────────
  if (perfil === "vigilante") {
    // Vigilante: periculosidade é padrão (arma de fogo → art. 193 CLT)
    flags.tem_periculosidade = d.tem_periculosidade !== undefined
      ? !!(d.tem_periculosidade)
      : true; // padrão ligado
  } else {
    // Demais: só quando explicitamente marcado
    flags.tem_periculosidade = !!(d.tem_periculosidade);
  }

  // ── 6. INSALUBRIDADE ─────────────────────────────────────────────────────
  flags.tem_insalubridade    = !!(d.tem_insalubridade);
  flags.GRAU_INSALUBRIDADE   = d.GRAU_INSALUBRIDADE   || (flags.tem_insalubridade ? "médio" : "");
  flags.INSALUBRIDADE_FATOS  = d.INSALUBRIDADE_FATOS  || "";

  // tem_pericia = insalubridade OR periculosidade
  flags.tem_pericia = !!(flags.tem_insalubridade || flags.tem_periculosidade);

  // ── 7. FLAGS DE FATO ─────────────────────────────────────────────────────
  // FTs (folgas trabalhadas) — ativas se VAL_FT preenchido ou flag explícita
  flags.tem_ft = d.tem_ft !== undefined
    ? !!(d.tem_ft)
    : !!(d.VAL_FT && String(d.VAL_FT).trim());

  // VT em folgas — ativo se VAL_CONDUCAO preenchido ou flag explícita
  flags.tem_vt_folgas = d.tem_vt_folgas !== undefined
    ? !!(d.tem_vt_folgas)
    : !!(d.VAL_CONDUCAO && String(d.VAL_CONDUCAO).trim());

  // VA em folgas — ativo se VAL_ALIMENTACAO preenchido ou flag explícita
  flags.tem_va_folgas = d.tem_va_folgas !== undefined
    ? !!(d.tem_va_folgas)
    : !!(d.VAL_ALIMENTACAO && String(d.VAL_ALIMENTACAO).trim());

  // HE em folgas/feriados 100% — ativo se tem FTs
  flags.tem_he_folgas = d.tem_he_folgas !== undefined
    ? !!(d.tem_he_folgas)
    : flags.tem_ft;

  // ── 8. FLAGS ESPECÍFICAS PORTEIRO ────────────────────────────────────────
  flags.ente_publico          = !!(d.ente_publico) && flags.tem_2a_reclamada;
  flags.comp_portaria         = !!(d.comp_portaria);
  flags.tem_descaracterizacao = !!(d.tem_descaracterizacao);
  flags.tem_assiduidade       = !!(d.tem_assiduidade);
  flags.tem_doenca            = !!(d.tem_doenca);

  // ── 9. JORNADA (porteiro) ─────────────────────────────────────────────────
  if (d.jornada_12x36 !== undefined || d.jornada_5x2 !== undefined) {
    flags.jornada_12x36 = !!(d.jornada_12x36);
    flags.jornada_5x2   = !!(d.jornada_5x2);
  } else {
    const is12x36 = /12[x×]36/i.test(d.JORNADA_HORARIO || "");
    flags.jornada_12x36 = is12x36;
    flags.jornada_5x2   = !is12x36;
  }
  if (!flags.jornada_12x36 && !flags.jornada_5x2) flags.jornada_5x2 = true;

  return flags;
}