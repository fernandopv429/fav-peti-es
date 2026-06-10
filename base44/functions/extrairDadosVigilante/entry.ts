import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAMPOS = ["RECL_NOME","RECL_NACIONALIDADE","RECL_ESTADOCIVIL","RECL_RG","RECL_PIS","RECL_SERIE","RECL_CTPS","RECL_CPF","RECL_NASC","RECL_FILIACAO","RECL_ENDERECO","RECL_CEP","RECL1_NOME","RECL1_CNPJ","RECL1_LOGRADOURO","RECL1_ENDCOMPL","RECL2_NOME","RECL2_CNPJ","RECL2_LOGRADOURO","RECL2_ENDCOMPL","RECL3_NOME","RECL3_CNPJ","RECL3_LOGRADOURO","RECL3_ENDCOMPL","COMARCA_UF","REGIAO_TRT","FORO_COMPETENCIA","LOCAL_PRESTACAO","LOCAL_PRESTACAO_COMPL","DATA_ADMISSAO","FUNCAO","DATA_RESCISAO","SALARIO","JORNADA_HORARIO","JORNADA_EXTRAPOLA","JORNADA_FREQ_EXTRA","INTERVALO_GOZADO","CCT_VIGENCIA","ADIC_CONV","VAL_FT","VAL_CONDUCAO","VAL_ALIMENTACAO"];

const SCHEMA = { type: "object", properties: Object.fromEntries(CAMPOS.map(c => [c, { type: "string" }])) };

const PROMPT = `Voce e um extrator de dados juridicos trabalhistas. Analise os documentos com visao/OCR e extraia os campos abaixo.

REGRAS GERAIS:
- Extraia APENAS o que consta nos documentos. Nunca invente.
- Campo ausente ou incerto = "" (string vazia). Nunca escreva "nao", "sim", "optante", "habitual", "frequente" ou similares.
- Datas por extenso em portugues (ex: "04 de junho de 2012").
- Salario: formato "R$ 2.148,22".
- 1a Reclamada = empregadora direta (quem assina a CTPS/holerite).

REGRAS ESPECIFICAS POR CAMPO:
- RECL_NOME: nome completo do trabalhador/reclamante.
- RECL_NASC: data de nascimento por extenso.
- COMARCA_UF: formato CIDADE/UF em maiusculas, ex: "SAO PAULO/SP" ou "ARUJA/SP". Nao retorne so a UF.
- REGIAO_TRT: por extenso em maiusculas, ex: "SEGUNDA REGIAO" ou "TERCEIRA REGIAO". Nunca retorne so o numero.
- DATA_ADMISSAO: data de admissao por extenso.
- DATA_RESCISAO: data de rescisao por extenso.
- SALARIO: salario base mensal, formato "R$ 2.148,22".
- JORNADA_HORARIO: horario da escala de trabalho, ex: "18:30 as 07:30".
- JORNADA_EXTRAPOLA: horario ate quando a jornada se estendia alem do previsto, ex: "09:00". Se a informacao nao existir, retorne "". NUNCA retorne "Sim" ou "Nao".
- JORNADA_FREQ_EXTRA: procure na ENTREVISTA ou relato do trabalhador quantas vezes por mes fazia hora extra. Retorne no formato "X a Y vezes por mes" (ex: "7 a 8 vezes por mes"). NUNCA retorne palavras genericas como "Habitual", "Frequente", "Sim" ou "Nao".
- INTERVALO_GOZADO: tempo de intervalo efetivamente gozado, ex: "10 (dez) a 15 (quinze) minutos".
- VAL_FT: valor pago por folga trabalhada/FT, formato "R$ 230,00". Procure nos holerites ou relato. NUNCA retorne uma data. Se nao encontrar valor monetario em R$, retorne "".
- VAL_CONDUCAO: valor do beneficio de conducao/VT por dia em R$, ex: "R$ 10,00". Se a pessoa for optante por VT em cartao ou nao houver valor diario claro, retorne "".
- VAL_ALIMENTACAO: valor do beneficio de alimentacao/VA por dia em R$, ex: "R$ 39,00". Se nao houver valor diario claro, retorne "".
- RECL1_NOME: razao social da 1a reclamada (empregadora direta).
- RECL2_NOME: razao social da 2a reclamada (tomadora de servicos), se houver.
- RECL3_NOME: razao social da 3a reclamada, se houver.

Retorne JSON com: ${CAMPOS.join(",")}`;

