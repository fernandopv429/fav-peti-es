/**
 * Geração determinística de DOCX para os modelos Porteiro/Controlador de Acesso
 * (SIEMACO e SINDEEPRES). Pipeline IDÊNTICO ao gerarDocxVigilante, com montarDadosTemplate
 * estendido para incluir as flags booleanas específicas do porteiro.
 */
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { valorPorExtenso } from "./valorPorExtenso.js";
import { fetchDocxViaBackend } from "./fetchDocxViaBackend.js";
import { applyCleanToZip, validateFinalDocx } from "./cleanDocxXml.js";

/**
 * Monta o objeto de dados com todos os tokens esperados pelo modelo Porteiro.
 * Inclui todas as flags booleanas do Vigilante + flags específicas porteiro.
 * @param {object} dados — objeto CasoVigilante completo (com flags do ConfirmarTesesPorteiro)
 */
function montarDadosTemplate(dados) {
  const vp = dados.valores_pedidos || {};

  const SALARIO_EXT    = valorPorExtenso(dados.SALARIO || "");
  const VALOR_CAUSA_EXT = valorPorExtenso(dados.VALOR_CAUSA || "");

  // Derivação determinística REGIAO_TRT por tabela UF→TRT (sem IA)
  const UF_TRT = {
    SP:"SEGUNDA REGIÃO",RJ:"PRIMEIRA REGIÃO",MG:"TERCEIRA REGIÃO",RS:"QUARTA REGIÃO",
    BA:"QUINTA REGIÃO",PE:"SEXTA REGIÃO",CE:"SÉTIMA REGIÃO",PA:"OITAVA REGIÃO",
    AM:"OITAVA REGIÃO",PR:"NONA REGIÃO",DF:"DÉCIMA REGIÃO",SC:"DÉCIMA SEGUNDA REGIÃO",
    PB:"DÉCIMA TERCEIRA REGIÃO",RO:"DÉCIMA QUARTA REGIÃO",AC:"DÉCIMA QUARTA REGIÃO",
    MA:"DÉCIMA SEXTA REGIÃO",ES:"DÉCIMA SÉTIMA REGIÃO",GO:"DÉCIMA OITAVA REGIÃO",
    AL:"DÉCIMA NONA REGIÃO",SE:"VIGÉSIMA REGIÃO",RN:"VIGÉSIMA PRIMEIRA REGIÃO",
    PI:"VIGÉSIMA SEGUNDA REGIÃO",MS:"VIGÉSIMA QUARTA REGIÃO",TO:"VIGÉSIMA SÉTIMA REGIÃO",
    AP:"OITAVA REGIÃO",RR:"DÉCIMA PRIMEIRA REGIÃO",
  };
  let regiaoTrt = dados.REGIAO_TRT || "";
  if (!regiaoTrt && dados.COMARCA_UF) {
    const ufM = dados.COMARCA_UF.toUpperCase().match(/\b([A-Z]{2})$/);
    const uf = ufM?.[1];
    if (uf && UF_TRT[uf]) regiaoTrt = UF_TRT[uf];
  }

  const campos = {
    COMARCA_UF:            dados.COMARCA_UF || "",
    REGIAO_TRT:            regiaoTrt,
    FORO_COMPETENCIA:      dados.FORO_COMPETENCIA || "",
    LOCAL_PRESTACAO:       dados.LOCAL_PRESTACAO || "",
    LOCAL_PRESTACAO_COMPL: dados.LOCAL_PRESTACAO_COMPL || "",
    RECL_NOME:             dados.RECL_NOME || "",
    RECL_NACIONALIDADE:    dados.RECL_NACIONALIDADE || "brasileiro",
    RECL_ESTADOCIVIL:      dados.RECL_ESTADOCIVIL || "",
    RECL_RG:               dados.RECL_RG || "",
    RECL_PIS:              dados.RECL_PIS || "",
    RECL_SERIE:            dados.RECL_SERIE || "",
    RECL_CTPS:             dados.RECL_CTPS || "",
    RECL_CPF:              dados.RECL_CPF || "",
    RECL_NASC:             dados.RECL_NASC || "",
    RECL_FILIACAO:         dados.RECL_FILIACAO || "",
    RECL_ENDERECO:         dados.RECL_ENDERECO || "",
    RECL_CEP:              dados.RECL_CEP || "",
    RECL1_NOME:            dados.RECL1_NOME || "",
    RECL1_CNPJ:            dados.RECL1_CNPJ || "",
    RECL1_LOGRADOURO:      dados.RECL1_LOGRADOURO || "",
    RECL1_ENDCOMPL:        dados.RECL1_ENDCOMPL || "",
    RECL2_NOME:            dados.RECL2_NOME || "",
    RECL2_CNPJ:            dados.RECL2_CNPJ || "",
    RECL2_LOGRADOURO:      dados.RECL2_LOGRADOURO || "",
    RECL2_ENDCOMPL:        dados.RECL2_ENDCOMPL || "",
    RECL3_NOME:            dados.RECL3_NOME || "",
    RECL3_CNPJ:            dados.RECL3_CNPJ || "",
    RECL3_LOGRADOURO:      dados.RECL3_LOGRADOURO || "",
    RECL3_ENDCOMPL:        dados.RECL3_ENDCOMPL || "",
    DATA_ADMISSAO:         dados.DATA_ADMISSAO || "",
    FUNCAO:                dados.FUNCAO || "Porteiro",
    DATA_RESCISAO:         dados.DATA_RESCISAO || "",
    SALARIO:               dados.SALARIO || "",
    SALARIO_EXT,
    JORNADA_HORARIO:       dados.JORNADA_HORARIO || "",
    JORNADA_EXTRAPOLA:     dados.JORNADA_EXTRAPOLA || "",
    JORNADA_FREQ_EXTRA:    dados.JORNADA_FREQ_EXTRA || "",
    INTERVALO_GOZADO:      dados.INTERVALO_GOZADO || "",
    CCT_VIGENCIA:          dados.CCT_VIGENCIA || "",
    ADIC_CONV:             dados.ADIC_CONV || "",
    VAL_FT:                dados.VAL_FT || "",
    VAL_CONDUCAO:          dados.VAL_CONDUCAO || "",
    VAL_ALIMENTACAO:       dados.VAL_ALIMENTACAO || "",
    VALOR_CAUSA:           dados.VALOR_CAUSA || "",
    VALOR_CAUSA_EXT,
    LOCAL_DATA_ASSINATURA: dados.LOCAL_DATA_ASSINATURA || "",
  };

  // Pedidos P01–P87
  for (let i = 1; i <= 87; i++) {
    const key = `P${String(i).padStart(2, "0")}`;
    campos[key] = vp[key] || "";
  }

  // ── Flags de rescisão (mutuamente exclusivas) ────────────────────────────
  // Lê diretamente as flags booleanas do objeto (vindas do ConfirmarTesesPorteiro),
  // com fallback para o campo legado TIPO_RESCISAO.
  const tipo = dados.TIPO_RESCISAO || "";
  campos.t_dispensa = !!(dados.t_dispensa ?? (tipo === "dispensa_sem_justa_causa"));
  campos.t_coacao   = !!(dados.t_coacao   ?? (tipo === "pedido_demissao"));
  campos.t_indireta = !!(dados.t_indireta ?? (tipo === "rescisao_indireta"));
  campos.t_reversao = !!(dados.t_reversao ?? (tipo === "reversao_justa_causa"));
  // alias usado pelo modelo Vigilante (compatibilidade)
  campos.t_demissao = campos.t_coacao;

  // ── Flags de jornada ─────────────────────────────────────────────────────
  campos.jornada_12x36 = !!(dados.jornada_12x36);
  campos.jornada_5x2   = !!(dados.jornada_5x2);
  // Garante que pelo menos uma esteja marcada se nenhuma foi definida
  if (!campos.jornada_12x36 && !campos.jornada_5x2) campos.jornada_5x2 = true;

  // ── Flags opcionais ──────────────────────────────────────────────────────
  campos.tem_2a_reclamada     = !!(dados.tem_2a_reclamada || dados.RECL2_NOME);
  campos.tem_3a_reclamada     = !!(dados.tem_3a_reclamada || dados.RECL3_NOME);
  campos.ente_publico         = !!(dados.ente_publico);
  campos.comp_portaria        = !!(dados.comp_portaria);
  campos.tem_descaracterizacao= !!(dados.tem_descaracterizacao);
  campos.tem_subsidiaria      = campos.tem_2a_reclamada; // alias
  campos.tem_desvio           = !!(dados.tem_acumulo || dados.acumulo_funcao);
  campos.tem_acumulo          = campos.tem_desvio;
  campos.tem_adic_noturno     = !!(dados.tem_adic_noturno);
  campos.tem_insalubridade    = !!(dados.tem_insalubridade);
  campos.tem_periculosidade   = !!(dados.tem_periculosidade);
  campos.tem_pericia          = !!(campos.tem_insalubridade || campos.tem_periculosidade);
  campos.tem_assiduidade      = !!(dados.tem_assiduidade);
  campos.tem_doenca           = !!(dados.tem_doenca);

  return campos;
}

