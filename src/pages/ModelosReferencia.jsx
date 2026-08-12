import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Upload, Download, Library, CheckCircle2, AlertCircle, FileText, SlidersHorizontal } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { TIPO_DISPENSA_LABELS } from '@/features/entrevista/lib/tokens';
import { extrairTextoDocx, classificarTextoModelo, resumirDiferencial } from '@/features/entrevista/lib/modelosReferencia';
import { invalidateRuntimeCache } from '@/features/entrevista/lib/runtimeCache';
import { baixarTemplateCorrigido } from '@/features/entrevista/lib/gerarTemplateCorrigido';
import TemplateAtualizarDocx from '@/features/entrevista/components/TemplateAtualizarDocx';

const RITO_LABEL = { ordinario: 'Ordinário', sumarissimo: 'Sumaríssimo' };

const norm = (s) => (s || '').toString().trim().toLowerCase();

export default function ModelosReferencia() {
  const [modelos, setModelos] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [peticoesDocx, setPeticoesDocx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importando, setImportando] = useState(false);
  const [msg, setMsg] = useState(null);
  const [erro, setErro] = useState(null);
  const [config, setConfig] = useState(null);
  const [corrigindo, setCorrigindo] = useState(false);

  const load = () =>
    Promise.all([
      base44.entities.ModeloReferencia.list('-updated_date', 100).then(setModelos),
      base44.entities.Template.list('-updated_date', 100).then(setTemplates),
      base44.entities.PetitionTemplate.filter({ is_active: true }, '-updated_date', 100)
        .then((l) => setPeticoesDocx((l || []).filter((t) => t.modelo_docx_url))),
    ])
      .catch(() => setErro('Erro ao carregar os modelos.'))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    (async () => {
      try {
        const l = await base44.entities.IntegracaoConfig.list('-updated_date', 1);
        if (l?.[0]) {
          setConfig(l[0]);
        } else {
          const c = await base44.entities.IntegracaoConfig.create({
            chave: 'default', cnpj_ativo: true, cep_ativo: true, datajud_ativo: false, datajud_tribunal: 'trt2', datajud_size: 5,
          });
          setConfig(c);
        }
      } catch { /* mantém defaults implícitos */ }
    })();
  }, []);

  const salvarConfig = async (patch) => {
    // Upsert do singleton: garante o registro antes de gravar (nunca descarta em silêncio).
    let atual = config;
    if (!atual?.id) {
      const lista = await base44.entities.IntegracaoConfig.list('-updated_date', 1);
      atual = lista?.[0] || (await base44.entities.IntegracaoConfig.create({ chave: 'default' }));
    }
    setConfig({ ...atual, ...patch });
    await base44.entities.IntegracaoConfig.update(atual.id, patch);
    invalidateRuntimeCache('config-integracoes'); // muda a geração na hora (sem esperar o TTL)
  };

  // Modelo OFICIAL = o cadastrado com a tag "blocos", que é o que o webhook usa
  // para gerar e o que a exportação passou a usar. O IntegracaoConfig.
  // template_docx_url é apenas uma referência paralela, que ficou apontando para
  // um arquivo antigo — resolver o modelo por ele fazia o botão de troca sumir
  // (o find não casava com nenhum cadastro) e o "Baixar corrigido" corrigir o
  // arquivo errado.
  const templateOficial =
    peticoesDocx.find((t) => Array.isArray(t.tags) && t.tags.includes('blocos') && t.modelo_docx_url)
    || peticoesDocx.find((t) => t.modelo_docx_url === config?.template_docx_url)
    || peticoesDocx[0]
    || null;

  const baixarCorrigido = async () => {
    if (!templateOficial?.modelo_docx_url) return;
    setCorrigindo(true);
    setErro(null);
    setMsg(null);
    try {
      const r = await baixarTemplateCorrigido(templateOficial.modelo_docx_url, 'MODELO_PRINCIPAL_template_corrigido.docx');
      const itens = [
        r.saldoAdicionado && 'saldo de salário',
        r.multa467Adicionada && 'multa art. 467',
        r.multa477Adicionada && 'multa art. 477',
        r.salariosAbertoAdicionado && 'salários em aberto',
        r.autorCorrigido && 'gênero (o autor → o reclamante)',
        r.emailPreambuloAdicionado && 'e-mail no preâmbulo',
        r.rolValoresUnitariosRemovidos && 'rol sem valores unitários',
        r.honorariosCorrigido && 'R$ 10.012,79 → tag dinâmica',
        r.jornadaDeterministica && 'jornada volta a ser determinística',
        r.sumula331Deterministica && 'Súmula 331 determinística',
        r.contratoSempreVisivel && 'contrato sempre visível (com o salário)',
        r.contratoNumerado && 'contrato na numeração',
        r.percentuaisTokenizados && 'percentuais por categoria (multa e art. 71)',
        r.avisoCorrigido && 'aviso prévio sem os "23 dias" fixos',
        r.avosTokenizados && 'avos de 13º/férias dinâmicos',
        r.rolHorasAdicionado && 'verbas por hora no rol',
        r.rolNumerado && `rol numerado (${r.rolNumerado} itens)`,
        r.multasEmItens && 'multas convencionais item a item',
        r.rolDuplicadosRemovidos && `${r.rolDuplicadosRemovidos} pedido(s) duplicado(s) removido(s) do rol`,
        r.rolMultaTokenizada && 'percentual da multa também no rol',
        r.danoMoralReordenado && 'dano moral movido para depois dos tópicos fáticos',
        r.rolGenericosRemovidos && r.rolGenericosRemovidos + ' pedido(s) genérico(s) duplicado(s) removido(s)',
      ].filter(Boolean);
      setMsg(`Template corrigido baixado${itens.length ? ` (adicionado: ${itens.join(', ')})` : ' — já estava atualizado'}. Envie-o em “Trocar template” para torná-lo oficial.`);
    } catch (err) {
      console.error(err);
      setErro(`Erro ao gerar o template corrigido: ${err?.message || err}`);
    } finally {
      setCorrigindo(false);
    }
  };

  const salvarModeloPadrao = async (templateId) => {
    const anteriores = templates;
    const atualizados = templates.map((template) => ({
      ...template,
      is_default: template.id === templateId,
    }));
    setTemplates(atualizados);
    setErro(null);
    try {
      await base44.entities.Template.bulkUpdate(
        atualizados.map((template) => ({ id: template.id, is_default: template.is_default }))
      );
      setMsg('Modelo padrão atualizado.');
    } catch {
      setTemplates(anteriores);
      setErro('Erro ao definir o modelo padrão.');
    }
  };

  const handleImport = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setImportando(true);
    setErro(null);
    setMsg(null);
    let anexados = 0;
    let criados = 0;
    try {
      const atuais = await base44.entities.ModeloReferencia.list('-updated_date', 100);
      for (const file of files) {
        const textoAnon = await extrairTextoDocx(file); // texto já anonimizado
        // Distila só o DIFERENCIAL (o que é particular) — o texto padrão comum não é guardado.
        const [{ file_url: docxUrl }, diferencial] = await Promise.all([
          base44.integrations.Core.UploadFile({ file }),
          resumirDiferencial(textoAnon).catch(() => ''),
        ]);
        const dados = {
          arquivo_url: docxUrl,               // DOCX original (arquivo/referência; não vai à IA)
          diferencial,                        // o que é PARTICULAR deste modelo (usado na geração)
          conteudo: (textoAnon || '').slice(0, 1500), // prévia curta (anonimizada)
          resumo: '',                         // remove o resumo antigo
        };
        const match = atuais.find((m) => norm(m.arquivo_nome) === norm(file.name));
        if (match) {
          await base44.entities.ModeloReferencia.update(match.id, dados);
          anexados++;
        } else {
          await base44.entities.ModeloReferencia.create({
            titulo: file.name.replace(/\.docx$/i, ''),
            arquivo_nome: file.name,
            sindicato: 'SINDEEPRES',
            ativo: true,
            ...classificarTextoModelo(textoAnon),
            ...dados,
          });
          criados++;
        }
      }
      invalidateRuntimeCache('modelos-ativos'); // novo(s) modelo(s) entram no matching imediatamente
      setMsg(`Importação concluída: ${anexados} atualizado(s), ${criados} novo(s).`);
      await load();
    } catch (err) {
      console.error(err);
      setErro(`Erro ao importar: ${err.message || 'tente novamente'}`);
    }
    setImportando(false);
    e.target.value = '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-primary-ink animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Library className="w-5 h-5 text-primary-ink" /> Modelos de Referência
            </h1>
            <p className="text-xs text-muted-foreground">
              Peças corretas usadas como base para gerar novas minutas. A IA usa o <strong>diferencial</strong> de cada modelo
              para adaptar teses e capítulos ao tipo de caso — quanto mais preciso o diferencial, mais aderente a minuta.
            </p>
          </div>
          <div>
            <input type="file" multiple accept=".docx" onChange={handleImport} className="hidden" id="import-modelos" />
            <label
              htmlFor="import-modelos"
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
            >
              {importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importando ? 'Importando...' : 'Importar .docx'}
            </label>
          </div>
        </div>

        <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 text-xs text-foreground">
          Você pode enviar <strong>vários .docx de uma vez</strong>. O texto é <strong>anonimizado</strong> automaticamente
          (nomes, CPF, RG, PIS, endereços) e o sistema extrai apenas o <strong>diferencial</strong> — teses, capítulos e
          argumentos específicos que distinguem cada tipo de caso. Esse diferencial orienta a IA na redação quando um caso
          semelhante aparece: <strong>quanto mais completa a peça original, mais precisa a minuta gerada</strong>. Arquivos
          com o mesmo nome de um modelo existente o <strong>atualizam</strong>; os demais <strong>criam novos modelos</strong>.
        </div>

        <div className="bg-white border border-border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-foreground mb-1">Template principal da minuta</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Define a estrutura fixa da petição (tópicos, ordem, texto-padrão). A IA preenche esse template com os dados
            extraídos da entrevista — o modelo de referência mais aderente é selecionado automaticamente para enriquecer
            os capítulos de mérito específicos do caso.
          </p>
          {templates.length ? (
            <select
              value={templates.find((template) => template.is_default)?.id || ''}
              onChange={(e) => salvarModeloPadrao(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="" disabled>Selecione o template principal</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.title}</option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-amber-700">Nenhum template principal disponível.</p>
          )}
        </div>

        {config && (
          <div className="bg-white border border-border rounded-xl p-4">
            <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-primary-ink" /> Integrações (consultas externas)
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              Consultas automáticas que enriquecem os dados enviados à IA. Os resultados oficiais (Receita, ViaCEP, CNJ)
              são injetados no prompt como contexto — a IA usa esses dados para preencher qualificação, endereço e
              fundamentação jurisprudencial com precisão.
            </p>
            <div className="space-y-1">
              <Toggle
                label="Consulta de CNPJ (BrasilAPI)"
                desc="Busca razão social e endereço oficiais na Receita Federal. A IA usa esses dados para qualificar as reclamadas com precisão — sem isso, usa o que consta na entrevista."
                checked={!!config.cnpj_ativo}
                onChange={() => salvarConfig({ cnpj_ativo: !config.cnpj_ativo })}
              />
              <Toggle
                label="Consulta de CEP (ViaCEP)"
                desc="Completa logradouro, bairro, município e UF. Define a competência territorial (vara/TRT) e valida o local de prestação — a IA usa o município para endereçar a petição."
                checked={!!config.cep_ativo}
                onChange={() => salvarConfig({ cep_ativo: !config.cep_ativo })}
              />
              <Toggle
                label="Consulta ao DataJud (CNJ)"
                desc="Busca processos similares por tema no tribunal selecionado. A IA recebe os resultados como reforço argumentativo — requer a função de backend 'datajud' publicada."
                checked={!!config.datajud_ativo}
                onChange={() => salvarConfig({ datajud_ativo: !config.datajud_ativo })}
              />
            </div>
            {config.datajud_ativo && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <label className="text-xs text-muted-foreground">Tribunal DataJud:</label>
                <input
                  value={config.datajud_tribunal || 'trt2'}
                  onChange={(e) => setConfig({ ...config, datajud_tribunal: e.target.value })}
                  onBlur={(e) => salvarConfig({ datajud_tribunal: e.target.value.trim() || 'trt2' })}
                  className="text-xs border border-border rounded-md px-2 py-1 w-24 focus:outline-none focus:border-primary"
                />
                <span className="text-[11px] text-muted-foreground/70">ex.: trt2 (SP), trt1 (RJ), trt3 (MG), trt15 (Campinas)</span>
              </div>
            )}
          </div>
        )}

        {config && (
          <div className="bg-white border border-border rounded-xl p-4">
            <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary-ink" /> Template Word oficial (.docx)
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              Os modelos ficam cadastrados em <strong>Modelos de Petição</strong> (aba ao lado), com o .docx tokenizado
              de cada um. Aqui você apenas escolhe qual deles é usado por padrão na exportação — a formatação original
              (fonte, timbrado, espaçamento) é preservada 100%.
            </p>
            {peticoesDocx.length ? (
              <select
                value={templateOficial?.id || ''}
                onChange={(e) => {
                  const t = peticoesDocx.find((x) => x.id === e.target.value);
                  if (t) salvarConfig({ template_docx_url: t.modelo_docx_url, template_docx_nome: t.modelo_docx_name || t.name });
                }}
                className="w-full mb-3 rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="" disabled>Selecione o modelo padrão</option>
                {peticoesDocx.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-warning mb-3">
                Nenhum modelo com .docx tokenizado em Modelos de Petição — cadastre um lá para poder selecioná-lo aqui.
              </p>
            )}
            <TemplateAtualizarDocx
              template={templateOficial}
              onAtualizado={async ({ url, nome }) => {
                await salvarConfig({ template_docx_url: url, template_docx_nome: nome });
                await load();
                setMsg('Modelo atualizado com sucesso.');
              }}
            />
            <div className="flex items-center gap-3 flex-wrap mt-3">
              {templateOficial?.modelo_docx_url && (
                <button
                  onClick={baixarCorrigido}
                  disabled={corrigindo}
                  className="flex items-center gap-2 px-4 py-2 border border-success text-success rounded-lg text-sm font-medium hover:bg-success/10 transition-colors disabled:opacity-50"
                  title="Baixa uma cópia do template com as verbas faltantes no rol de pedidos (saldo de salário, multas 467/477 e salários em aberto)"
                >
                  {corrigindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {corrigindo ? 'Gerando...' : 'Baixar corrigido'}
                </button>
              )}
              {config.template_docx_url ? (
                <span className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {config.template_docx_nome || 'template enviado'}</span>
              ) : (
                <span className="text-xs text-warning">Nenhum template enviado ainda</span>
              )}
            </div>
          </div>
        )}

        {msg && (
          <p className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4" /> {msg}
          </p>
        )}
        {erro && (
          <p className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="w-4 h-4" /> {erro}
          </p>
        )}

        {modelos.length === 0 ? (
          <div className="text-center py-16 bg-white border border-border rounded-xl">
            <Library className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhum modelo de referência ainda</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Importe arquivos .docx para começar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {modelos.map((m) => (
              <div key={m.id} className="bg-white border border-border rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-primary-ink flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{m.titulo}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.funcao && <Badge>{m.funcao}</Badge>}
                      {m.rito && <Badge>{RITO_LABEL[m.rito] || m.rito}</Badge>}
                      {m.tipo_dispensa && <Badge>{TIPO_DISPENSA_LABELS[m.tipo_dispensa]?.split('(')[0]?.trim() || m.tipo_dispensa}</Badge>}
                      {m.tem_tomadora && <Badge>Tomadora (Súm. 331)</Badge>}
                      {m.diferencial
                        ? <Badge tone="green">Diferencial extraído</Badge>
                        : <Badge tone="amber">Sem diferencial</Badge>}
                    </div>
                    {(m.teses || []).length > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {(m.teses || []).slice(0, 8).join(' · ')}{(m.teses || []).length > 8 ? ' …' : ''}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }) {
  return (
    <label className="flex items-start justify-between gap-3 py-1.5 cursor-pointer select-none">
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {desc && <span className="block text-xs text-muted-foreground">{desc}</span>}
      </span>
      <span className="relative inline-flex flex-shrink-0 mt-0.5">
        <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
        <span className="w-9 h-5 rounded-full bg-border peer-checked:bg-primary transition-colors" />
        <span className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

function Badge({ children, tone = 'blue' }) {
  const cls = {
    blue: 'bg-primary/10 text-primary-ink',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
  }[tone];
  return <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${cls}`}>{children}</span>;
}