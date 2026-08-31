import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Loader2, FileText, FileDown, Library, RefreshCw, CheckCircle2, ScrollText, AlertTriangle, Inbox, Wand2,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import SessionLogsModal from '@/features/entrevista/components/SessionLogsModal';
import DocumentReviewPreview from '@/features/entrevista/components/DocumentReviewPreview';
import { exportarDocxTemplate } from '@/features/entrevista/lib/preencherDocxTemplate';
import { TIPO_DISPENSA_LABELS } from '@/features/entrevista/lib/tokens';
import { formatBRL } from '@/features/entrevista/lib/mathUtils';
import { fontesGeracao } from '@/features/entrevista/lib/fontesAnalise';
import useConsoleLogs from '@/features/entrevista/useConsoleLogs';
import { gerarDadosPeca } from '@/features/entrevista/lib/modelosReferencia';
import {
  carregarEsqueletoTemplate,
  preencherEsqueleto,
  textoDaPeca,
} from '@/features/entrevista/lib/previewTemplate';
import ComentarioTrecho from '@/features/entrevista/components/ComentarioTrecho';
import EscolherTopico from '@/features/entrevista/components/EscolherTopico';
import FilaWebhooks from '@/features/entrevista/components/FilaWebhooks';
import { montarDadosTemplate } from '@/features/entrevista/lib/dadosTemplate';

// ============================================================
// Instância isolada de uma sessão de peça: a entrevista chega pela fila de
// webhooks, a petição preenche o template e é revisada/exportada aqui.
// ============================================================

