import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useEspecialista } from "@/hooks/useEspecialista";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Plus, Trash2, Copy, AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";
import DocumentUploader from "../components/petition/DocumentUploader";
import LaborCalculator from "../components/petition/LaborCalculator";
import PetitionStepIndicator from "../components/petition/PetitionStepIndicator";

const STEPS = ["Dados das Partes", "Detalhes do Caso", "Cálculos", "Documentos", "Modelo Obrigatório", "Revisão e Geração"];
const FORM_STORAGE_KEY = "juris_new_petition_form_v2";

function getInitialForm() {
  try {
    const saved = localStorage.getItem(FORM_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return {
    title: "",
    case_type: "trabalhista",
    rite: "ordinario",
    claimant_name: "",
    claimant_cpf: "",
    claimant_address: "",
    claimant_role: "",
    defendant_name: "",
    defendant_cnpj: "",
    defendant_address: "",
    contract_start: "",
    contract_end: "",
    salary: "",
    work_schedule: "",
    irregularities: "",
    additional_facts: "",
    jurisdiction: "",
    free_justice: true,
    digital_court: true,
    template_used: "",
    selected_template_id: "",
    document_urls: [],
    document_names: [],
    calculations: null,
    extra_defendants: [],
  };
}

// Extrai todos os marcadores [A PREENCHER: ...] do texto gerado
function extractPendencias(text) {
  const regex = /\[A PREENCHER:[^\]]+\]/g;
  return [...new Set(text.match(regex) || [])];
}

export default function NewPetition() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [petitionConfig, setPetitionConfig] = useState(null);
  const [generating, setGenerating] = useState(false);
  const { especialista: esp31 } = useEspecialista("31");
  const [generatingStep, setGeneratingStep] = useState("");
  const [generatingProgress, setGeneratingProgress] = useState(0);
  const [savedPetitionId, setSavedPetitionId] = useState(null);
  const [generatedContent, setGeneratedContent] = useState(null);
  const [generateError, setGenerateError] = useState(null);
  const [pendencias, setPendencias] = useState([]);
  const [form, setForm] = useState(getInitialForm);

  useEffect(() => {
    base44.entities.PetitionTemplate.filter({ is_active: true }).then(setTemplates).catch(() => {});
    base44.entities.PetitionConfig.filter({ ativo: true }).then((r) => setPetitionConfig(r[0] || null)).catch(() => {});
  }, []);

  const updateForm = (field, value) => setForm((prev) => {
    const next = { ...prev, [field]: value };
    try { localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  });

  // Retorna o template selecionado (obrigatório)
  const selectedTemplate = templates.find((t) => t.id === form.selected_template_id) || null;

  // Templates filtrados pelo case_type do formulário
  const compatibleTemplates = templates.filter((t) => !t.case_type || t.case_type === form.case_type);

  const buildAnchoredPrompt = (template, config, precs, calcCtx, docCtx) => {
    const systemPrompt = esp31?.prompt_sistema ||
      "Você é um advogado trabalhista brasileiro experiente. Elabore a petição inicial completa com base nos dados fornecidos.";

    // Bloco de ancoragem obrigatório
    const anchoringRules = `
════════════════════════════════════════════════════════════════════════
REGRAS ABSOLUTAS DE ANCORAGEM — VIOLAÇÃO INVALIDA A PEÇA
════════════════════════════════════════════════════════════════════════

1. ESTRUTURA OBRIGATÓRIA: Você DEVE seguir rigorosamente a estrutura/esqueleto do MODELO abaixo. Não invente seções, não omita seções previstas no modelo.

2. ANTI-ALUCINAÇÃO (proibição absoluta):
   - É TERMINANTEMENTE PROIBIDO inventar, presumir, estimar ou "completar" qualquer informação.
   - Dados proibidos de inventar: nomes, CPF, CNPJ, datas, valores, endereços, número de processo, súmulas, jurisprudência, dispositivos legais não citados nas fontes fornecidas.
   - Para TODA informação ausente ou incompleta nos dados do caso, use OBRIGATORIAMENTE o marcador: [A PREENCHER: descrição do dado faltante]
   - Exemplos corretos: [A PREENCHER: salário], [A PREENCHER: data de admissão], [A PREENCHER: número do processo]
   - Nunca estime valores de verbas — se não houver cálculo fornecido, use [A PREENCHER: valor da verba X]

3. TIMBRE E IDENTIFICAÇÃO DO ESCRITÓRIO: Use EXCLUSIVAMENTE os dados do escritório fornecidos abaixo. Nunca invente nome de advogado, OAB, endereço ou contatos.

4. JURISPRUDÊNCIA: Cite APENAS os precedentes listados abaixo. Nunca invente ou extrapole súmulas/jurisprudência.

5. AO FINAL DA PEÇA: Inclua uma seção "=== PENDÊNCIAS ===" listando todos os marcadores [A PREENCHER] presentes no texto, numerados.
════════════════════════════════════════════════════════════════════════`;

    // Timbre do escritório
    const officeBlock = config ? `
══ DADOS DO ESCRITÓRIO — USO EXCLUSIVO ══
Escritório: ${config.escritorio}
Advogado: ${config.advogado_principal}
OAB: ${config.oab}/${config.uf_oab || ""}
E-mail: ${config.email_contato || "[A PREENCHER: e-mail]"}
Telefone: ${config.telefone || "[A PREENCHER: telefone]"}
Cidade/UF: ${config.cidade_sede || "[A PREENCHER: cidade]"}/${config.uf_sede || ""}
Site: ${config.site || ""}
${config.cabecalho_texto ? `Cabeçalho: ${config.cabecalho_texto}` : ""}
${config.rodape_texto ? `Rodapé: ${config.rodape_texto}` : ""}
══════════════════════════════════════════` : `
ATENÇÃO: Nenhum PetitionConfig ativo encontrado. Use [A PREENCHER: escritório], [A PREENCHER: advogado], [A PREENCHER: OAB] para todos os dados do procurador.`;

    // Modelo obrigatório
    const sep = "═".repeat(72);
    const templateBlock = `
${sep}
MODELO OBRIGATÓRIO — SIGA ESTA ESTRUTURA COMO ESQUELETO DA PEÇA
Nome do modelo: ${template.name} | Tipo: ${template.case_type}
${sep}
${template.content}
${sep}
FIM DO MODELO — TODA A PEÇA DEVE SEGUIR ESTA ESTRUTURA
${sep}`;

    // Dados do caso
    const s = form.salary ? `R$ ${parseFloat(form.salary).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "[A PREENCHER: salário base]";
    const caseBlock = `
DADOS DO CASO (USE APENAS ESTES — NÃO INVENTE NEM COMPLETE):

RECLAMANTE: ${form.claimant_name || "[A PREENCHER: nome do reclamante]"}
CPF: ${form.claimant_cpf || "[A PREENCHER: CPF]"}
Endereço: ${form.claimant_address || "[A PREENCHER: endereço do reclamante]"}
Função: ${form.claimant_role || "[A PREENCHER: função/cargo]"}

RÉU PRINCIPAL: ${form.defendant_name || "[A PREENCHER: nome da reclamada]"}
CNPJ: ${form.defendant_cnpj || "[A PREENCHER: CNPJ]"}
Endereço: ${form.defendant_address || "[A PREENCHER: endereço da reclamada]"}${
  form.extra_defendants?.length > 0
    ? "\n" + form.extra_defendants.map((d, i) =>
        `RECLAMADO ${i + 2}: ${d.name || "[A PREENCHER: nome]"} | CNPJ: ${d.cnpj || "[A PREENCHER: CNPJ]"} | Endereço: ${d.address || "[A PREENCHER: endereço]"}`
      ).join("\n")
    : ""
}

TIPO DE AÇÃO: ${form.case_type} — Rito: ${form.rite}
JURISDIÇÃO: ${form.jurisdiction || "[A PREENCHER: vara/jurisdição]"}
JUSTIÇA GRATUITA: ${form.free_justice ? "Sim" : "Não"} | JUÍZO DIGITAL: ${form.digital_court ? "Sim" : "Não"}

CONTRATO:
  Admissão: ${form.contract_start || "[A PREENCHER: data de admissão]"}
  Rescisão: ${form.contract_end || "[A PREENCHER: data de demissão ou informar se vigente]"}
  Salário Base: ${s}
  Jornada: ${form.work_schedule || "[A PREENCHER: jornada de trabalho]"}

IRREGULARIDADES:
${form.irregularities || "[A PREENCHER: irregularidades]"}

FATOS ADICIONAIS:
${form.additional_facts || "Não informados"}
${calcCtx}`;

    // Precedentes
    const precsBlock = precs.length > 0
      ? `\n\n═══ JURISPRUDÊNCIA AUTORIZADA — CITE APENAS ESTAS ═══\n` +
        precs.map((p) => `▸ ${p.title} (${p.source}${p.reference ? ` — ${p.reference}` : ""})\n${p.content}`).join("\n\n") +
        `\n═══ FIM DA JURISPRUDÊNCIA ═══`
      : "\n\nNenhum precedente cadastrado — não cite jurisprudência sem fonte verificada.";

    return `${systemPrompt}
${anchoringRules}
${officeBlock}
${templateBlock}
${caseBlock}
${precsBlock}
${docCtx}`;
  };

  const handleSaveDraft = async () => {
    try {
      const data = { ...form, salary: form.salary ? parseFloat(form.salary) : undefined, status: "rascunho" };
      if (savedPetitionId) {
        await base44.entities.Petition.update(savedPetitionId, data);
      } else {
        const p = await base44.entities.Petition.create(data);
        setSavedPetitionId(p.id);
      }
      toast.success("Rascunho salvo!");
    } catch (err) {
      toast.error("Erro ao salvar rascunho: " + err.message);
    }
  };

  const handleGenerate = async () => {
    // Validação: modelo obrigatório
    if (!selectedTemplate) {
      toast.error("Selecione um modelo (PetitionTemplate) antes de gerar a petição.");
      setStep(4);
      return;
    }

    setGenerating(true);
    setGeneratingStep("Salvando rascunho...");
    setGenerateError(null);
    setGeneratingProgress(10);
    setPendencias([]);

    let petitionId = savedPetitionId;
    try {
      const draftData = {
        ...form,
        salary: form.salary ? parseFloat(form.salary) : undefined,
        template_used: selectedTemplate.name,
        status: "em_geracao",
      };
      if (petitionId) {
        await base44.entities.Petition.update(petitionId, draftData);
      } else {
        const p = await base44.entities.Petition.create(draftData);
        petitionId = p.id;
        setSavedPetitionId(p.id);
      }
    } catch (err) {
      toast.error("Erro ao salvar rascunho: " + err.message);
      setGenerating(false);
      return;
    }

    setGeneratingStep("Carregando precedentes e configurações...");
    setGeneratingProgress(25);

    // Carregar precedentes (Precedent + PrecedentV2)
    let precs = [];
    try {
      const [p1, p2] = await Promise.all([
        base44.entities.Precedent.filter({ is_active: true }).catch(() => []),
        base44.entities.PrecedentV2.filter({ is_active: true }).catch(() => []),
      ]);
      precs = [...p1, ...p2];
    } catch (e) {}

    // Contexto de cálculos
    let calcCtx = "";
    if (form.calculations?.formatted) {
      calcCtx = `\n\nCÁLCULOS DE VERBAS (USE ESTES VALORES — NÃO ESTIME):\n${form.calculations.formatted}`;
    } else {
      calcCtx = "\n\nNenhum cálculo de verbas fornecido — use [A PREENCHER: valor] para qualquer valor monetário não informado.";
    }

    let docCtx = "";
    if (form.document_urls.length > 0) {
      docCtx = `\n\nDocumentos anexados para análise: ${form.document_names.join(", ")}`;
    }

    const prompt = buildAnchoredPrompt(selectedTemplate, petitionConfig, precs, calcCtx, docCtx);
    const startTime = Date.now();

    try {
      const fileUrls = form.document_urls.length > 0 ? form.document_urls : undefined;
      setGeneratingStep("Enviando à IA (isso pode levar 2–4 minutos)...");
      setGeneratingProgress(40);

      const progressInterval = setInterval(() => {
        setGeneratingProgress((prev) => prev < 85 ? prev + 3 : prev);
      }, 3000);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Tempo limite excedido (5 min). Tente novamente.")), 5 * 60 * 1000)
      );

      const result = await Promise.race([
        base44.integrations.Core.InvokeLLM({
          prompt,
          file_urls: fileUrls,
          model: "claude_sonnet_4_6",
        }),
        timeoutPromise,
      ]);

      clearInterval(progressInterval);
      setGeneratingStep("Analisando pendências e salvando...");
      setGeneratingProgress(90);

      // Detectar pendências
      const foundPendencias = extractPendencias(result);
      setPendencias(foundPendencias);
      const hasPendencias = foundPendencias.length > 0;
      const finalStatus = hasPendencias ? "revisao_necessaria" : "concluida";

      // Salvar conteúdo
      const blob = new Blob([result], { type: "text/plain" });
      const file = new File([blob], "peticao.txt", { type: "text/plain" });
      const { file_url: contentUrl } = await base44.integrations.Core.UploadFile({ file });

      await base44.entities.Petition.update(petitionId, {
        generated_content: contentUrl,
        template_used: selectedTemplate.name,
        status: finalStatus,
      });

      // Incrementar use_count do template
      try {
        await base44.entities.PetitionTemplate.update(selectedTemplate.id, {
          use_count: (selectedTemplate.use_count || 0) + 1,
        });
      } catch (e) {}

      // Log de geração
      try {
        await base44.entities.GenerationLog.create({
          petition_id: petitionId,
          petition_title: form.title,
          status: "concluido",
          model_used: "claude_sonnet_4_6",
          template_id: selectedTemplate.id,
          precedents_count: precs.length,
          duration_seconds: Math.round((Date.now() - startTime) / 1000),
          generated_at: new Date().toISOString(),
        });
      } catch (e) {}

      try { localStorage.removeItem(FORM_STORAGE_KEY); } catch (e) {}
      setGeneratingProgress(100);
      setGeneratedContent(result);
      setGeneratingStep("concluido");

      if (hasPendencias) {
        toast.warning(`Petição gerada com ${foundPendencias.length} pendência(s) — revise os marcadores [A PREENCHER].`);
      } else {
        toast.success("Petição gerada com sucesso!");
      }
    } catch (err) {
      try { await base44.entities.Petition.update(petitionId, { status: "rascunho" }); } catch (e) {}
      try {
        await base44.entities.GenerationLog.create({
          petition_id: petitionId,
          petition_title: form.title,
          status: "erro",
          error_message: err.message,
          model_used: "claude_sonnet_4_6",
          duration_seconds: Math.round((Date.now() - startTime) / 1000),
          generated_at: new Date().toISOString(),
        });
      } catch (e) {}
      setGenerateError(err.message || "Erro desconhecido. Tente novamente.");
      toast.error("Erro ao gerar petição. Seus dados foram preservados.");
    } finally {
      setGenerating(false);
      setGeneratingProgress(0);
    }
  };

  const canProceed = () => {
    if (step === 0) return form.claimant_name && form.defendant_name && form.title;
    if (step === 1) return form.irregularities;
    if (step === 4) return !!selectedTemplate; // modelo obrigatório
    return true;
  };

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <h1 className="text-2xl lg:text-3xl font-playfair font-bold">Nova Petição</h1>
        <p className="text-muted-foreground mt-1">Geração rigorosa — baseada em modelo e dados reais</p>
      </div>

      {/* Aviso de configuração do escritório */}
      {!petitionConfig && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/30 text-sm">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <span className="text-foreground">
            Nenhuma configuração de escritório (PetitionConfig) encontrada. Os dados do procurador aparecerão como <strong>[A PREENCHER]</strong> na peça.{" "}
            <span className="text-muted-foreground">Configure em Dashboard → PetitionConfig.</span>
          </span>
        </div>
      )}

      <PetitionStepIndicator steps={STEPS} currentStep={step} />

      {generatedContent && (
        <Card className="p-6 lg:p-8 border-green-200 bg-green-50/30">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2 text-green-700">
              <Sparkles className="w-5 h-5" />
              <h3 className="font-semibold text-lg">
                {pendencias.length > 0 ? `Petição gerada — ${pendencias.length} pendência(s)` : "Petição Gerada com Sucesso!"}
              </h3>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => { navigator.clipboard.writeText(generatedContent); toast.success("Copiado!"); }}>
                <Copy className="w-4 h-4" /> Copiar
              </Button>
              <Button size="sm" className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => navigate(`/peticoes/${savedPetitionId}`)}>
                Ver Petição Completa <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {pendencias.length > 0 && (
            <div className="mb-4 p-4 rounded-xl bg-warning/10 border border-warning/30">
              <p className="text-sm font-semibold text-warning mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {pendencias.length} campo(s) precisam ser preenchidos manualmente:
              </p>
              <ul className="space-y-1">
                {pendencias.map((p, i) => (
                  <li key={i} className="text-xs text-muted-foreground font-mono bg-muted/40 px-2 py-1 rounded">{p}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-white rounded-xl border p-6 max-h-[500px] overflow-y-auto">
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{generatedContent}</pre>
          </div>
        </Card>
      )}

      {generateError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <p className="font-semibold mb-1">Erro ao gerar petição</p>
          <p>{generateError}</p>
          <p className="mt-2 text-xs text-red-600">Seus dados foram preservados. Tente novamente.</p>
        </div>
      )}

      <Card className="p-6 lg:p-8">
        {step === 0 && <StepParties form={form} updateForm={updateForm} />}
        {step === 1 && <StepDetails form={form} updateForm={updateForm} />}
        {step === 2 && <LaborCalculator form={form} updateForm={updateForm} />}
        {step === 3 && <DocumentUploader form={form} updateForm={updateForm} />}
        {step === 4 && (
          <StepModeloObrigatorio
            form={form}
            updateForm={updateForm}
            templates={compatibleTemplates}
            allTemplates={templates}
            selectedTemplate={selectedTemplate}
          />
        )}
        {step === 5 && (
          <StepReview
            form={form}
            selectedTemplate={selectedTemplate}
            petitionConfig={petitionConfig}
            generating={generating}
            generatingStep={generatingStep}
            generatingProgress={generatingProgress}
          />
        )}
      </Card>

      <div className="flex justify-between">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 0 || generating} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Anterior
          </Button>
          <Button variant="outline" onClick={handleSaveDraft} disabled={generating} className="gap-2 text-muted-foreground">
            Salvar Rascunho
          </Button>
        </div>

        {!isLastStep ? (
          <Button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canProceed() || generating}
            className="gap-2"
          >
            Próximo <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            onClick={handleGenerate}
            disabled={generating || !selectedTemplate}
            className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Gerar Petição</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Step 0: Partes ─────────────────────────────────────────────────── */
function StepParties({ form, updateForm }) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-1">Informações Gerais</h3>
        <p className="text-sm text-muted-foreground mb-4">Dados básicos da petição</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Título da Petição *</Label>
            <Input value={form.title} onChange={(e) => updateForm("title", e.target.value)} placeholder="Ex: Reclamatória Trabalhista — João vs Empresa X" className="mt-1.5" />
          </div>
          <div>
            <Label>Tipo de Ação</Label>
            <Select value={form.case_type} onValueChange={(v) => updateForm("case_type", v)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="trabalhista">Trabalhista</SelectItem>
                <SelectItem value="civel">Cível</SelectItem>
                <SelectItem value="previdenciario">Previdenciário</SelectItem>
                <SelectItem value="consumidor">Consumidor</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Rito</Label>
            <Select value={form.rite} onValueChange={(v) => updateForm("rite", v)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ordinario">Ordinário</SelectItem>
                <SelectItem value="sumarissimo">Sumaríssimo</SelectItem>
                <SelectItem value="sumario">Sumário</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Jurisdição / Vara</Label>
            <Input value={form.jurisdiction} onChange={(e) => updateForm("jurisdiction", e.target.value)} placeholder="Ex: 1ª Vara do Trabalho de São Paulo" className="mt-1.5" />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-1">Reclamante</h3>
        <p className="text-sm text-muted-foreground mb-4">Dados do trabalhador</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nome Completo *</Label>
            <Input value={form.claimant_name} onChange={(e) => updateForm("claimant_name", e.target.value)} placeholder="Nome completo" className="mt-1.5" />
          </div>
          <div>
            <Label>CPF</Label>
            <Input value={form.claimant_cpf} onChange={(e) => updateForm("claimant_cpf", e.target.value)} placeholder="000.000.000-00" className="mt-1.5" />
          </div>
          <div className="md:col-span-2">
            <Label>Endereço</Label>
            <Input value={form.claimant_address} onChange={(e) => updateForm("claimant_address", e.target.value)} placeholder="Endereço completo" className="mt-1.5" />
          </div>
          <div>
            <Label>Função / Cargo</Label>
            <Input value={form.claimant_role} onChange={(e) => updateForm("claimant_role", e.target.value)} placeholder="Ex: Vigilante patrimonial" className="mt-1.5" />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-1">Reclamado(s)</h3>
        <p className="text-sm text-muted-foreground mb-4">Dados da(s) empresa(s) reclamada(s)</p>
        <div className="p-4 rounded-xl border mb-3">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Reclamado 1 — Principal</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Razão Social *</Label>
              <Input value={form.defendant_name} onChange={(e) => updateForm("defendant_name", e.target.value)} placeholder="Nome da empresa" className="mt-1.5" />
            </div>
            <div>
              <Label>CNPJ</Label>
              <Input value={form.defendant_cnpj} onChange={(e) => updateForm("defendant_cnpj", e.target.value)} placeholder="00.000.000/0000-00" className="mt-1.5" />
            </div>
            <div className="md:col-span-2">
              <Label>Endereço</Label>
              <Input value={form.defendant_address} onChange={(e) => updateForm("defendant_address", e.target.value)} placeholder="Endereço completo" className="mt-1.5" />
            </div>
          </div>
        </div>

        {form.extra_defendants.map((d, i) => (
          <div key={i} className="p-4 rounded-xl border mb-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">Reclamado {i + 2}</p>
              <button
                onClick={() => updateForm("extra_defendants", form.extra_defendants.filter((_, idx) => idx !== i))}
                className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Razão Social</Label>
                <Input value={d.name} onChange={(e) => { const u = [...form.extra_defendants]; u[i] = { ...u[i], name: e.target.value }; updateForm("extra_defendants", u); }} placeholder="Nome da empresa" className="mt-1.5" />
              </div>
              <div>
                <Label>CNPJ</Label>
                <Input value={d.cnpj} onChange={(e) => { const u = [...form.extra_defendants]; u[i] = { ...u[i], cnpj: e.target.value }; updateForm("extra_defendants", u); }} placeholder="00.000.000/0000-00" className="mt-1.5" />
              </div>
              <div className="md:col-span-2">
                <Label>Endereço</Label>
                <Input value={d.address} onChange={(e) => { const u = [...form.extra_defendants]; u[i] = { ...u[i], address: e.target.value }; updateForm("extra_defendants", u); }} placeholder="Endereço completo" className="mt-1.5" />
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={() => updateForm("extra_defendants", [...form.extra_defendants, { name: "", cnpj: "", address: "" }])}
          className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors mt-1"
        >
          <Plus className="w-4 h-4" /> Adicionar outro reclamado
        </button>
      </div>
    </div>
  );
}

/* ── Step 1: Detalhes do caso ───────────────────────────────────────── */
function StepDetails({ form, updateForm }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Contrato de Trabalho</h3>
        <p className="text-sm text-muted-foreground mb-4">Detalhes do vínculo empregatício</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Data de Admissão</Label>
            <Input type="date" value={form.contract_start} onChange={(e) => updateForm("contract_start", e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label>Data de Demissão</Label>
            <Input type="date" value={form.contract_end} onChange={(e) => updateForm("contract_end", e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label>Salário Base (R$)</Label>
            <Input type="number" value={form.salary} onChange={(e) => updateForm("salary", e.target.value)} placeholder="0,00" className="mt-1.5" />
          </div>
        </div>
      </div>

      <div>
        <Label>Jornada de Trabalho</Label>
        <Textarea value={form.work_schedule} onChange={(e) => updateForm("work_schedule", e.target.value)} placeholder="Descreva a jornada detalhadamente. Ex: Escala 12x36, das 06:00 às 18:00..." className="mt-1.5 min-h-[120px]" />
      </div>

      <div>
        <Label>Irregularidades *</Label>
        <Textarea value={form.irregularities} onChange={(e) => updateForm("irregularities", e.target.value)} placeholder="Descreva todas as irregularidades: horas extras não pagas, intervalo suprimido, folgas trabalhadas, etc." className="mt-1.5 min-h-[160px]" />
      </div>

      <div>
        <Label>Fatos Adicionais</Label>
        <Textarea value={form.additional_facts} onChange={(e) => updateForm("additional_facts", e.target.value)} placeholder="Quaisquer fatos adicionais relevantes para a petição..." className="mt-1.5 min-h-[100px]" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex items-center justify-between p-4 rounded-xl border">
          <div>
            <Label>Justiça Gratuita</Label>
            <p className="text-xs text-muted-foreground">Solicitar benefício da justiça gratuita</p>
          </div>
          <Switch checked={form.free_justice} onCheckedChange={(v) => updateForm("free_justice", v)} />
        </div>
        <div className="flex items-center justify-between p-4 rounded-xl border">
          <div>
            <Label>Juízo 100% Digital</Label>
            <p className="text-xs text-muted-foreground">Tramitação digital</p>
          </div>
          <Switch checked={form.digital_court} onCheckedChange={(v) => updateForm("digital_court", v)} />
        </div>
      </div>
    </div>
  );
}

/* ── Step 4: Modelo Obrigatório ─────────────────────────────────────── */
function StepModeloObrigatorio({ form, updateForm, templates, allTemplates, selectedTemplate }) {
  const hasCompatible = templates.length > 0;
  const hasAny = allTemplates.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Modelo Obrigatório
        </h3>
        <p className="text-sm text-muted-foreground">
          Selecione o modelo que servirá de esqueleto para a petição. A IA seguirá rigorosamente esta estrutura.
        </p>
      </div>

      {/* Alerta: sem modelos */}
      {!hasAny && (
        <div className="flex items-start gap-3 p-5 rounded-xl bg-destructive/10 border border-destructive/30">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-destructive">Nenhum modelo cadastrado</p>
            <p className="text-sm text-muted-foreground mt-1">
              Cadastre pelo menos um PetitionTemplate em <strong>Modelos</strong> antes de gerar petições.
              Sem modelo, a geração não pode prosseguir.
            </p>
          </div>
        </div>
      )}

      {/* Alerta: sem compatíveis */}
      {hasAny && !hasCompatible && (
        <div className="flex items-start gap-3 p-5 rounded-xl bg-warning/10 border border-warning/30">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Nenhum modelo compatível com "{form.case_type}"</p>
            <p className="text-sm text-muted-foreground mt-1">
              Os modelos existentes não correspondem ao tipo de ação selecionado.
              Cadastre um modelo do tipo <strong>{form.case_type}</strong> ou selecione um dos modelos de outro tipo abaixo.
            </p>
          </div>
        </div>
      )}

      {/* Lista de modelos */}
      {(hasCompatible ? templates : allTemplates).map((t) => {
        const isSelected = form.selected_template_id === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => updateForm("selected_template_id", t.id)}
            className={`w-full text-left p-5 rounded-xl border-2 transition-all ${
              isSelected
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-foreground">{t.name}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{t.case_type}</span>
                  {t.use_count > 0 && (
                    <span className="text-xs text-muted-foreground">usado {t.use_count}×</span>
                  )}
                </div>
                {t.description && (
                  <p className="text-sm text-muted-foreground mt-1">{t.description}</p>
                )}
                {t.content && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2 font-mono bg-muted/30 p-2 rounded">
                    {t.content.slice(0, 200)}...
                  </p>
                )}
              </div>
              <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all mt-0.5 ${
                isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
              }`}>
                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />}
              </div>
            </div>
          </button>
        );
      })}

      {selectedTemplate && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Modelo <strong>"{selectedTemplate.name}"</strong> selecionado. A IA seguirá esta estrutura.</span>
        </div>
      )}
    </div>
  );
}

/* ── Step 5: Revisão Final ──────────────────────────────────────────── */
function StepReview({ form, selectedTemplate, petitionConfig, generating, generatingStep, generatingProgress }) {
  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <Sparkles className="w-12 h-12 mx-auto text-accent mb-3" />
        <h3 className="text-xl font-semibold">Revisão Final</h3>
        <p className="text-muted-foreground mt-1">Confira todos os dados antes de gerar a petição</p>
      </div>

      {/* Bloqueio se sem modelo */}
      {!selectedTemplate && (
        <div className="flex items-start gap-3 p-5 rounded-xl bg-destructive/10 border border-destructive/30">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-destructive">Modelo não selecionado</p>
            <p className="text-sm text-muted-foreground mt-1">Volte ao passo anterior e selecione um modelo para poder gerar a petição.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReviewSection title="Reclamante">
          <ReviewItem label="Nome" value={form.claimant_name} />
          <ReviewItem label="CPF" value={form.claimant_cpf} />
          <ReviewItem label="Função" value={form.claimant_role} />
        </ReviewSection>

        <ReviewSection title="Reclamado(s)">
          <ReviewItem label="Empresa" value={form.defendant_name} />
          <ReviewItem label="CNPJ" value={form.defendant_cnpj} />
          {form.extra_defendants?.map((d, i) => (
            <ReviewItem key={i} label={`Reclamado ${i + 2}`} value={d.name} />
          ))}
        </ReviewSection>

        <ReviewSection title="Contrato">
          <ReviewItem label="Admissão" value={form.contract_start} />
          <ReviewItem label="Demissão" value={form.contract_end || "Vigente"} />
          <ReviewItem label="Salário" value={form.salary ? `R$ ${parseFloat(form.salary).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""} />
        </ReviewSection>

        <ReviewSection title="Configurações">
          <ReviewItem label="Tipo" value={form.case_type} />
          <ReviewItem label="Rito" value={form.rite} />
          <ReviewItem label="Justiça Gratuita" value={form.free_justice ? "Sim" : "Não"} />
          <ReviewItem label="Documentos" value={`${form.document_urls.length} arquivo(s)`} />
          <ReviewItem label="Cálculos" value={form.calculations ? "Incluídos" : "Não informados"} />
        </ReviewSection>

        {selectedTemplate && (
          <ReviewSection title="Modelo Selecionado">
            <ReviewItem label="Nome" value={selectedTemplate.name} />
            <ReviewItem label="Tipo" value={selectedTemplate.case_type} />
          </ReviewSection>
        )}

        {petitionConfig && (
          <ReviewSection title="Escritório (PetitionConfig)">
            <ReviewItem label="Escritório" value={petitionConfig.escritorio} />
            <ReviewItem label="Advogado" value={petitionConfig.advogado_principal} />
            <ReviewItem label="OAB" value={`${petitionConfig.oab}/${petitionConfig.uf_oab || ""}`} />
          </ReviewSection>
        )}
      </div>

      <div className="p-4 rounded-xl bg-muted/50">
        <h4 className="font-medium text-sm mb-2">Irregularidades</h4>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{form.irregularities || "Não informadas"}</p>
      </div>

      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-sm">
        <p className="font-semibold text-primary mb-1">Modo anti-alucinação ativo</p>
        <p className="text-muted-foreground">
          Campos não preenchidos aparecerão como <span className="font-mono text-xs bg-muted px-1 rounded">[A PREENCHER: ...]</span> na peça.
          Nenhum dado será inventado. Jurisprudência restrita aos precedentes cadastrados.
        </p>
      </div>

      {generating && (
        <div className="text-center py-8 space-y-4">
          <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
          <p className="font-semibold text-foreground">Gerando petição ancorada com IA...</p>
          <p className="text-sm text-muted-foreground">{generatingStep}</p>
          {generatingProgress > 0 && (
            <div className="max-w-sm mx-auto">
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-accent h-2 rounded-full transition-all duration-500" style={{ width: `${generatingProgress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{generatingProgress}%</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Não feche esta aba — seus dados estão salvos.</p>
        </div>
      )}
    </div>
  );
}

function ReviewSection({ title, children }) {
  return (
    <div className="p-4 rounded-xl border">
      <h4 className="font-medium text-sm text-primary mb-3">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ReviewItem({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between text-sm gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
}