function isVisualFile(url) {
  const lower = (url || "").toLowerCase().split("?")[0];
  return lower.endsWith(".pdf") || lower.endsWith(".png") || lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") || lower.endsWith(".webp") || lower.endsWith(".gif");
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  // Autenticação via createClientFromRequest já garante o contexto do usuário

  const { casoVigilanteId, documentUrls } = await req.json();
  if (!documentUrls || !documentUrls.length) return Response.json({ error: "Sem documentos." }, { status: 400 });

  // Lê PetitionConfig ativo para obter modelo de IA configurado
  let modeloIA = "gemini_3_flash"; // fallback
  try {
    const configs = await base44.asServiceRole.entities.PetitionConfig.filter({ ativo: true });
    if (configs[0] && configs[0].modelo_ia) {
      modeloIA = configs[0].modelo_ia;
    }
  } catch (_) {}

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
  const docsNaoLidos = [];
  let totalLotesProcessados = 0;
  let totalErrosIA = 0;

  for (let i = 0; i < documentUrls.length; i += 2) {
    const lote = documentUrls.slice(i, i + 2);
    // Separa arquivos visuais (PDF/imagens) de textos planos
    const visuais = lote.filter(isVisualFile);
    const textos = lote.filter(u => !isVisualFile(u));
    
    // Extrai texto de arquivos não-visuais
    const conteudosTexto = [];
    for (const url of textos) {
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const txt = await resp.text();
          if (txt.trim()) conteudosTexto.push(txt.slice(0, 8000));
          else docsNaoLidos.push(url);
        } else {
          docsNaoLidos.push(url);
        }
      } catch (_) {
        docsNaoLidos.push(url);
      }
    }

    // Monta prompt com contexto dos textos lidos
    let promptFinal = PROMPT;
    if (conteudosTexto.length > 0) {
      promptFinal += `\n\nCONTEÚDO EXTRAÍDO DOS DOCUMENTOS (texto):\n${conteudosTexto.join("\n\n")}`;
    }

    try {
      const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: promptFinal,
        model: modeloIA.includes("claude") || modeloIA.includes("gpt") ? modeloIA : "gemini_3_flash",
        file_urls: visuais.length > 0 ? visuais : undefined,
        response_json_schema: SCHEMA,
      });
      
      if (res && typeof res === "object") {
        totalLotesProcessados++;
        let camposPreenchidosNesteLote = 0;
        for (const c of CAMPOS) {
          // Só preenche se ainda não temos o campo (prioriza dados anteriores)
          if (res[c] && res[c].trim() && !merged[c]) {
            merged[c] = res[c].trim();
            camposPreenchidosNesteLote++;
          }
        }
        // Se nenhum campo foi preenchido após processar documentos visuais, registra aviso
        if (visuais.length > 0 && camposPreenchidosNesteLote === 0) {
          docsNaoLidos.push(...visuais);
        }
      }
    } catch (e) {
      totalErrosIA++;
      await base44.asServiceRole.entities.ErrorLog.create({
        context: "Extracao Vigilante — IA falhou",
        error_type: "api",
        message: `Lote ${i}: ${e.message} | URLs: ${lote.join(", ")} | Modelo: ${modeloIA}`,
        resolved: false,
        occurred_at: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  const extraidos = Object.fromEntries(Object.entries(merged).filter(([, v]) => v));
  const total = Object.keys(extraidos).length;
  
  // Validação: se nenhum campo foi extraído e havia documentos visuais, registra erro claro
  if (total === 0 && documentUrls.filter(isVisualFile).length > 0) {
    const errorMsg = `Nenhum campo extraído de ${documentUrls.length} documento(s). Possíveis causas: (1) documentos ilegíveis/escaneados sem OCR adequado, (2) URLs inacessíveis, (3) falha na visão da IA. URLs afetadas: ${documentUrls.slice(0, 5).join(", ")}${documentUrls.length > 5 ? "..." : ""}`;
    await base44.asServiceRole.entities.ErrorLog.create({
      context: "Extracao Vigilante — nenhum dado lido",
      error_type: "api",
      message: errorMsg,
      resolved: false,
      occurred_at: new Date().toISOString(),
    }).catch(() => {});
  }

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

  // Prepara mensagem de alerta se houver documentos não lidos
  let alerta = null;
  if (docsNaoLidos.length > 0) {
    alerta = `Atenção: não foi possível ler o conteúdo de ${docsNaoLidos.length} documento(s). Verifique se estão legíveis.`;
  }
  if (totalErrosIA > 0) {
    alerta = `Ocorreram ${totalErrosIA} erro(s) ao processar documentos com IA. Verifique o ErrorLog.`;
  }
  if (total === 0 && documentUrls.length > 0) {
    alerta = "Nenhum dado foi extraído dos documentos. Verifique se os arquivos estão legíveis e contêm as informações necessárias (CTPS, holerites, entrevista, etc.).";
  }

  return Response.json({ 
    campos: extraidos, 
    camposNovos: novos, 
    casoVigilanteId, 
    totalExtraidos: total,
    alerta,
    docsNaoLidos: docsNaoLidos.length > 0 ? docsNaoLidos : undefined,
  });
});