export default function EntrevistaSession() {
  // Histórico técnico da sessão (traços de ferramentas, retornos de API e
  // erros) — alimenta apenas o modal de logs.
  const [messages, setMessages] = useState([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const consoleLogs = useConsoleLogs();
  const [generating, setGenerating] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [allUrls, setAllUrls] = useState([]);
  const [documentSources, setDocumentSources] = useState([]);
  const [attrs, setAttrs] = useState(null);
  const [config, setConfig] = useState(null);
  const [ultimaGeracao, setUltimaGeracao] = useState(null);
  // Caso aberto a partir da fila de webhooks. Quando presente, a geração
  // (Atualizar) usa estes dados estruturados em vez de reextrair texto.
  const [casoWebhook, setCasoWebhook] = useState(null);
  // Id do CasoTrabalhista aberto pela fila — usado para marcar a revisão confirmada
  const [casoDbId, setCasoDbId] = useState(null);
  const [filaOpen, setFilaOpen] = useState(false);
  const [filaCount, setFilaCount] = useState(0);

  // Documento vivo — preview do template .docx preenchido
  const [docHtml, setDocHtml] = useState('');
  // URL do template efetivamente usada para montar o preview atual
  const [urlPreview, setUrlPreview] = useState('');
  // Trecho selecionado no documento para comentário/correção pontual
  const [trechoSelecionado, setTrechoSelecionado] = useState('');
  // Capítulo escolhido em lista ({ campo, rotulo, texto }) — alternativa à seleção
  const [topicoEscolhido, setTopicoEscolhido] = useState(null);
  const [listaTopicosAberta, setListaTopicosAberta] = useState(false);

  // Template do caso aberto pela fila de webhooks (vem no evento). Quando
  // ausente, cai no template padrão configurado.
  const [templateCaso, setTemplateCaso] = useState(null);
  // MODELO VIGENTE, direto do cadastro (PetitionTemplate ativo com a tag
  // "blocos") — a MESMA fonte que o webhook usa para gerar. Havia três lugares
  // guardando URL de modelo e eles discordavam: o cadastro (atualizado), o
  // IntegracaoConfig.template_docx_url (parado num arquivo antigo) e a URL
  // congelada dentro de cada caso. A exportação só olhava os dois últimos, então
  // trocar o modelo em "Modelos de Petição" não mudava nada na peça baixada.
  const [templatePadrao, setTemplatePadrao] = useState(null);
  const templateUrl = templatePadrao?.url || templateCaso?.url || config?.template_docx_url || '';
  const templateNome = templatePadrao?.nome || templateCaso?.nome || config?.template_docx_nome || '';
  const temTemplate = !!templateUrl;

  useEffect(() => {
    base44.entities.IntegracaoConfig.list('-updated_date', 1).then((l) => setConfig(l?.[0] || null)).catch(() => {});
    base44.entities.PetitionTemplate.filter({ is_active: true })
      .then((lista) => {
        const t = (lista || []).find((x) => Array.isArray(x.tags) && x.tags.includes('blocos') && x.modelo_docx_url);
        if (t) setTemplatePadrao({ url: t.modelo_docx_url, nome: t.modelo_docx_name || t.name });
      })
      .catch(() => {});
  }, []);

  const atualizarFilaCount = () => {
    base44.entities.CasoTrabalhista.list('-created_date', 50)
      .then((l) => setFilaCount((l || []).filter((c) => c.analise_json?.origem === 'webhook').length))
      .catch(() => {});
  };
  useEffect(() => { atualizarFilaCount(); const t = setInterval(atualizarFilaCount, 15000); return () => clearInterval(t); }, []);

  const userText = messages.filter((m) => m.role === 'user').map((m) => m.text).filter(Boolean).join('\n\n');

  const gerarMinuta = async (opts = {}) => {
    if (generating) return;
    setGenerating(true);
    try {
      // Caso de webhook aberto na fila: usa o caso estruturado já mapeado
      // (casoPreMapeado) em vez de reextrair do resumo curto do chat, e o
      // texto integral da entrevista como contexto.
      const usarCasoWebhook = !opts.casoPreMapeado && casoWebhook;
      const geracaoTexto = opts.texto ?? (userText || (usarCasoWebhook ? casoWebhook.entrevista_texto : ''));
      const { dados, dadosReceita, dadosCep, dadosDatajud, dadosCct, calculos, caso, modeloSemelhante } = await gerarDadosPeca({
        texto: geracaoTexto,
        fileUrls: opts.urls ?? allUrls,
        attrs: opts.attrs ?? attrs,
        casoPreMapeado: opts.casoPreMapeado ?? (usarCasoWebhook ? casoWebhook.caso : null),
        redigirIA: true,
        onTool: (msg) => setMessages((m) => [...m, { role: 'tool', text: msg }]),
      });

      // Preview a partir do próprio template .docx (fonte única)
      let html = '';
      let documentoTexto = '';
      if (templateUrl) {
        try {
          const esqueleto = await carregarEsqueletoTemplate(templateUrl);
          html = preencherEsqueleto(esqueleto, dados, { highlight: true });
          documentoTexto = textoDaPeca(esqueleto, dados);
          setUrlPreview(templateUrl);
        } catch (e) {
          console.error(e);
          setMessages((m) => [...m, { role: 'assistant', text: `Não consegui carregar o template .docx para o preview: ${e.message || 'verifique o arquivo em Configurações.'}` }]);
        }
      }
      setDocHtml(html);
      setUltimaGeracao({ caso, calculos, dados, dadosReceita });
      setReviewConfirmed(false);

      const retornos = [
        dadosReceita?.length && { role: 'tool_result', title: 'Retorno da Receita Federal (BrasilAPI)', text: JSON.stringify(dadosReceita, null, 2) },
        dadosCep?.length && { role: 'tool_result', title: 'Retorno da consulta de CEP', text: JSON.stringify(dadosCep, null, 2) },
        dadosDatajud?.length && { role: 'tool_result', title: 'Retorno do DataJud/CNJ', text: JSON.stringify(dadosDatajud, null, 2) },
        caso && Object.keys(caso).length && { role: 'tool_result', title: 'Dados analisados e extraídos pela IA', text: JSON.stringify(caso, null, 2) },
        calculos?.length && { role: 'tool_result', title: 'Retorno dos cálculos determinísticos', text: JSON.stringify(calculos, null, 2) },
        dadosCct?.clausulas?.length && { role: 'tool_result', title: `Cláusulas da CCT aplicável${dadosCct.meta?.titulo ? ` — ${dadosCct.meta.titulo}` : ''}`, text: JSON.stringify(dadosCct.clausulas.map((c) => ({ clausula: `${c.clausula_ref} — ${c.clausula_titulo}`, cct: c.titulo, conteudo: c.conteudo, fonte: c.fonte_url })), null, 2) },
        { role: 'tool_result', title: 'Dados e flags aplicados ao template', text: JSON.stringify(dados, null, 2) },
        modeloSemelhante && { role: 'tool_result', title: 'Modelo de referência selecionado', text: JSON.stringify(modeloSemelhante, null, 2) },
        {
          role: 'tool_result',
          title: 'Fontes consultadas nesta geração',
          text: JSON.stringify(fontesGeracao({
            texto: geracaoTexto,
            documentos: opts.sources ?? documentSources,
            referencia: modeloSemelhante,
            dadosReceita,
            dadosCep,
            dadosDatajud,
            dadosCct,
          }), null, 2),
        },
      ].filter(Boolean);
      if (retornos.length) setMessages((m) => [...m, ...retornos]);

      const verificados = (dadosReceita || []).filter((d) => !d.erro);
      let nota = temTemplate
        ? 'Dados aplicados ao template. Confira os campos destacados no documento.'
        : 'Dados extraídos. Envie o template .docx em Configurações para gerar e exportar a petição.';
      if (verificados.length) {
        nota += ` CNPJ(s) confirmado(s) na Receita: ${verificados.map((d) => `${d.razao_social} (${d.cnpj})`).join('; ')}.`;
      }
      const comValor = (calculos || []).filter((c) => c.valor != null);
      if (comValor.length) {
        nota += `\n\nCálculos determinísticos (por código, sem IA):\n${comValor.map((c) => `• ${c.item}: ${formatBRL(c.valor)}`).join('\n')}`;
      }
      setMessages((m) => [...m, { role: 'assistant', text: nota }]);

    } catch (err) {
      console.error(err);
      setMessages((m) => [...m, { role: 'assistant', text: 'Erro ao gerar a peça. Tente novamente.' }]);
    }
    setGenerating(false);
  };

  // Seleção de texto no preview abre o comentário de correção. Só a partir de
  // 12 caracteres, para clique simples não abrir o painel.
  const capturarSelecao = () => {
    const s = window.getSelection?.()?.toString().replace(/\s+/g, ' ').trim() || '';
    if (s.length >= 12) setTrechoSelecionado(s);
  };

  // Aplica o capítulo reescrito pela IA: troca só aquele campo dos dados e
  // repreenche o template (os valores determinísticos ficam intactos).
  const aplicarCorrecao = async (campo, textoNovo) => {
    const dados = { ...(ultimaGeracao?.dados || {}), [campo]: textoNovo };
    if (campo === 'BLOCO_DANO_MORAL') dados.DANO_MORAL_FATO_ESPECIFICO = textoNovo;
    setUltimaGeracao((g) => ({ ...(g || {}), dados }));
    // O preview tem de ser repreenchido com a MESMA URL usada para montá-lo.
    // Usando só `templateUrl`, um caso aberto pela fila (que resolve a URL do
    // próprio evento) recarregava um template diferente — ou nenhum — e a
    // correção aprovada não aparecia no documento em revisão.
    const url = urlPreview || templateUrl;
    try {
      const esqueleto = await carregarEsqueletoTemplate(url);
      setDocHtml(preencherEsqueleto(esqueleto, dados, { highlight: true }));
    } catch (e) {
      console.error(e);
      setMessages((m) => [...m, { role: 'assistant', text: `Não consegui atualizar o documento com a correção: ${e?.message || 'template indisponível.'}` }]);
    }
    setReviewConfirmed(false);
    setTrechoSelecionado('');
    setTopicoEscolhido(null);
  };

  const abrirCasoPronto = async (casoDb) => {
    const aj = casoDb?.analise_json || {};
    const caso = aj.caso || {};
    const calculos = aj.calculos || [];
    const dadosReceita = aj.dadosReceita || [];
    const dadosCep = aj.dadosCep || [];
    const blocos = aj.blocos || {};
    setFilaOpen(false);
    setMessages([
      { role: 'user', text: `📋 Caso recebido via webhook — ${casoDb.recl_nome || caso.recl_nome || 'Caso'}` },
      { role: 'assistant', text: 'Petição gerada automaticamente pelo webhook. Confira o documento e exporte quando revisar.' },
    ]);
    // Reconstroi o `dados` (determinístico) + merge dos capítulos redigidos pela IA
    let dados = {};
    try {
      dados = montarDadosTemplate({ caso, calculos, attrs: caso, dadosReceita, dadosCep });
    } catch (e) { console.error(e); }
    Object.assign(dados, blocos);
    if (blocos.BLOCO_DANO_MORAL) dados.DANO_MORAL_FATO_ESPECIFICO = blocos.BLOCO_DANO_MORAL;
    // Preview do template preenchido
    // Preview tem de usar o MESMO modelo da exportação: o vigente do cadastro
    // vem primeiro; a URL congelada no caso só serve de reserva. Sem isto, o
    // advogado revisava um documento e baixava outro.
    const urlCaso = templatePadrao?.url || aj.modelo_docx_url || config?.template_docx_url || '';
    setTemplateCaso(aj.modelo_docx_url ? { url: aj.modelo_docx_url, nome: aj.template_nome || 'modelo do evento' } : null);
    let html = '';
    if (urlCaso) {
      try {
        const esqueleto = await carregarEsqueletoTemplate(urlCaso);
        html = preencherEsqueleto(esqueleto, dados, { highlight: true });
        setUrlPreview(urlCaso);
      } catch (e) { console.error(e); }
    }
    setDocHtml(html);
    setUltimaGeracao({ caso, calculos, dados });
    setReviewConfirmed(false);
    setAttrs(caso);
    setCasoWebhook({ caso, entrevista_texto: casoDb.entrevista_texto || '' });
    setCasoDbId(casoDb.id || null);
  };

  // Relê o modelo oficial NA HORA de exportar. O template era carregado uma vez,
  // na montagem da tela: quem trocasse o .docx com a aba aberta continuava
  // exportando o arquivo antigo até recarregar a página — e a peça saía idêntica,
  // sem nenhum sinal de que o modelo novo não tinha sido usado.
  const resolverTemplateAtual = async () => {
    try {
      const lista = await base44.entities.PetitionTemplate.filter({ is_active: true });
      const t = (lista || []).find((x) => Array.isArray(x.tags) && x.tags.includes('blocos') && x.modelo_docx_url);
      if (t?.modelo_docx_url) {
        setTemplatePadrao({ url: t.modelo_docx_url, nome: t.modelo_docx_name || t.name });
        return t.modelo_docx_url;
      }
    } catch { /* sem rede: segue com o que já está em memória */ }
    return templateUrl;
  };

  const exportar = async () => {
    if (!temTemplate || !ultimaGeracao || !reviewConfirmed || exporting) return;
    setExporting(true);
    try {
      const urlAtual = await resolverTemplateAtual();
      await exportarDocxTemplate(urlAtual, ultimaGeracao.dados, 'Petição inicial');
    } catch (err) {
      // A conferência final (preencherDocxTemplate) aponta campo não preenchido,
      // tag não substituída, envelope de JSON etc. Ela AVISA, mas não decide: o
      // download tem de sair mesmo com pendência — quem julga se a minuta serve
      // é o advogado, e travar o arquivo só atrapalha o trabalho. O arquivo com
      // pendência sai com o nome marcado, para ninguém confundir com a peça final.
      if (err?.achados?.length) {
        const seguir = window.confirm(`${err.message}\n\nBaixar assim mesmo, com as pendências acima?`);
        if (seguir) {
          await exportarDocxTemplate(
            await resolverTemplateAtual(),
            ultimaGeracao.dados,
            'Petição inicial (COM PENDÊNCIAS - revisar)',
            { permitirPendencias: true },
          );
        }
        return;
      }
      console.error(err);
      window.alert(`Não foi possível exportar o documento: ${err?.message || 'verifique o template .docx e as tags.'}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-3 border-b border-border bg-card flex-shrink-0">
        <Link to="/modelos-referencia" className="text-muted-foreground hover:text-foreground" title="Modelos / Configurações">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm sm:text-base font-semibold text-foreground truncate">Gerar por Entrevista</h1>
          <p className="hidden sm:block text-xs text-muted-foreground truncate">
            Selecione o caso na fila, revise a petição preenchida e exporte fiel ao .docx.
          </p>
        </div>
        <button
          onClick={() => setLogsOpen(true)}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full"
          title="Ver logs da sessão"
        >
          <ScrollText className="w-4 h-4" />
        </button>
        <button
          onClick={() => setFilaOpen(true)}
          className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full"
          title="Fila de entrevistas (webhook)"
        >
          <Inbox className="w-4 h-4" />
          {filaCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-primary text-primary-foreground text-[10px] font-semibold rounded-full flex items-center justify-center">
              {filaCount}
            </span>
          )}
        </button>
        <Link to="/modelos-referencia" className="flex items-center gap-1.5 text-xs text-primary-ink hover:underline whitespace-nowrap p-2 sm:p-0" title="Configurações">
          <Library className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">Configurações</span>
        </Link>
      </div>

      {/* Barra do template .docx */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 sm:px-6 py-2 border-b border-muted bg-card flex-shrink-0">
        <span className="text-xs text-muted-foreground">Template .docx:</span>
        {temTemplate ? (
          <span className="text-xs font-medium text-success truncate max-w-full sm:max-w-[420px]">
            {templateNome || 'enviado'}
          </span>
        ) : (
          <Link to="/modelos-referencia" className="text-xs font-medium text-destructive hover:underline">
            nenhum — enviar em Configurações
          </Link>
        )}
        {attrs && (attrs.funcao || attrs.tipo_dispensa) && (
          <span className="text-[11px] text-muted-foreground/70">
            {attrs.funcao || '—'} · {TIPO_DISPENSA_LABELS[attrs.tipo_dispensa]?.split('(')[0]?.trim() || attrs.tipo_dispensa || '—'}
          </span>
        )}
        {generating && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-primary-ink">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Preenchendo a peça...
          </span>
        )}
      </div>

      {/* Corpo: documento. O container NÃO rola — quem rola é o painel de
          dentro, que precisa de `min-h-0` para encolher abaixo do conteúdo. */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Documento */}
        <div className="relative flex flex-col flex-1 min-h-0 min-w-0 bg-muted">
          {listaTopicosAberta && docHtml && (
            <EscolherTopico
              dados={ultimaGeracao?.dados || {}}
              onEscolher={(c) => { setTopicoEscolhido(c); setListaTopicosAberta(false); }}
              onFechar={() => setListaTopicosAberta(false)}
            />
          )}
          <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-border bg-card flex-shrink-0">
            <FileText className="w-4 h-4 text-primary-ink" />
            <span className="text-sm font-medium text-foreground truncate flex-1 min-w-0">Petição</span>
            {docHtml && (
              <button
                onClick={() => gerarMinuta()}
                disabled={generating}
                title="Reaplicar os dados ao template"
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-foreground rounded-lg text-xs font-medium hover:bg-muted transition-colors disabled:opacity-40"
              >
                <RefreshCw className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Atualizar</span>
              </button>
            )}
            {docHtml && (
              <button
                onClick={() => setListaTopicosAberta((v) => !v)}
                title="Escolher um capítulo redigido pela IA para refazer"
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-foreground rounded-lg text-xs font-medium hover:bg-muted transition-colors"
              >
                <Wand2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Refazer tópico</span>
              </button>
            )}
            {docHtml && !reviewConfirmed && (
              <span className="hidden md:inline text-[11px] text-warning">
                Confira os campos destacados
              </span>
            )}
            {docHtml && !reviewConfirmed && (
              <button
                onClick={() => {
                  setReviewConfirmed(true);
                  if (casoDbId) {
                    base44.entities.CasoTrabalhista.update(casoDbId, { status: 'pronto' }).catch(() => {});
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-primary text-primary-ink rounded-lg text-xs font-medium hover:bg-primary/10 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Confirmar revisão</span>
              </button>
            )}
            <button
              onClick={exportar}
              disabled={!temTemplate || !ultimaGeracao || !reviewConfirmed || exporting}
              title={!temTemplate ? 'Envie o template .docx em Configurações' : !reviewConfirmed ? 'Confirme a revisão antes de exportar' : 'Exportar DOCX fiel ao modelo'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-success text-white rounded-lg text-xs font-medium hover:bg-success/90 transition-colors disabled:opacity-40"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{exporting ? 'Exportando...' : 'Exportar DOCX'}</span>
              <span className="sm:hidden">DOCX</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain p-4 lg:p-8 min-h-0 min-w-0 relative">
            {!temTemplate ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <AlertTriangle className="w-10 h-10 text-warning mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum template .docx configurado.</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Envie o modelo oficial (marcado com as tags) em{' '}
                  <Link to="/modelos-referencia" className="text-primary-ink hover:underline">Configurações</Link>.
                </p>
              </div>
            ) : docHtml ? (
              <>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  Para corrigir, selecione o trecho no documento ou use “Refazer tópico” acima.
                </p>
                <div onMouseUp={capturarSelecao} onTouchEnd={capturarSelecao}>
                  <DocumentReviewPreview html={docHtml} dimmed={generating} />
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <FileText className="w-10 h-10 text-border mb-3" />
                <p className="text-sm text-muted-foreground">A petição preenchida aparecerá aqui.</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Abra a fila de entrevistas (ícone de caixa no topo) e selecione um caso recebido.
                </p>
              </div>
            )}
            {generating && docHtml && (
              <div className="absolute inset-0 flex items-start justify-center pt-10 pointer-events-none">
                <span className="flex items-center gap-2 px-3 py-1.5 bg-card/90 border border-border rounded-full text-xs text-primary-ink shadow-sm">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Atualizando o documento...
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      {(trechoSelecionado || topicoEscolhido) && (
        <ComentarioTrecho
          trecho={topicoEscolhido ? topicoEscolhido.texto : trechoSelecionado}
          campoFixo={topicoEscolhido?.campo}
          rotulo={topicoEscolhido?.rotulo}
          dados={ultimaGeracao?.dados || {}}
          caso={ultimaGeracao?.caso || {}}
          onAplicar={aplicarCorrecao}
          onFechar={() => { setTrechoSelecionado(''); setTopicoEscolhido(null); }}
        />
      )}
      <FilaWebhooks open={filaOpen} onOpenChange={setFilaOpen} onSelecionar={abrirCasoPronto} />
      <SessionLogsModal open={logsOpen} onOpenChange={setLogsOpen} messages={[...messages, ...consoleLogs]} />
    </div>
  );
}