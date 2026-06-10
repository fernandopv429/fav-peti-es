/**
 * extrairDadosDocumentos — Extração estruturada de dados de PDFs/documentos usando OCR nativo.
 * Usa Core.ExtractDataFromUploadedFile para cada documento e mescla resultados.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAMPOS = ["RECL_NOME","RECL_NACIONALIDADE","RECL_ESTADOCIVIL","RECL_RG","RECL_PIS","RECL_SERIE","RECL_CTPS","RECL_CPF","RECL_NASC","RECL_FILIACAO","RECL_ENDERECO","RECL_CEP","RECL1_NOME","RECL1_CNPJ","RECL1_LOGRADOURO","RECL1_ENDCOMPL","RECL2_NOME","RECL2_CNPJ","RECL2_LOGRADOURO","RECL2_ENDCOMPL","RECL3_NOME","RECL3_CNPJ","RECL3_LOGRADOURO","RECL3_ENDCOMPL","COMARCA_UF","REGIAO_TRT","FORO_COMPETENCIA","LOCAL_PRESTACAO","LOCAL_PRESTACAO_COMPL","DATA_ADMISSAO","FUNCAO","DATA_RESCISAO","SALARIO","JORNADA_HORARIO","JORNADA_EXTRAPOLA","JORNADA_FREQ_EXTRA","INTERVALO_GOZADO","CCT_VIGENCIA","ADIC_CONV","VAL_FT","VAL_CONDUCAO","VAL_ALIMENTACAO"];

const SCHEMA = {
  type: "object",
  properties: Object.fromEntries(CAMPOS.map(c => [c, { type: "string" }])),
};

// Campos com default que não contam como "extraídos"
const CAMPOS_COM_DEFAULT = new Set(["RECL_NACIONALIDADE"]);
const DEFAULTS = { RECL_NACIONALIDADE: "brasileiro" };

function isVisualFile(url) {
  const lower = (url || "").toLowerCase().split("?")[0];
  return lower.endsWith(".pdf") || lower.endsWith(".png") || lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") || lower.endsWith(".webp") || lower.endsWith(".gif");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nao autorizado" }, { status: 401 });

    const { casoVigilanteId, documentUrls } = await req.json();
    if (!documentUrls || documentUrls.length === 0) {
      return Response.json({ error: "Sem documentos", campos: {}, totalExtraidos: 0 });
    }

    // Lê campos já salvos na ficha para merge acumulativo
    let camposExistentes = {};
    if (casoVigilanteId) {
      try {
        const fichas = await base44.asServiceRole.entities.CasoVigilante.filter({ id: casoVigilanteId });
        if (fichas?.[0]) {
          for (const c of CAMPOS) {
            if (fichas[0][c]) camposExistentes[c] = fichas[0][c];
          }
        }
      } catch (_) {}
    }

    const merged = { ...camposExistentes };
    const docsFalharam = [];

    // Processa CADA documento individualmente
    for (let i = 0; i < documentUrls.length; i++) {
      const url = documentUrls[i];
      const nomeDoc = `Documento ${i + 1}`;

      try {
        // Usa ExtractDataFromUploadedFile (OCR nativo para PDFs escaneados)
        const resultado = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
          file_url: url,
          json_schema: SCHEMA,
        });

        // Verifica se houve erro na extração
        if (resultado.status !== "success" || !resultado.output) {
          docsFalharam.push({ url, nome: nomeDoc, erro: resultado.details || "status != success" });
          
          await base44.asServiceRole.entities.ErrorLog.create({
            context: "extracao_documentos",
            error_type: "api",
            message: `Falha ao extrair dados de ${nomeDoc}: ${resultado.details || "status != success"}`,
            resolved: false,
            occurred_at: new Date().toISOString(),
          }).catch(() => {});
          
          continue;
        }

        // Verifica se o resultado veio vazio ou apenas com defaults
        const output = resultado.output;
        let camposPreenchidosNesteDoc = 0;

        for (const [key, value] of Object.entries(output)) {
          // Ignora campos que são apenas o default do schema
          if (CAMPOS_COM_DEFAULT.has(key) && value === DEFAULTS[key]) continue;
          
          // Só considera se o valor for não-vazio e diferente do default
          if (value && String(value).trim() && String(value).trim() !== DEFAULTS[key]) {
            if (!merged[key]) {
              merged[key] = String(value).trim();
              camposPreenchidosNesteDoc++;
            }
          }
        }

        // Se nenhum campo foi preenchido, registra como falha silenciosa
        if (camposPreenchidosNesteDoc === 0) {
          docsFalharam.push({
            url,
            nome: nomeDoc,
            erro: "Nenhum campo extraído (resultado vazio ou apenas defaults)",
          });

          await base44.asServiceRole.entities.ErrorLog.create({
            context: "extracao_documentos",
            error_type: "api",
            message: `Documento ${nomeDoc} não retornou dados úteis. Raw: ${JSON.stringify(output).slice(0, 500)}`,
            resolved: false,
            occurred_at: new Date().toISOString(),
          }).catch(() => {});
        }
      } catch (err) {
        docsFalharam.push({ url, nome: nomeDoc, erro: err.message });
        
        await base44.asServiceRole.entities.ErrorLog.create({
          context: "extracao_documentos",
          error_type: "api",
          message: `Erro ao processar ${nomeDoc}: ${err.message}`,
          resolved: false,
          occurred_at: new Date().toISOString(),
        }).catch(() => {});
      }
    }

    // Filtra apenas campos válidos (não-vazios)
    const extraidos = Object.fromEntries(
      Object.entries(merged).filter(([, v]) => v && String(v).trim())
    );

    const totalExtraidos = Object.keys(extraidos).length;

    // Salva na ficha (se houver ID e dados extraídos)
    if (casoVigilanteId && totalExtraidos > 0) {
      await base44.asServiceRole.entities.CasoVigilante.update(casoVigilanteId, {
        ...extraidos,
        status: "preenchido",
      });
    }

    // Prepara mensagem de alerta
    let alerta = null;
    if (docsFalharam.length > 0) {
      alerta = `Atenção: ${docsFalharam.length} documento(s) não puderam ser lidos. Verifique se estão legíveis.`;
    }
    if (totalExtraidos === 0 && documentUrls.length > 0) {
      alerta = "Nenhum dado foi extraído. Verifique se os documentos contêm CTPS, holerites ou entrevista.";
    }

    return Response.json({ 
      campos: extraidos, 
      totalExtraidos,
      alerta,
      docsFalharam: docsFalharam.length > 0 ? docsFalharam : undefined,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});