/**
 * extrairDadosDocumentos — Extração estruturada de dados de PDFs/documentos usando OCR nativo.
 * Usa Core.ExtractDataFromUploadedFile para cada documento e mescla resultados.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAMPOS = ["RECL_NOME","RECL_NACIONALIDADE","RECL_ESTADOCIVIL","RECL_RG","RECL_PIS","RECL_SERIE","RECL_CTPS","RECL_CPF","RECL_NASC","RECL_FILIACAO","RECL_ENDERECO","RECL_CEP","RECL1_NOME","RECL1_CNPJ","RECL1_LOGRADOURO","RECL1_ENDCOMPL","RECL2_NOME","RECL2_CNPJ","RECL2_LOGRADOURO","RECL2_ENDCOMPL","RECL3_NOME","RECL3_CNPJ","RECL3_LOGRADOURO","RECL3_ENDCOMPL","COMARCA_UF","REGIAO_TRT","FORO_COMPETENCIA","LOCAL_PRESTACAO","LOCAL_PRESTACAO_COMPL","DATA_ADMISSAO","FUNCAO","DATA_RESCISAO","SALARIO","JORNADA_HORARIO","JORNADA_EXTRAPOLA","JORNADA_FREQ_EXTRA","INTERVALO_GOZADO","CCT_VIGENCIA","ADIC_CONV","VAL_FT","VAL_CONDUCAO","VAL_ALIMENTACAO"];

// Campos booleanos/enum extraídos da entrevista padrão do escritório
const CAMPOS_ENTREVISTA = ["tipo_dispensa", "acumulo_funcao", "tem_insalubridade", "tem_periculosidade", "tem_adic_noturno"];

const SCHEMA = {
  type: "object",
  properties: {
    ...Object.fromEntries(CAMPOS.map(c => [c, { type: "string" }])),
    // Seção 1 — Tipo de Dispensa (checkbox marcado na entrevista)
    tipo_dispensa: {
      type: "string",
      enum: ["sem_justa_causa", "rescisao_indireta", "nulidade_pedido_demissao", "reversao_justa_causa"],
      description: "Tipo de dispensa marcado na seção '1. Tipo de Dispensa' da entrevista: (X) Sem justa causa → sem_justa_causa | (X) Rescisão indireta → rescisao_indireta | (X) Pedido de demissão → nulidade_pedido_demissao | (X) Justa causa → reversao_justa_causa"
    },
    // Seção 8 — Acúmulo/Desvio de função
    acumulo_funcao: {
      type: "boolean",
      description: "true se a entrevista (seção 8) indicar acúmulo ou desvio de função (atividades além das atribuições contratadas)"
    },
    // Seção 13 — Insalubridade/Periculosidade
    tem_insalubridade: {
      type: "boolean",
      description: "true se a entrevista (seção 13) indicar exposição a agentes insalubres"
    },
    tem_periculosidade: {
      type: "boolean",
      description: "true se a entrevista (seção 13) indicar atividade perigosa (inflamáveis, explosivos, eletricidade, etc.)"
    },
    // Jornada noturna
    tem_adic_noturno: {
      type: "boolean",
      description: "true se JORNADA_HORARIO contiver horas entre 22:00 e 05:00 (adicional noturno art. 73 CLT)"
    },
  },
};

// Campos com default que não contam como "extraídos"
const CAMPOS_COM_DEFAULT = new Set(["RECL_NACIONALIDADE"]);
const DEFAULTS = { RECL_NACIONALIDADE: "brasileiro" };

// Campos booleanos — precisam de tratamento separado
const CAMPOS_BOOL = new Set(["acumulo_funcao", "tem_insalubridade", "tem_periculosidade", "tem_adic_noturno"]);

function isVisualFile(url) {
  const lower = (url || "").toLowerCase().split("?")[0];
  return lower.endsWith(".pdf") || lower.endsWith(".png") || lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") || lower.endsWith(".webp") || lower.endsWith(".gif");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Autenticação via createClientFromRequest já garante o contexto do usuário
    // Não é necessário chamar base44.auth.me() explicitamente

    const { casoVigilanteId, documentUrls } = await req.json();
    if (!documentUrls || documentUrls.length === 0) {
      return Response.json({ error: "Sem documentos", campos: {}, totalExtraidos: 0 });
    }

    // Lê campos já salvos na ficha para merge acumulativo
    let camposExistentes = {};
    if (casoVigilanteId) {
      try {
        // Usa service role para leitura da ficha (necessário para acesso cross-user em casos compartilhados)
        const fichas = await base44.asServiceRole.entities.CasoVigilante.filter({ id: casoVigilanteId });
        if (fichas?.[0]) {
          for (const c of CAMPOS) {
            if (fichas[0][c]) camposExistentes[c] = fichas[0][c];
          }
          // Lê também os campos da entrevista
          for (const c of CAMPOS_ENTREVISTA) {
            if (fichas[0][c] !== undefined && fichas[0][c] !== null) {
              camposExistentes[c] = fichas[0][c];
            }
          }
        }
      } catch (readErr) {
        console.error("Erro ao ler ficha existente:", readErr.message);
        // Continua mesmo se não conseguir ler a ficha — extrai do zero
      }
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

          // Campos booleanos: só marca true (nunca apaga um true existente com false)
          if (CAMPOS_BOOL.has(key)) {
            if (value === true && !merged[key]) {
              merged[key] = true;
              camposPreenchidosNesteDoc++;
            }
            continue;
          }

          // Campo enum tipo_dispensa
          if (key === "tipo_dispensa") {
            const VALID = ["sem_justa_causa","rescisao_indireta","nulidade_pedido_demissao","reversao_justa_causa"];
            if (value && VALID.includes(value) && !merged[key]) {
              merged[key] = value;
              camposPreenchidosNesteDoc++;
            }
            continue;
          }

          // Campos string normais
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
      try {
        await base44.asServiceRole.entities.CasoVigilante.update(casoVigilanteId, {
          ...extraidos,
          status: "preenchido",
        });
      } catch (saveErr) {
        console.error("Erro ao salvar ficha:", saveErr.message);
        // Não falha a extração inteira se não conseguir salvar — retorna os dados mesmo assim
      }
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
    // Loga erro completo no ErrorLog para diagnóstico
    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.ErrorLog.create({
        context: "extracao_documentos — erro_fatal",
        error_type: "api",
        message: `Erro 500: ${error.message}`,
        resolved: false,
        occurred_at: new Date().toISOString(),
      }).catch(() => {});
    } catch (_) {}
    
    console.error("Erro fatal extrairDadosDocumentos:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});