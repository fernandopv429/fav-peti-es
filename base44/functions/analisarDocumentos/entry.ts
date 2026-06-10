import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Analisa os documentos anexados a uma petição e gera um laudo de issue-spotting.
 * Documentos de imagem: enviados via file_urls (visão da IA).
 * PDFs: enviados via file_urls (suporte nativo do modelo).
 * Textos planos: extraídos e injetados no prompt.
 *
 * Prioridade de análise: holerites/contracheques, cartões de ponto, CTPS, TRCT, FGTS.
 */

const PRIORIDADE_KEYWORDS = [
  "holerite", "contracheque", "salario", "salário", "pagamento",
  "ponto", "cartao", "cartão", "jornada",
  "ctps", "carteira",
  "trct", "rescisao", "rescisão",
  "fgts", "fundo",
];

function pontuarPrioridade(nome) {
  const lower = (nome || "").toLowerCase();
  return PRIORIDADE_KEYWORDS.filter(k => lower.includes(k)).length;
}

function ordenarPorPrioridade(urls, names) {
  const indexed = urls.map((url, i) => ({ url, name: names[i] || `Documento ${i + 1}`, score: pontuarPrioridade(names[i]) }));
  indexed.sort((a, b) => b.score - a.score);
  return indexed;
}

function isVisualFile(url) {
  const lower = url.toLowerCase().split("?")[0];
  return lower.endsWith(".pdf") || lower.endsWith(".png") || lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") || lower.endsWith(".webp") || lower.endsWith(".gif");
}

