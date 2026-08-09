/**
 * fetchDocxTemplate — baixa um arquivo .docx do storage do app e devolve o
 * conteúdo em base64 para o frontend. Resolve o bloqueio CORS no app publicado.
 *
 * EXIGE usuário autenticado e SÓ baixa de hosts do próprio Base44.
 * Antes não exigia nada: qualquer pessoa na internet podia mandar uma URL
 * arbitrária e receber o conteúdo de volta em base64 — um proxy de requisições
 * (SSRF) que alcançava endereços internos da infraestrutura e qualquer arquivo
 * cuja URL vazasse. "A URL é o controle de acesso" não é controle de acesso.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Somente o storage do próprio app. Modelo hospedado fora daqui deve ser
// cadastrado em Modelos de Petição (que sobe o arquivo para o storage).
const HOSTS_PERMITIDOS = [/(^|\.)base44\.com$/i, /(^|\.)base44\.app$/i];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return Response.json({ error: 'url é obrigatório' }, { status: 400 });
    }
    let alvo;
    try { alvo = new URL(url); } catch { return Response.json({ error: 'url inválida' }, { status: 400 }); }
    if (alvo.protocol !== 'https:' || !HOSTS_PERMITIDOS.some((re) => re.test(alvo.hostname))) {
      return Response.json(
        { error: `Host não permitido (${alvo.hostname}). Esta função só baixa arquivos do storage do app.` },
        { status: 403 },
      );
    }

    const resp = await fetch(url);
    if (!resp.ok) {
      return Response.json({ error: `Falha ao baixar arquivo: ${resp.status} ${resp.statusText}` }, { status: 502 });
    }

    const arrayBuffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Converte para base64
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    return Response.json({ base64 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});