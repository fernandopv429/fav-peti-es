import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// Envia ao sistema externo (formulário FAV) a aprovação/reprovação de uma
// entrevista já revisada aqui. Aceita `entrevista_id` direto ou `caso_id`
// (CasoTrabalhista) — neste caso o id da entrevista é o origem_evento_id.
const URL_EXTERNA = 'https://formulariofav.base44.app/functions/atualizarAprovacaoEntrevista';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ erro: 'Unauthorized' }, { status: 401 });

    const { entrevista_id, caso_id, status, motivo } = await req.json();

    if (status !== 'aprovado' && status !== 'reprovado') {
      return Response.json({ erro: "status deve ser 'aprovado' ou 'reprovado'" }, { status: 400 });
    }
    if (status === 'reprovado' && !String(motivo || '').trim()) {
      return Response.json({ erro: 'motivo é obrigatório quando reprovado' }, { status: 400 });
    }

    let idEntrevista = entrevista_id;
    if (!idEntrevista && caso_id) {
      const caso = await base44.entities.CasoTrabalhista.get(caso_id);
      idEntrevista = caso?.origem_evento_id;
    }
    if (!idEntrevista) {
      return Response.json({ erro: 'entrevista_id não informado (nem encontrado no caso)' }, { status: 400 });
    }

    const body = { entrevista_id: idEntrevista, status };
    if (motivo) body.motivo = motivo;

    const res = await fetch(URL_EXTERNA, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': secrets.get('APROVACAO_API_KEY'),
      },
      body: JSON.stringify(body),
    });

    const texto = await res.text();
    let dados;
    try { dados = JSON.parse(texto); } catch { dados = { resposta: texto }; }

    if (!res.ok) {
      return Response.json({ erro: `sistema externo respondeu ${res.status}`, detalhe: dados }, { status: 502 });
    }
    return Response.json({ ok: true, entrevista_id: idEntrevista, status, resposta: dados });
  } catch (error) {
    return Response.json({ erro: error.message }, { status: 500 });
  }
}