/**
 * Baixa o modelo .docx, limpa instruções internas, substitui os tokens e retorna o blob.
 * Pipeline IDÊNTICO ao gerarDocxVigilante — mesma sequência de passos.
 * @param {string} modeloDocxUrl — URL do .docx oficial tokenizado
 * @param {object} dados — CasoVigilante + flags do modal de teses
 * @returns {{ blob: Blob, tokensFaltando: string[] }}
 */
export async function gerarDocxPorteiro(modeloDocxUrl, dados) {
  // 1. Baixa o arquivo modelo (via backend proxy para evitar CORS no app publicado)
  let arrayBuffer;
  if (modeloDocxUrl.startsWith("data:")) {
    const base64 = modeloDocxUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    arrayBuffer = bytes.buffer;
  } else {
    arrayBuffer = await fetchDocxViaBackend(modeloDocxUrl);
  }

  // 2. Monta os dados do template (flags normalizadas para boolean)
  const dadosTemplate = montarDadosTemplate(dados);

  // 3. Carrega no PizZip e aplica limpeza do XML
  const zip = new PizZip(arrayBuffer);
  applyCleanToZip(zip, dadosTemplate);

  // 4. Inicializa Docxtemplater
  const tokensFaltando = [];
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: (part) => {
      if (part?.module === undefined && part?.value) {
        tokensFaltando.push(part.value);
      }
      return "";
    },
    errorLogging: false,
  });

  // 5. Injeta os dados
  doc.render(dadosTemplate);

  // 6. Validação final — apenas artefatos estruturais lançam erro;
  // tokens essenciais vazios viram warnings em tokensFaltando (não abortam a geração).
  const finalZip = doc.getZip();
  const { errors } = validateFinalDocx(finalZip, dadosTemplate);
  // Separa erros estruturais (corrompem o XML) de avisos de tokens vazios
  const structuralErrors = errors.filter(e => !e.startsWith("Token essencial"));
  const tokenWarnings = errors.filter(e => e.startsWith("Token essencial"));
  if (structuralErrors.length > 0) {
    throw new Error("Validação falhou: " + structuralErrors.join("; "));
  }
  // Tokens essenciais vazios → avisa mas não aborta
  tokenWarnings.forEach(w => tokensFaltando.push(w));

  // 7. Gera o blob
  const blob = finalZip.generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });

  return { blob, tokensFaltando };
}