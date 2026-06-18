/**
 * Geração determinística de DOCX para o modelo Vigilante 12x36.
 * Usa pizzip + docxtemplater para substituir {{tokens}} no arquivo oficial.
 * NÃO usa IA — apenas substituição de tokens.
 */
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { valorPorExtenso } from "./valorPorExtenso.js";
import { fetchDocxViaBackend } from "./fetchDocxViaBackend.js";
import { applyCleanToZip, validateFinalDocx } from "./cleanDocxXml.js";
import { derivarFlags } from "./derivarFlags.js";

/**
 * Monta o objeto de dados com todos os tokens esperados pelo modelo oficial.
 * @param {object} dados — objeto CasoVigilante completo
 */
function montarDadosTemplate(dados) {
  const vp = dados.valores_pedidos || {};

  // Tokens de valor por extenso
  const SALARIO_EXT = valorPorExtenso(dados.SALARIO || "");
  const VALOR_CAUSA_EXT = valorPorExtenso(dados.VALOR_CAUSA || "");

  // Todos os campos principais
  const campos = {
    COMARCA_UF:           dados.COMARCA_UF || "",
    REGIAO_TRT:           dados.REGIAO_TRT || "",
    FORO_COMPETENCIA:     dados.FORO_COMPETENCIA || "",
    LOCAL_PRESTACAO:      dados.LOCAL_PRESTACAO || "",
    LOCAL_PRESTACAO_COMPL:dados.LOCAL_PRESTACAO_COMPL || "",
    RECL_NOME:            dados.RECL_NOME || "",
    RECL_NACIONALIDADE:   dados.RECL_NACIONALIDADE || "brasileiro",
    RECL_ESTADOCIVIL:     dados.RECL_ESTADOCIVIL || "",
    RECL_RG:              dados.RECL_RG || "",
    RECL_PIS:             dados.RECL_PIS || "",
    RECL_SERIE:           dados.RECL_SERIE || "",
    RECL_CTPS:            dados.RECL_CTPS || "",
    RECL_CPF:             dados.RECL_CPF || "",
    RECL_NASC:            dados.RECL_NASC || "",
    RECL_FILIACAO:        dados.RECL_FILIACAO || "",
    RECL_ENDERECO:        dados.RECL_ENDERECO || "",
    RECL_CEP:             dados.RECL_CEP || "",
    RECL1_NOME:           dados.RECL1_NOME || "",
    RECL1_CNPJ:           dados.RECL1_CNPJ || "",
    RECL1_LOGRADOURO:     dados.RECL1_LOGRADOURO || "",
    RECL1_ENDCOMPL:       dados.RECL1_ENDCOMPL || "",
    RECL2_NOME:           dados.RECL2_NOME || "",
    RECL2_CNPJ:           dados.RECL2_CNPJ || "",
    RECL2_LOGRADOURO:     dados.RECL2_LOGRADOURO || "",
    RECL2_ENDCOMPL:       dados.RECL2_ENDCOMPL || "",
    RECL3_NOME:           dados.RECL3_NOME || "",
    RECL3_CNPJ:           dados.RECL3_CNPJ || "",
    RECL3_LOGRADOURO:     dados.RECL3_LOGRADOURO || "",
    RECL3_ENDCOMPL:       dados.RECL3_ENDCOMPL || "",
    DATA_ADMISSAO:        dados.DATA_ADMISSAO || "",
    FUNCAO:               dados.FUNCAO || "Vigilante",
    DATA_RESCISAO:        dados.DATA_RESCISAO || "",
    SALARIO:              dados.SALARIO || "",
    SALARIO_EXT,
    JORNADA_HORARIO:      dados.JORNADA_HORARIO || "",
    JORNADA_EXTRAPOLA:    dados.JORNADA_EXTRAPOLA || "",
    JORNADA_FREQ_EXTRA:   dados.JORNADA_FREQ_EXTRA || "",
    INTERVALO_GOZADO:     dados.INTERVALO_GOZADO || "",
    CCT_VIGENCIA:         dados.CCT_VIGENCIA || "2024/2025",
    ADIC_CONV:            dados.ADIC_CONV || "60%",
    VAL_FT:               dados.VAL_FT || "",
    VAL_CONDUCAO:         dados.VAL_CONDUCAO || "",
    VAL_ALIMENTACAO:      dados.VAL_ALIMENTACAO || "",
    VALOR_CAUSA:          dados.VALOR_CAUSA || "",
    VALOR_CAUSA_EXT,
    LOCAL_DATA_ASSINATURA:dados.LOCAL_DATA_ASSINATURA || "",
  };

  // Adiciona P01 a P87
  for (let i = 1; i <= 87; i++) {
    const key = `P${String(i).padStart(2, "0")}`;
    campos[key] = vp[key] || "";
  }

  // ── Flags booleanas — 100% determinísticas via derivarFlags ──────────────
  const flags = derivarFlags(dados, "vigilante");
  Object.assign(campos, flags);

  return campos;
}

/**
 * Baixa o modelo .docx, limpa instruções internas, substitui os tokens e retorna o blob.
 * @param {string} modeloDocxUrl — URL do .docx oficial tokenizado
 * @param {object} dados — CasoVigilante
 * @returns {{ blob: Blob, tokensFaltando: string[] }}
 */
export async function gerarDocxVigilante(modeloDocxUrl, dados) {
  // 1. Baixa o arquivo modelo como ArrayBuffer (via backend para evitar CORS no app publicado)
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

  // 2. Monta os dados do template (necessário antes da limpeza — flags condicionais são usadas)
  const dadosTemplate = montarDadosTemplate(dados);

  // 3. Carrega no PizZip e aplica limpeza do XML:
  //    remove preâmbulo de instruções, marcadores ▸, notas ℹ e blocos condicionais inativos
  const zip = new PizZip(arrayBuffer);
  applyCleanToZip(zip, dadosTemplate);

  // 4. Inicializa Docxtemplater com delimitadores {{}}
  const tokensFaltando = [];
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
    // nullGetter: retorna "" para QUALQUER token ausente — nunca lança erro
    nullGetter: (part) => {
      if (part && part.module === undefined && part.value) {
        tokensFaltando.push(part.value);
      }
      return "";
    },
    // errorLogging: false evita que erros de template interrompam o render
    errorLogging: false,
  });

  // 5. Injeta os dados
  doc.render(dadosTemplate);

  // 6. Validação final — verifica artefatos e tokens essenciais
  const finalZip = doc.getZip();
  const { valid, errors } = validateFinalDocx(finalZip, dadosTemplate);
  if (!valid) {
    // Lança erro com detalhes para o caller registrar no ErrorLog
    throw new Error("Validação falhou: " + errors.join("; "));
  }

  // 7. Gera o blob
  const blob = finalZip.generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });

  return { blob, tokensFaltando };
}