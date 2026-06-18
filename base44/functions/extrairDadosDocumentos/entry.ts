/**
 * extrairDadosDocumentos — Extração estruturada de dados de PDFs/documentos usando OCR nativo.
 * Usa Core.ExtractDataFromUploadedFile para cada documento e mescla resultados.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAMPOS = ["RECL_NOME","RECL_NACIONALIDADE","RECL_ESTADOCIVIL","RECL_RG","RECL_PIS","RECL_SERIE","RECL_CTPS","RECL_CPF","RECL_NASC","RECL_FILIACAO","RECL_ENDERECO","RECL_CEP","RECL1_NOME","RECL1_CNPJ","RECL1_LOGRADOURO","RECL1_ENDCOMPL","RECL2_NOME","RECL2_CNPJ","RECL2_LOGRADOURO","RECL2_ENDCOMPL","RECL3_NOME","RECL3_CNPJ","RECL3_LOGRADOURO","RECL3_ENDCOMPL","COMARCA_UF","REGIAO_TRT","FORO_COMPETENCIA","LOCAL_PRESTACAO","LOCAL_PRESTACAO_COMPL","DATA_ADMISSAO","FUNCAO","DATA_RESCISAO","SALARIO","JORNADA_HORARIO","JORNADA_EXTRAPOLA","JORNADA_FREQ_EXTRA","INTERVALO_GOZADO","CCT_VIGENCIA","ADIC_CONV","VAL_FT","VAL_CONDUCAO","VAL_ALIMENTACAO"];

// Tabela determinística UF → TRT (sem IA)
const UF_REGIAO_TRT = {
  SP: { REGIAO_TRT: "SEGUNDA REGIÃO", trt: "TRT-2" },
  RJ: { REGIAO_TRT: "PRIMEIRA REGIÃO", trt: "TRT-1" },
  MG: { REGIAO_TRT: "TERCEIRA REGIÃO", trt: "TRT-3" },
  RS: { REGIAO_TRT: "QUARTA REGIÃO", trt: "TRT-4" },
  BA: { REGIAO_TRT: "QUINTA REGIÃO", trt: "TRT-5" },
  CE: { REGIAO_TRT: "SÉTIMA REGIÃO", trt: "TRT-7" },
  PA: { REGIAO_TRT: "OITAVA REGIÃO", trt: "TRT-8" },
  AM: { REGIAO_TRT: "OITAVA REGIÃO", trt: "TRT-8" },
  PR: { REGIAO_TRT: "NONA REGIÃO", trt: "TRT-9" },
  DF: { REGIAO_TRT: "DÉCIMA REGIÃO", trt: "TRT-10" },
  SC: { REGIAO_TRT: "DÉCIMA SEGUNDA REGIÃO", trt: "TRT-12" },
  MT: { REGIAO_TRT: "DÉCIMA TERCEIRA REGIÃO (NA PRÁTICA TRT-23)", trt: "TRT-23" },
  GO: { REGIAO_TRT: "DÉCIMA OITAVA REGIÃO", trt: "TRT-18" },
  PE: { REGIAO_TRT: "SEXTA REGIÃO", trt: "TRT-6" },
  ES: { REGIAO_TRT: "DÉCIMA SÉTIMA REGIÃO", trt: "TRT-17" },
  MS: { REGIAO_TRT: "VIGÉSIMA QUARTA REGIÃO", trt: "TRT-24" },
  AL: { REGIAO_TRT: "DÉCIMA NONA REGIÃO", trt: "TRT-19" },
  RN: { REGIAO_TRT: "VIGÉSIMA PRIMEIRA REGIÃO", trt: "TRT-21" },
  PI: { REGIAO_TRT: "VIGÉSIMA SEGUNDA REGIÃO", trt: "TRT-22" },
  MA: { REGIAO_TRT: "DÉCIMA SEXTA REGIÃO", trt: "TRT-16" },
  RO: { REGIAO_TRT: "DÉCIMA QUARTA REGIÃO", trt: "TRT-14" },
  AC: { REGIAO_TRT: "DÉCIMA QUARTA REGIÃO", trt: "TRT-14" },
  PB: { REGIAO_TRT: "DÉCIMA TERCEIRA REGIÃO", trt: "TRT-13" },
  SE: { REGIAO_TRT: "VIGÉSIMA REGIÃO", trt: "TRT-20" },
  AP: { REGIAO_TRT: "OITAVA REGIÃO", trt: "TRT-8" },
  RR: { REGIAO_TRT: "DÉCIMA PRIMEIRA REGIÃO", trt: "TRT-11" },
  TO: { REGIAO_TRT: "VIGÉSIMA SÉTIMA REGIÃO", trt: "TRT-27" },
};

// Campos booleanos/enum extraídos da entrevista padrão do escritório
const CAMPOS_ENTREVISTA = ["tipo_dispensa", "acumulo_funcao", "tem_insalubridade", "tem_periculosidade", "tem_adic_noturno", "escala"];

const SCHEMA = {
  type: "object",
  properties: {
    ...Object.fromEntries(CAMPOS.map(c => [c, { type: "string" }])),
    // Override com descriptions específicas para campos críticos
    RECL_RG: {
      type: "string",
      description: "RG do reclamante (número do documento de identidade). Extrair de CTPS, entrevista ou qualquer documento de identificação pessoal."
    },
    SALARIO: {
      type: "string",
      description: "Último salário do empregado no formato 'R$ X.XXX,XX'. Priorizar o salário do empregador RÉUS na ação (1ª reclamada = empregadora direta). Se a CTPS tiver múltiplos vínculos, usar o do último emprego relacionado ao caso."
    },
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
    // Regime de escala (seção da entrevista sobre jornada)
    escala: {
      type: "string",
      description: "Regime de escala marcado na entrevista: '12x36', '4x2', '6x2', '5x1', '6x1', '5x2' ou semelhante. Extrair exatamente como escrito na entrevista."
    },
  },
};

// Campos com default que não contam como "extraídos"
const CAMPOS_COM_DEFAULT = new Set(["RECL_NACIONALIDADE"]);
const DEFAULTS = { RECL_NACIONALIDADE: "brasileiro" };

// Campos booleanos — precisam de tratamento separado
const CAMPOS_BOOL = new Set(["acumulo_funcao", "tem_insalubridade", "tem_periculosidade", "tem_adic_noturno"]);

// Campos-chave: se ao menos 2 estiverem preenchidos, a extração é considerada bem-sucedida (sucesso parcial)
const CAMPOS_CHAVE = new Set(["RECL_NOME","RECL_CPF","RECL_RG","RECL1_NOME","RECL1_CNPJ","DATA_ADMISSAO","DATA_RESCISAO","SALARIO"]);

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

        // Avalia se a extração foi útil:
        // — "vazia" = 0 campos preenchidos → falha
        // — "parcial" = ≥1 campo preenchido mas <2 campos-chave → aproveita, sinaliza para revisão
        // — "sucesso" = ≥2 campos-chave preenchidos
        const camposChaveNesteDoc = Object.entries(output).filter(
          ([key, value]) => CAMPOS_CHAVE.has(key) && value && String(value).trim()
        ).length;

        if (camposPreenchidosNesteDoc === 0) {
          // Realmente vazio — registra como falha
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
        } else if (camposChaveNesteDoc < 2) {
          // Sucesso parcial — dados aproveitados, mas sinalizar para revisão
          console.log(`[sucesso_parcial] ${nomeDoc}: ${camposPreenchidosNesteDoc} campos (${camposChaveNesteDoc} chave). Aproveitados.`);
          docsFalharam.push({
            url,
            nome: nomeDoc,
            aviso: `Sucesso parcial: ${camposPreenchidosNesteDoc} campo(s) extraído(s) — confira nome, CPF e empresa manualmente`,
          });
        }
        // else: sucesso normal — nenhum aviso necessário
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

    // ── Derivação determinística REGIAO_TRT a partir de COMARCA_UF ──────────
    // Se REGIAO_TRT ou FORO_COMPETENCIA estiverem vazios e COMARCA_UF tiver uma UF conhecida,
    // preenche via tabela — sem IA, sem ambiguidade.
    if (merged.COMARCA_UF && !merged.REGIAO_TRT) {
      // Extrai a UF do final da string "CIDADE/SP" ou "CIDADE - SP" ou apenas "SP"
      const ufMatch = merged.COMARCA_UF.toUpperCase().match(/\b([A-Z]{2})$/);
      const uf = ufMatch?.[1];
      if (uf && UF_REGIAO_TRT[uf]) {
        merged.REGIAO_TRT = UF_REGIAO_TRT[uf].REGIAO_TRT;
        if (!merged.FORO_COMPETENCIA) {
          merged.FORO_COMPETENCIA = merged.COMARCA_UF;
        }
      }
    }

    // Filtra apenas campos válidos (não-vazios)
    const extraidos = Object.fromEntries(
      Object.entries(merged).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
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