/**
 * fetchDocxTemplate — baixa um arquivo .docx de uma URL e devolve o conteúdo
 * em base64 para o frontend. Resolve o bloqueio CORS no app publicado.
 *
 * NÃO requer autenticação — a URL do arquivo já é o controle de acesso.
 * Qualquer usuário (inclusive anônimo no app publicado) pode chamar esta função.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    // Inicializa o cliente mas NÃO exige auth — a função só faz fetch de URL pública
    createClientFromRequest(req);

    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return Response.json({ error: 'url é obrigatório' }, { status: 400 });
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