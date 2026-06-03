import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAMPOS = ["RECL_NOME","RECL_NACIONALIDADE","RECL_ESTADOCIVIL","RECL_RG","RECL_PIS","RECL_SERIE","RECL_CTPS","RECL_CPF","RECL_NASC","RECL_FILIACAO","RECL_ENDERECO","RECL_CEP","RECL1_NOME","RECL1_CNPJ","RECL1_LOGRADOURO","RECL1_ENDCOMPL","RECL2_NOME","RECL2_CNPJ","RECL2_LOGRADOURO","RECL2_ENDCOMPL","RECL3_NOME","RECL3_CNPJ","RECL3_LOGRADOURO","RECL3_ENDCOMPL","COMARCA_UF","REGIAO_TRT","FORO_COMPETENCIA","LOCAL_PRESTACAO","LOCAL_PRESTACAO_COMPL","DATA_ADMISSAO","FUNCAO","DATA_RESCISAO","SALARIO","JORNADA_HORARIO","JORNADA_EXTRAPOLA","JORNADA_FREQ_EXTRA","INTERVALO_GOZADO","CCT_VIGENCIA","ADIC_CONV","VAL_FT","VAL_CONDUCAO","VAL_ALIMENTACAO"];

const SCHEMA = { type: "object", properties: Object.fromEntries(CAMPOS.map(c => [c, { type: "string" }])) };

const PROMPT = `Extrator de dados juridicos trabalhistas. Analise os documentos com visao/OCR.
REGRAS: extraia apenas o que esta nos documentos, nunca invente. Campo ausente = "". Datas por extenso em portugues (ex: "04 de junho de 2012"). Salario: "R$ 2.148,22". 1a Reclamada = empregadora direta.
Retorne JSON com: ${CAMPOS.join(",")}`;

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: "Nao autorizado" }, { status: 401 });

  const { casoVigilanteId, documentUrls } = await req.json();
  if (!documentUrls || !documentUrls.length) return Response.json({ error: "Sem documentos." }, { status: 400 });

  // Lê campos já salvos na ficha para não sobrescrever com vazio (merge acumulativo)
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

  // Processa os documentos recebidos (o front já divide em lotes; aceita N docs)
  const merged = { ...camposExistentes };

  for (let i = 0; i < documentUrls.length; i += 2) {
    const lote = documentUrls.slice(i, i + 2);
    try {
      const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: PROMPT,
        model: "gemini_3_flash",
        file_urls: lote,
        response_json_schema: SCHEMA,
      });
      if (res && typeof res === "object") {
        for (const c of CAMPOS) {
          // Só preenche se ainda não temos o campo (prioriza dados anteriores)
          if (res[c] && res[c].trim() && !merged[c]) merged[c] = res[c].trim();
        }
      }
    } catch (e) {
      await base44.asServiceRole.entities.ErrorLog.create({
        context: "Extracao Vigilante",
        error_type: "api",
        message: `Lote ${i}: ${e.message} | ${lote.join(",")}`,
      }).catch(() => {});
    }
  }

  const extraidos = Object.fromEntries(Object.entries(merged).filter(([, v]) => v));
  const total = Object.keys(extraidos).length;

  // Salva na ficha (merge com o que já havia)
  if (casoVigilanteId) {
    await base44.asServiceRole.entities.CasoVigilante.update(casoVigilanteId, {
      ...extraidos,
      ...(total > 0 ? { status: "preenchido" } : {}),
    });
  }

  // Retorna apenas os campos novos extraídos nesta chamada (sem os pré-existentes)
  const novos = Object.fromEntries(
    Object.entries(extraidos).filter(([k, v]) => !camposExistentes[k] && v)
  );

  return Response.json({ campos: extraidos, camposNovos: novos, casoVigilanteId, totalExtraidos: total });
});