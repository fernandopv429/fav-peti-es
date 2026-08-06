import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { calcularVerbasCaso } from '../../shared/mathUtils.js';
import { mapearCasoDeWebhook } from '../../shared/mapearWebhook.js';
import { extrairCnpjs, extrairCeps, enriquecerCnpjs, enriquecerCeps, enriquecerCct, extrairPisoCct } from '../../shared/consultas.js';
import { computeFlags, redigirTesesIA } from '../../shared/redacao.js';

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

    // Identidade estável do lead de origem (payload.id, igual em reenvios) —
    // usada para ATUALIZAR a mesma CasoTrabalhista/Petition em reprocessamentos
    // (ex.: botão "Reenviar evento" no app que envia) em vez de duplicar.
    // evento.id (a linha do WebhookEvento) muda a cada envio; evento.evento_id
    // (o campo do payload) é o identificador estável do caso de origem.
    const origemEventoId = evento.evento_id || evento_id;
    const casosExistentes = origemEventoId
      ? await base44.asServiceRole.entities.CasoTrabalhista.filter({ origem_evento_id: origemEventoId }).catch(() => [])
      : [];
    const casoExistente = casosExistentes?.[0] || null;
    const petitionIdExistente = casoExistente?.analise_json?.petition_id || null;

    // 2) Mapeia o caso + cria (ou atualiza) o registro "gerando"
    const caso = mapearCasoDeWebhook(data);

    // 2b) MODELO ÚNICO. A peça inicial sai sempre do template padrão marcado
    // com a tag "blocos" (dialeto de entrevista): a variação por sindicato/
    // função é feita pelos capítulos condicionais ({{BLOCO_*}}), não por um
    // .docx diferente. O template_id/modelo_peticao do payload é ignorado —
    // era a origem da peça sair no modelo errado.
    const ativos = await base44.asServiceRole.entities.PetitionTemplate
      .filter({ is_active: true }).catch(() => []);

    const petitionTemplate = (ativos || []).find(
      (t) => Array.isArray(t.tags) && t.tags.includes('blocos') && t.modelo_docx_url
    ) || null;

    // Os dois dialetos de template convivem no app e NAO sao compativeis:
    //   - entrevista/IA : {{BLOCO_*}} + {{VALOR_*}}  (este pipeline)
    //   - legado        : {{P01}}..{{P87}} + texto juridico fixo (NewPetition)
    // Preencher um com os dados do outro gera peca cheia de token cru sem o
    // docxtemplater reclamar. Marcamos a suspeita em vez de falhar, porque um
    // modelo legado pode ganhar os BLOCO_* depois (basta marcar a tag).
    const ehDialetoEntrevista = (t) => Array.isArray(t?.tags) && t.tags.includes('blocos');

    if (!petitionTemplate) {
      const msg = 'nenhum modelo padrao ativo com .docx e tag "blocos" cadastrado em Modelos de Peticao';
      await base44.asServiceRole.entities.WebhookEvento.update(evento_id, {
        status: 'erro', erro_mensagem: msg, processado_em: new Date().toISOString(),
      });
      return Response.json({ error: msg }, { status: 422 });
    }
    const templateId = petitionTemplate.id;
    const configLista = await base44.asServiceRole.entities.IntegracaoConfig.list('-updated_date', 1);
    const config = configLista?.[0] || { cnpj_ativo: true, cep_ativo: true, cct_ativo: true };

    const casoCampos = {
      titulo: (caso.recl_nome || 'Caso webhook').slice(0, 120),
      status: 'em_analise',
      origem_evento_id: origemEventoId || undefined,
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
        origem_evento_id: origemEventoId,
        status: 'gerando',
        template_id: templateId || null,
        template_nome: petitionTemplate?.name || null,
        modelo_docx_url: petitionTemplate?.modelo_docx_url || null,
      },
    };
    // Reprocessamento do MESMO lead de origem: atualiza a CasoTrabalhista (e,
    // mais abaixo, a Petition) existentes em vez de criar duplicatas — já
    // aconteceu de o mesmo evento gerar 2 peças diferentes antes deste fix.
    let casoId;
    if (casoExistente) {
      await base44.asServiceRole.entities.CasoTrabalhista.update(casoExistente.id, casoCampos);
      casoId = casoExistente.id;
    } else {
      const casoCriado = await base44.asServiceRole.entities.CasoTrabalhista.create(casoCampos);
      casoId = casoCriado.id;
    }

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

    // 5) Cálculo determinístico das verbas (usa a CCT já consultada para
    // corrigir cláusula/percentual de desvio/acúmulo/gratificação por categoria)
    const calculos = calcularVerbasCaso(caso, dadosCct);

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

    // 8) Atualiza a CasoTrabalhista com o resultado pronto
    const analiseJsonFinal = {
      origem: 'webhook',
      evento_id,
      origem_evento_id: origemEventoId,
      template_id: templateId,
      template_nome: petitionTemplate?.name || null,
      modelo_docx_url: petitionTemplate?.modelo_docx_url || null,
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
    };
    await base44.asServiceRole.entities.CasoTrabalhista.update(casoId, {
      status: 'gerado',
      analise_status: 'concluida',
      auditado_em: new Date().toISOString(),
      analise_json: analiseJsonFinal,
    });

    // 8b) Espelha em Petition para a peca aparecer em "Minhas Peticoes" e
    // entrar no fluxo de revisao que o app ja tem.
    const dialetoOk = ehDialetoEntrevista(petitionTemplate);
    const avisos = [];
    if (!dialetoOk) {
      avisos.push(
        `O modelo "${petitionTemplate.name}" nao esta marcado como dialeto de entrevista ` +
        `(tag "blocos"). Se ele usa P01..P87, a peca sairia com tokens crus.`
      );
    }
    if (redacaoErro) avisos.push(`Redacao por IA: ${redacaoErro}`);

    const ORDEM_BLOCOS = [
      ['BLOCO_ESPINHA_RESCISAO', 'DA MODALIDADE DE RESCISAO'],
      ['BLOCO_JORNADA', 'DA JORNADA DE TRABALHO'],
      ['BLOCO_ENQUADRAMENTO', 'DO ENQUADRAMENTO FUNCIONAL'],
      ['BLOCO_INSALUBRIDADE', 'DA INSALUBRIDADE'],
      ['BLOCO_DANO_MORAL', 'DO DANO MORAL'],
      ['BLOCO_SUMULA_331', 'DA RESPONSABILIDADE SUBSIDIARIA'],
      ['BLOCO_MULTAS_CONVENCIONAIS', 'DAS MULTAS CONVENCIONAIS'],
    ];
    const textoRedigido = ORDEM_BLOCOS
      .filter(([k]) => blocos?.[k] && String(blocos[k]).trim())
      .map(([k, titulo]) => `${titulo}\n\n${String(blocos[k]).trim()}`)
      .join('\n\n');

    const totalCausa = (calculos || [])
      .filter((c) => Number(c?.valor) > 0)
      .reduce((acc, c) => acc + Number(c.valor), 0);

    // Texto grande estoura o limite do campo generated_content — sobe como
    // .txt e guarda a URL (o PetitionView já resolve URLs http).
    let generatedContent = textoRedigido || undefined;
    if (generatedContent && generatedContent.length > 4000) {
      const file = new File([generatedContent], 'peticao.txt', { type: 'text/plain' });
      const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file });
      generatedContent = file_url;
    }

    let petitionId = petitionIdExistente || null;
    const petitionCampos = {
      title: `${caso.recl_nome || 'Reclamante'} x ${caso.recl1_nome || 'Reclamada'}`.slice(0, 200),
      case_type: 'trabalhista',
      claimant_name: caso.recl_nome || 'A PREENCHER',
      defendant_name: caso.recl1_nome || 'A PREENCHER',
      claimant_cpf: caso.recl_cpf || undefined,
      claimant_rg: caso.recl_rg || undefined,
      claimant_pis: caso.recl_pis || undefined,
      claimant_ctps: caso.recl_ctps || undefined,
      claimant_address: caso.recl_endereco || undefined,
      claimant_role: caso.funcao || undefined,
      defendant_cnpj: caso.recl1_cnpj || undefined,
      defendant_address: caso.recl1_logradouro || undefined,
      contract_start: caso.data_admissao || undefined,
      contract_end: caso.data_rescisao || undefined,
      salary: Number(caso.salario) || undefined,
      work_schedule: caso.jornada_horario || caso.escala || undefined,
      jurisdiction: caso.comarca_uf || undefined,
      estimated_value: totalCausa > 0 ? totalCausa : undefined,
      template_used: templateId || undefined,
      generated_content: generatedContent,
      additional_facts: avisos.length ? avisos.join(' | ') : undefined,
      // Sem dialeto confirmado ou com falha de redacao nao afirmamos que
      // esta pronta: vai para revisao explicita.
      status: (dialetoOk && !redacaoErro) ? 'concluida' : 'revisao_necessaria',
    };
    try {
      if (petitionIdExistente) {
        await base44.asServiceRole.entities.Petition.update(petitionIdExistente, petitionCampos);
      } else {
        const petition = await base44.asServiceRole.entities.Petition.create(petitionCampos);
        petitionId = petition.id;
      }
      await base44.asServiceRole.entities.CasoTrabalhista.update(casoId, {
        analise_json: { ...analiseJsonFinal, petition_id: petitionId },
      });
    } catch (e) {
      avisos.push(`Falha ao ${petitionIdExistente ? 'atualizar' : 'criar'} a Petition: ${e?.message || e}`);
    }

    // 9) Marca o evento como processado
    await base44.asServiceRole.entities.WebhookEvento.update(evento_id, {
      status: 'processado',
      processado_em: new Date().toISOString(),
      erro_mensagem: avisos.length ? avisos.join(' | ') : undefined,
    });

    return Response.json({
      ok: true,
      caso_id: casoId,
      regenerado: Boolean(casoExistente),
      petition_id: petitionId,
      template: petitionTemplate.name,
      dialeto_entrevista: dialetoOk,
      blocos_redigidos: Object.keys(blocos).length,
      especialistas: especialistasUsados,
      calculos: (calculos || []).filter((c) => c.valor != null).length,
      avisos,
    });
  } catch (error) {
    return Response.json({ error: error.message || 'erro interno' }, { status: 500 });
  }
}