Deno.serve(async (req) => {
  let petitionId = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    petitionId = body.petitionId;
    if (!petitionId) return Response.json({ error: 'petitionId é obrigatório' }, { status: 400 });

    // Lê a petição
    const petList = await base44.entities.Petition.filter({ id: petitionId });
    const petition = petList[0];
    if (!petition) return Response.json({ error: 'Petição não encontrada' }, { status: 404 });

    const docUrls = petition.document_urls || [];
    const docNames = petition.document_names || [];

    if (docUrls.length === 0) {
      await base44.entities.Petition.update(petitionId, { analise_status: "sem_documentos" });
      return Response.json({ ok: true, analise: null, sem_documentos: true });
    }

    // Marca como em análise imediatamente
    await base44.entities.Petition.update(petitionId, { analise_status: "em_analise" });

    // Carrega config da IA
    const configs = await base44.asServiceRole.entities.PetitionConfig.filter({ ativo: true }).catch(() => []);
    const cfg = configs[0] || {};
    const modeloIA = cfg.modelo_ia || "claude_sonnet_4_6";

    // Ordena por prioridade e processa em lotes de 8
    const ordenados = ordenarPorPrioridade(docUrls, docNames);
    const LOTE_MAX = 8;
    const lote = ordenados.slice(0, LOTE_MAX);

    // Separa arquivos visuais/PDF (vão via file_urls) de textos planos (extraídos)
    const fileUrlsParaIA = [];
    const textosDocs = [];

    for (const doc of lote) {
      if (isVisualFile(doc.url)) {
        fileUrlsParaIA.push(doc.url);
      } else {
        try {
          const resp = await fetch(doc.url);
          if (resp.ok) {
            const txt = await resp.text();
            const snippet = txt.slice(0, 6000).trim();
            if (snippet) textosDocs.push(`=== ${doc.name} ===\n${snippet}`);
          }
        } catch (_) {}
      }
    }

    const nomesAnalisados = lote.map(d => d.name).join(", ");
    const nomesIgnorados = ordenados.slice(LOTE_MAX).map(d => d.name).join(", ");

    const contextoCaso = [
      petition.claimant_name && `Reclamante: ${petition.claimant_name}`,
      petition.claimant_role && `Função: ${petition.claimant_role}`,
      petition.defendant_name && `Reclamada: ${petition.defendant_name}`,
      petition.contract_start && `Admissão: ${petition.contract_start}`,
      petition.contract_end && `Demissão: ${petition.contract_end}`,
      petition.salary && `Salário: R$ ${petition.salary}`,
      petition.work_schedule && `Jornada alegada: ${petition.work_schedule}`,
      petition.irregularities && `Irregularidades alegadas: ${petition.irregularities}`,
      petition.additional_facts && `Contexto adicional: ${petition.additional_facts}`,
    ].filter(Boolean).join("\n");

    const promptAnalise = `Você é um advogado trabalhista especialista em análise probatória. Analise os documentos abaixo e gere um LAUDO DE ACHADOS (issue-spotting) para subsidiar a redação da petição inicial trabalhista.

DADOS DO CASO:
${contextoCaso}

${textosDocs.length > 0 ? `CONTEÚDO EXTRAÍDO DOS DOCUMENTOS (texto):\n${textosDocs.join("\n\n")}` : ""}
${fileUrlsParaIA.length > 0 ? `\nDOCUMENTOS VISUAIS/PDF ANEXADOS: ${fileUrlsParaIA.length} arquivo(s) enviados para análise visual.` : ""}
${nomesAnalisados ? `\nDocumentos analisados: ${nomesAnalisados}` : ""}
${nomesIgnorados ? `\nDocumentos NÃO analisados (limite de ${LOTE_MAX} atingido, priorize os listados acima): ${nomesIgnorados}` : ""}

INSTRUÇÕES DO LAUDO:
Para cada achado, informe: (1) de qual documento veio, (2) o que foi observado, (3) a tese/fundamento legal aplicável.

Analise e informe OBRIGATORIAMENTE:

1. HORAS EXTRAS
   - Horas extras pagas nos holerites: valor, habitualidade, adicional aplicado.
   - Divergência entre jornada constante nos cartões de ponto e o horário alegado pelo reclamante.
   - Reflexos devidos: DSR, 13º salário, férias + 1/3, FGTS + 40% (art. 7º, XVI, CF; Súmulas 264, 291 e 376 do TST).

2. FOLGAS TRABALHADAS / DSR (FT)
   - Nos cartões de ponto, identificar dias de folga/DSR em que houve labor sem remuneração em dobro.
   - Fundamento: art. 9º da Lei 605/49; Súmula 146 do TST.

3. CARTÃO BRITÂNICO
   - Verificar se os registros de ponto apresentam horários uniformes/invariáveis ao longo dos meses.
   - Se detectado: registrar como "CARTÃO BRITÂNICO DETECTADO" e apontar Súmula 338, III, do TST (presunção de veracidade da jornada alegada).

4. ADICIONAL NOTURNO
   - Verificar se foi pago e se os critérios estão corretos: hora noturna reduzida (52:30 min) e prorrogação.
   - Fundamento: Súmulas 60 e 91 do TST; art. 73 da CLT.

5. OUTRAS IRREGULARIDADES
   - Quaisquer outras irregularidades visíveis nos documentos (ex.: uniforme debitado indevidamente, desvio de função, FGTS não recolhido, verbas rescisórias divergentes, intervalo intrajornada suprimido).

6. CRUZAMENTO COM O RELATO DO CASO
   - Compare os achados com o que o reclamante alegou (campo "irregularidades alegadas" e "contexto adicional").
   - Aponte DIVERGÊNCIAS (o documento contradiz o relato) e LACUNAS PROBATÓRIAS (o reclamante alega mas não há documento comprovando).

7. DOCUMENTOS ILEGÍVEIS / NÃO IDENTIFICADOS
   - Para cada documento ilegível ou de conteúdo não identificável, registre: "Documento [nome] — ilegível ou não identificado. Conferência manual obrigatória."

FORMATO DO LAUDO:
- Use seções numeradas (1 a 7) com os títulos acima.
- Seja objetivo e direto. Cite o documento de origem para cada achado.
- NÃO invente dados. Se não houver documento sobre determinado tema, registre "Sem documento disponível para análise deste item."
- Ao final, inclua uma seção "RESUMO EXECUTIVO" com os principais achados em bullet points.

AVISO OBRIGATÓRIO AO FINAL:
"⚠️ Este laudo é um apoio à análise jurídica e NÃO substitui a validação humana pelo advogado responsável. Todos os achados devem ser conferidos manualmente antes da assinatura e protocolo da petição."`;

    const laudoTexto = await base44.integrations.Core.InvokeLLM({
      prompt: promptAnalise,
      model: modeloIA,
      file_urls: fileUrlsParaIA.length > 0 ? fileUrlsParaIA : undefined,
    });

    await base44.entities.Petition.update(petitionId, {
      analise_documentos: laudoTexto,
      analise_status: "concluida",
    });

    return Response.json({ ok: true, analise: laudoTexto });

  } catch (error) {
    // Tenta resetar status em caso de falha grave
    if (petitionId) {
      try {
        const base44Fallback = createClientFromRequest(req);
        await base44Fallback.asServiceRole.entities.Petition.update(petitionId, { analise_status: "pendente" });
      } catch (_) {}
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});