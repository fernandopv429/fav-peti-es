import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { calcularVerbasCaso } from '../../shared/mathUtils.js';
import { mapearCasoDeWebhook } from '../../shared/mapearWebhook.js';
import { extrairCnpjs, extrairCeps, enriquecerCnpjs, enriquecerCeps, enriquecerCct, extrairPisoCct } from '../../shared/consultas.js';
import { computeFlags, redigirTesesIA } from '../../shared/redacao.js';
import { resolverTemplatePorNome } from '../../shared/resolverTemplate.js';

// ============================================================
// Geração automática de petição a partir de um WebhookEvento
// (evento "entrevista.salva"). Disparada pelo workflow de gatilho
// por entidade — sem usuário autenticado (service role).
// Armazena o resultado pronto numa CasoTrabalhista (status 'gerado')
// com analise_json = { origem:'webhook', caso, calculos, dadosReceita,
// dadosCep, dadosCct, blocos }. O frontend apenas revisa/exporta.
// ============================================================
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    // Aceita chamada direta ({ evento_id }) e o payload do gatilho por
    // entidade ({ event: { entity_id }, data }).
    const body = await req.json().catch(() => ({}));
    const evento_id = body.evento_id || body.event?.entity_id;
    if (!evento_id) return Response.json({ error: 'evento_id obrigatório' }, { status: 400 });

    // 1) Carrega o evento do webhook
    const evento = await base44.asServiceRole.entities.WebhookEvento.get(evento_id);
    if (!evento) return Response.json({ error: 'evento não encontrado' }, { status: 404 });
    const payload = evento.payload || {};
    const data = payload.data || {};
    if (!data || !Object.keys(data).length) {
      await base44.asServiceRole.entities.WebhookEvento.update(evento_id, { status: 'erro', erro_mensagem: 'payload sem data', processado_em: new Date().toISOString() });
      return Response.json({ error: 'payload sem data' }, { status: 400 });
    }

    // 2) Mapeia o caso + cria registro "gerando"
    const caso = mapearCasoDeWebhook(data);

    // 2b) Modelo a preencher: vem PRONTO no payload (template_id de um
    // PetitionTemplate). Nao ha escolha por IA — se o ID nao resolver, para
    // aqui em vez de gerar em cima do modelo errado.
    const idInformado = caso.template_id || evento.template_id || '';
    const nomeInformado = data.modelo_peticao || data.modelo || '';
    const ativos = await base44.asServiceRole.entities.PetitionTemplate
      .filter({ is_active: true }).catch(() => []);

    let petitionTemplate = idInformado
      ? (ativos || []).find((t) => t.id === idInformado) || null
      : resolverTemplatePorNome(nomeInformado, ativos);

    if (!petitionTemplate) {
      const msg = idInformado
        ? `template_id "${idInformado}" nao corresponde a nenhum PetitionTemplate ativo`
        : `nao foi possivel identificar o modelo a partir de "${nomeInformado || '(vazio)'}"`;
      await base44.asServiceRole.entities.WebhookEvento.update(evento_id, {
        status: 'erro', erro_mensagem: msg, processado_em: new Date().toISOString(),
      });
      return Response.json({ error: msg }, { status: 422 });
    }
    const templateId = petitionTemplate.id;
    const configLista = await base44.asServiceRole.entities.IntegracaoConfig.list('-updated_date', 1);
    const config = configLista?.[0] || { cnpj_ativo: true, cep_ativo: true, cct_ativo: true };

    const casoRecord = await base44.asServiceRole.entities.CasoTrabalhista.create({
      titulo: (caso.recl_nome || 'Caso webhook').slice(0, 120),
      status: 'em_analise',
      entrevista_texto: caso.entrevista_texto || payload.fatos_narrados || '',
      recl_nome: caso.recl_nome || '',
      recl_cpf: caso.recl_cpf || '',
      recl_rg: caso.recl_rg || '',
      recl_pis: caso.recl_pis || '',
      recl_ctps: caso.recl_ctps || '',
      recl_endereco: caso.recl_endereco || '',
      recl1_nome: caso.recl1_nome || '',
      recl1_cnpj: caso.recl1_cnpj || '',
      recl1_logradouro: caso.recl1_logradouro || '',
      recl2_nome: caso.recl2_nome || '',
      recl2_cnpj: caso.recl2_cnpj || '',
      data_admissao: caso.data_admissao || undefined,
      data_rescisao: caso.data_rescisao || undefined,
      funcao: caso.funcao || '',
      salario: caso.salario || undefined,
      tipo_dispensa: caso.tipo_dispensa || undefined,
      analise_status: 'em_andamento',
      template_id: templateId || undefined,
      analise_json: {
        origem: 'webhook',
        evento_id,
        status: 'gerando',
        template_id: templateId || null,
        template_nome: petitionTemplate?.name || null,
        modelo_docx_url: petitionTemplate?.modelo_docx_url || null,
      },
    });

    // 3) Enriquecimento oficial (CNPJ/CEP/CCT) direto nas APIs
    const cnpjs = config.cnpj_ativo
      ? [...new Set([caso.recl1_cnpj, caso.recl2_cnpj].filter(Boolean).map((c) => String(c).replace(/\D/g, '')).filter((d) => d.length === 14))]
      : [];
    const ceps = config.cep_ativo
      ? [...new Set(extrairCeps([caso.recl_endereco, caso.local_prestacao, caso.recl1_logradouro, caso.recl2_logradouro].filter(Boolean).join(' ')))]
      : [];
    const [dadosReceita, dadosCep, dadosCct] = await Promise.all([
      cnpjs.length ? enriquecerCnpjs(cnpjs) : Promise.resolve([]),
      ceps.length ? enriquecerCeps(ceps) : Promise.resolve([]),
      config.cct_ativo ? enriquecerCct(caso, caso, config, secrets.get('CCT_API_KEY')).catch(() => null) : Promise.resolve(null),
    ]);

    // 4) Auto-preenchimento a partir da CCT (piso, condução, auxílio, multa)
    if (dadosCct?.clausulas?.length) {
      if (!caso.cct_ano && dadosCct.meta?.ano_base) caso.cct_ano = String(dadosCct.meta.ano_base);
      if (!caso.sindicato && dadosCct.meta?.sindicato_laboral) caso.sindicato = dadosCct.meta.sindicato_laboral;
      if (!caso.val_conducao) {
        const cl = dadosCct.clausulas.find((c) => /vale.transporte|condu[çc][ãa]o/i.test(c.ementa || c.texto || ''));
        if (cl) {
          const m = (cl.ementa || cl.texto || '').match(/R\$\s*([\d.,]+)/i);
          if (m) { const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.')); if (v > 0 && v < 30) caso.val_conducao = v; }
        }
      }
      if (!caso.valor_aux_alimentacao) {
        const cl = dadosCct.clausulas.find((c) => /alimenta[çc][ãa]o|refei[çc][ãa]o/i.test(c.ementa || c.texto || c.clausula_titulo || ''));
        if (cl) {
          const m = (cl.ementa || cl.texto || cl.conteudo || '').match(/R\$\s*([\d.,]+)/i);
          if (m) { const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.')); if (v > 0 && v < 100) caso.valor_aux_alimentacao = v; }
        }
      }
      if (!caso.cct_clausula_multa) {
        const cl = dadosCct.clausulas.find((c) => /\bmulta\b|penalidade|descumprimento/i.test(c.ementa || c.texto || c.clausula_titulo || c.conteudo || ''));
        if (cl?.clausula_ref) caso.cct_clausula_multa = cl.clausula_ref;
      }
    }
    // Piso salarial da CCT quando o salário não veio
    if (!caso.salario && dadosCct) {
      const piso = extrairPisoCct(dadosCct, caso.funcao);
      if (piso) caso.salario = piso;
    }
    // Vigilância com folgas: VT/VA nas folgas são devidos (CCT) e não pagos
    const ehVig = /vigilante|vigil/i.test(caso.funcao || '');
    if (ehVig && caso.tem_ft) {
      caso.tem_vale_transporte = true;
      caso.tem_auxilio_alimentacao = true;
      if (!caso.valor_aux_alimentacao) caso.valor_aux_alimentacao = 39;
    }

    // 5) Cálculo determinístico das verbas
    const calculos = calcularVerbasCaso(caso);

    // 6) Flags para acender os capítulos da redação
    const flags = computeFlags(caso, caso, dadosReceita);

    // 7) Redação por IA dos capítulos ativos (uma chamada)
    let blocos = {};
    let especialistasUsados = [];
    let redacaoErro = null;
    try {
      const configs = await base44.asServiceRole.entities.EspecialistaConfig.filter({ ativo: true });
      const res = await redigirTesesIA({
        caso, calculos, dadosCct, dados: flags, configs,
        invokeLLM: (r) => base44.asServiceRole.integrations.Core.InvokeLLM(r),
      });
      blocos = res.blocos || {};
      especialistasUsados = res.especialistasUsados || [];
      redacaoErro = res.erro || null;
      if (!Object.keys(blocos).length && !redacaoErro) redacaoErro = 'IA retornou 0 blocos (obj vazio ou sem campos esperados)';
    } catch (e) {
      redacaoErro = e?.message || 'erro redação';
    }

    // 8) Atualiza o CasoTrabalhista com o resultado pronto
    await base44.asServiceRole.entities.CasoTrabalhista.update(casoRecord.id, {
      status: 'gerado',
      analise_status: 'concluida',
      auditado_em: new Date().toISOString(),
      analise_json: {
        origem: 'webhook',
        evento_id,
        caso,
        calculos,
        dadosReceita,
        dadosCep,
        dadosCct: dadosCct ? {
          categoria: dadosCct.categoria,
          meta: dadosCct.meta,
          clausulas: (dadosCct.clausulas || []).slice(0, 12).map((c) => ({
            clausula_ref: c.clausula_ref, titulo: c.titulo, ementa: c.ementa, conteudo: c.conteudo, fonte_url: c.fonte_url,
          })),
        } : null,
        blocos,
        especialistasUsados,
        redacaoErro,
        gerado_em: new Date().toISOString(),
      },
    });

    // 9) Marca o evento como processado
    await base44.asServiceRole.entities.WebhookEvento.update(evento_id, {
      status: 'processado',
      processado_em: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      caso_id: casoRecord.id,
      blocos_redigidos: Object.keys(blocos).length,
      especialistas: especialistasUsados,
      calculos: (calculos || []).filter((c) => c.valor != null).length,
    });
  } catch (error) {
    return Response.json({ error: error.message || 'erro interno' }, { status: 500 });
  }
}