import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAMPOS = ["RECL_NOME","RECL_NACIONALIDADE","RECL_ESTADOCIVIL","RECL_RG","RECL_PIS","RECL_SERIE","RECL_CTPS","RECL_CPF","RECL_NASC","RECL_FILIACAO","RECL_ENDERECO","RECL_CEP","RECL1_NOME","RECL1_CNPJ","RECL1_LOGRADOURO","RECL1_ENDCOMPL","RECL2_NOME","RECL2_CNPJ","RECL2_LOGRADOURO","RECL2_ENDCOMPL","RECL3_NOME","RECL3_CNPJ","RECL3_LOGRADOURO","RECL3_ENDCOMPL","COMARCA_UF","REGIAO_TRT","FORO_COMPETENCIA","LOCAL_PRESTACAO","LOCAL_PRESTACAO_COMPL","DATA_ADMISSAO","FUNCAO","DATA_RESCISAO","SALARIO","JORNADA_HORARIO","JORNADA_EXTRAPOLA","JORNADA_FREQ_EXTRA","INTERVALO_GOZADO","CCT_VIGENCIA","ADIC_CONV","VAL_FT","VAL_CONDUCAO","VAL_ALIMENTACAO"];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nao autorizado" }, { status: 401 });

    const { casoVigilanteId, documentUrls } = await req.json();
    if (!documentUrls || documentUrls.length === 0) return Response.json({ error: "Sem documentos." }, { status: 400 });

    const isVisual = (u) => /\.(jpg|jpeg|png|webp|gif|pdf|heic|bmp)(\?|$)/i.test(u);
    const urlsVisuais = documentUrls.filter(isVisual).slice(0, 20);
    const urlsTexto = documentUrls.filter(u => !isVisual(u));

    let textoExtra = "";
    for (const url of urlsTexto) {
      try { const r = await fetch(url); if (r.ok) textoExtra += "\n---\n" + (await r.text()).slice(0, 5000); } catch (_) {}
    }

    const schema = {};
    CAMPOS.forEach(c => { schema[c] = { type: "string" }; });

    const prompt = `Extrator de dados juridicos trabalhistas. Analise os documentos (CTPS, RG, holerite, TRCT, cartao de ponto, fotos de WhatsApp). Use OCR/visao para ler imagens.
REGRAS: 1) So extraia o que esta nos documentos, NUNCA invente. 2) Campo ausente = "". 3) NAO preencha P01-P87 nem VALOR_CAUSA. 4) Datas por extenso em portugues (ex: "04 de junho de 2012"). 5) Salario: "R$ 2.148,22". 6) 1a Reclamada = empregadora direta. 7) JORNADA_HORARIO = horario da escala (ex: "18:30 as 07:30").${textoExtra ? "\nTexto adicional:\n" + textoExtra : ""}
Retorne JSON com estas chaves: ${CAMPOS.join(",")}`;

    const resultado = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      model: "claude_sonnet_4_6",
      file_urls: urlsVisuais.length > 0 ? urlsVisuais : undefined,
      response_json_schema: { type: "object", properties: schema },
    });

    const extraidos = {};
    CAMPOS.forEach(c => { if (resultado[c] && resultado[c].trim()) extraidos[c] = resultado[c].trim(); });

    let savedId = casoVigilanteId || null;
    if (savedId) {
      await base44.asServiceRole.entities.CasoVigilante.update(savedId, {
        ...extraidos,
        ...(Object.keys(extraidos).length > 0 ? { status: "preenchido" } : {}),
      });
    } else {
      const novo = await base44.asServiceRole.entities.CasoVigilante.create({
        titulo: extraidos.RECL_NOME ? extraidos.RECL_NOME + " (extraido)" : "Caso " + new Date().toLocaleDateString("pt-BR"),
        ...extraidos,
        status: Object.keys(extraidos).length > 0 ? "preenchido" : "rascunho",
      });
      savedId = novo.id;
    }

    return Response.json({ campos: extraidos, casoVigilanteId: savedId, totalExtraidos: Object.keys(extraidos).length });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});