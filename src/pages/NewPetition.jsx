import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Plus, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";
import DocumentUploader from "../components/petition/DocumentUploader";
import LaborCalculator from "../components/petition/LaborCalculator";
import PetitionStepIndicator from "../components/petition/PetitionStepIndicator";

const STEPS = ["Dados das Partes", "Detalhes do Caso", "Cálculos", "Documentos", "Revisão e Geração"];
const FORM_STORAGE_KEY = "juris_new_petition_form";

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
    pinned_templates: [],
    document_urls: [],
    document_names: [],
    calculations: null,
    extra_defendants: [],
  };
}

export default function NewPetition() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState("");
  const [generatingProgress, setGeneratingProgress] = useState(0);
  const [savedPetitionId, setSavedPetitionId] = useState(null);
  const [generatedContent, setGeneratedContent] = useState(null);
  const [generateError, setGenerateError] = useState(null);
  const [form, setForm] = useState(getInitialForm);

  useEffect(() => {
    base44.entities.PetitionTemplate.filter({ is_active: true }).then(setTemplates).catch(() => {});
  }, []);

  const updateForm = (field, value) => setForm((prev) => {
    const next = { ...prev, [field]: value };
    try { localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  });

  const buildPrompt = (form, allTemplates, precedentsContext, calculationsContext, documentContext) => {
    const pinnedIds = form.pinned_templates || [];
    const activeTemplatesWithContent = allTemplates.filter((t) => t.content && t.is_active !== false);

    // Pinned = explicitly selected; others = all remaining active with content
    const pinnedTemplates = activeTemplatesWithContent.filter((t) => pinnedIds.includes(t.id));
    const otherTemplates = activeTemplatesWithContent.filter((t) => !pinnedIds.includes(t.id));
    // Pinned first, then others
    const orderedTemplates = [...pinnedTemplates, ...otherTemplates];

    let templateBlock = "";
    if (orderedTemplates.length > 0) {
      const pinnedNote = pinnedTemplates.length > 0
        ? `\n\nATENÇÃO: ${pinnedTemplates.length === 1 ? `O modelo "${pinnedTemplates[0].name}" foi` : `Os modelos ${pinnedTemplates.map(t => `"${t.name}"`).join(", ")} foram`} explicitamente vinculado(s) a esta petição. Priorize ${pinnedTemplates.length === 1 ? "seu" : "seus"} estilo e estrutura acima dos demais, mas absorva vocabulário e construções de todos os modelos listados abaixo.`
        : "";

      const sep = "=".repeat(70);
      const dot = "·".repeat(60);

      const modelosTexto = orderedTemplates
        .map((t, i) => {
          const isPinned = pinnedIds.includes(t.id);
          const label = isPinned
            ? `MODELO ${i + 1} ★ VINCULADO (PRIORIDADE MÁXIMA): ${t.name}`
            : `MODELO ${i + 1}: ${t.name}`;
          return `${label}\n${dot}\n${t.content}\n${dot}`;
        })
        .join("\n\n");

      templateBlock = `\n\n${sep}\nMODELOS DO ESCRITÓRIO — REFERÊNCIA ABSOLUTA DE LINGUAGEM, ESTILO E VOZ\n${sep}${pinnedNote}\n\nVocê tem acesso a ${orderedTemplates.length} modelo(s) reais produzidos pelos advogados deste escritório. Estes modelos DEFINEM como você deve escrever. Você É o advogado que escreveu esses modelos.\n\nO que extrair de cada modelo:\n- O vocabulário jurídico exato e as expressões recorrentes\n- O ritmo e a cadência dos parágrafos\n- Como os fatos são narrados — com que nível de detalhe, que tom emocional e técnico\n- A forma de construir os argumentos jurídicos tese a tese\n- Como os pedidos são formulados, numerados e justificados\n- O grau de combatividade e precisão técnica\n\nSua petição deve ser INDISTINGUÍVEL dos modelos abaixo em termos de linguagem e estilo. Adapte APENAS os fatos, as partes, as datas, os valores e as teses específicas do caso concreto.\n\n${modelosTexto}\n\n${sep}\nFIM DOS MODELOS — ESCREVA O CASO ATUAL COM ESTA MESMA LINGUAGEM E ESTILO\n${sep}`;
    }

    return `### PAPEL (ROLE)
Você é um advogado trabalhista altamente experiente, com atuação focada na elaboração de petições iniciais robustas, detalhadas e estrategicamente persuasivas, seguindo o padrão de escritórios especializados em contencioso trabalhista massivo e técnico. Sua escrita deve ser combativa, técnica, minuciosa e orientada à máxima procedência dos pedidos. Você não deve usar formato de LISTAS. Escreva todos os tópicos de forma altamente detalhada em parágrafos corridos e numerados.

---

### TAREFA/ATIVIDADE
Elaborar uma PETIÇÃO INICIAL TRABALHISTA COMPLETA, pelo rito ${form.rite}, com alto nível de detalhamento fático e jurídico, incluindo todos os pedidos cabíveis, fundamentação legal, jurisprudência pertinente e liquidação estimada dos pedidos com reflexos.

A formatação da peça deve ser em Arial tamanho 12, com espaçamento entre as linhas de 1,5, cada início de parágrafo deve ter o espaçamento de 3cm, os tópicos deverão estar em CAIXA ALTA e em NEGRITO e cada parágrafo deve ser NUMERADO.

---

### CONTEXTO

RECLAMANTE: ${form.claimant_name}
CPF: ${form.claimant_cpf}
Endereço: ${form.claimant_address}
Função: ${form.claimant_role}

RECLAMADO PRINCIPAL: ${form.defendant_name}
CNPJ: ${form.defendant_cnpj}
Endereço: ${form.defendant_address}${form.extra_defendants?.length > 0 ? "\n" + form.extra_defendants.map((d, i) => `\nRECLAMADO ${i + 2}: ${d.name}\nCNPJ: ${d.cnpj}\nEndereço: ${d.address}`).join("") : ""}

CONTRATO:
Admissão: ${form.contract_start}
Rescisão: ${form.contract_end || "Contrato em vigor"}
Salário: R$ ${form.salary}
Jornada: ${form.work_schedule}

IRREGULARIDADES RELATADAS PELO CLIENTE:
${form.irregularities}

FATOS ADICIONAIS:
${form.additional_facts || "Não informados"}

JURISDIÇÃO: ${form.jurisdiction}
JUSTIÇA GRATUITA: ${form.free_justice ? "Sim" : "Não"}
JUÍZO 100% DIGITAL: ${form.digital_court ? "Sim" : "Não"}${calculationsContext}

---

### RACIOCÍNIO

A petição deve obrigatoriamente descrever de forma rica, detalhada e estratégica a jornada real de trabalho, demonstrando fraude sistemática na jornada com base em extrapolação habitual, trabalho em folgas e supressão de intervalo.

As teses principais a desenvolver são: descaracterização da escala (quando aplicável); horas extras além da 8ª diária e 44ª semanal; pagamento dos minutos que antecedem e sucedem a jornada (art. 58 §1º CLT); intervalo intrajornada suprimido (art. 71 CLT); reflexos em DSR, férias + 1/3, 13º salário, FGTS + 40%; integração de valores pagos extrafolha; e eventual aplicação de CCT.

Fundamentação legal obrigatória: CLT arts. 58, 59, 71, 818; Súmulas TST 85, 338, 444; OJs pertinentes; jurisprudência atual.

Estratégias processuais obrigatórias: impugnação de cartões de ponto, pedido de exibição de documentos, produção de prova testemunhal, linguagem técnica e persuasiva com trechos enfáticos em CAIXA ALTA quando estratégico.

Validar internamente: coerência dos pedidos, compatibilidade entre fatos, fundamentos e pedidos, ausência de contradições.

---

### INSTRUÇÃO SOBRE OS CÁLCULOS
Utilize OBRIGATORIAMENTE os valores da memória de cálculo na seção de PEDIDOS. Cada pedido deve conter o valor estimado calculado. Na seção de liquidação, reproduza a memória de cálculo de forma técnica e detalhada, justificando cada verba com base na jornada real descrita.

---

### FORMATO DE SAÍDA

A petição deve seguir EXATAMENTE a seguinte estrutura:
1. Endereçamento formal
2. Qualificação completa das partes
3. Competência
4. Justiça gratuita
5. Juízo 100% digital
6. Contrato de trabalho
7. Jornada de trabalho (detalhada e estratégica)
8. Tópicos jurídicos individualizados com títulos em CAIXA ALTA e NEGRITO: HORAS EXTRAS, DESCARACTERIZAÇÃO DA JORNADA, INTERVALO INTRAJORNADA, MINUTOS RESIDUAIS, DSR, INTEGRAÇÃO DE VALORES EXTRAFOLHA, e outros pertinentes ao caso
9. Fundamentação jurídica com legislação e jurisprudência
10. Seção completa de PEDIDOS: enumerados (a, b, c...), com valores estimados e reflexos discriminados
11. Requerimentos finais
12. Valor da causa
13. Fechamento formal

A redação deve ser contínua, sem simplificações, com alto nível técnico.

---

### CONDIÇÕES FINAIS

A resposta será considerada excelente se reproduzir fielmente o estilo combativo e detalhado dos modelos do escritório, apresentar profundidade jurídica e estratégica real, contiver todos os pedidos possíveis para o caso com valores discriminados, estiver pronta para protocolo sem nenhuma edição, demonstrar coerência absoluta entre fatos, fundamentos e pedidos, e maximizar o potencial de procedência da ação.${templateBlock}${documentContext}${precedentsContext}`;
  };

  const handleSaveDraft = async () => {
    try {
      const data = {
        ...form,
        salary: form.salary ? parseFloat(form.salary) : undefined,
        status: "rascunho",
      };
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
    setGenerating(true);
    setGeneratingStep("Salvando rascunho...");
    setGenerateError(null);
    setGeneratingProgress(10);

    let petitionId = savedPetitionId;
    try {
      const draftData = {
        ...form,
        salary: form.salary ? parseFloat(form.salary) : undefined,
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

    setGeneratingStep("Carregando modelos e precedentes...");
    setGeneratingProgress(25);

    let precedentsContext = "";
    try {
      const precs = await base44.entities.Precedent.filter({ is_active: true });
      if (precs.length > 0) {
        precedentsContext = `\n\n### PRECEDENTES E JURISPRUDÊNCIAS DO ADVOGADO\nUtilize OBRIGATORIAMENTE os seguintes precedentes na fundamentação jurídica da petição:\n\n` +
          precs.map(p => `**${p.title}** (${p.source}${p.reference ? ` - ${p.reference}` : ""})\n${p.content}`).join("\n\n");
      }
    } catch (e) { /* ignore */ }

    const calculationsContext = form.calculations?.formatted
      ? `\n\n${form.calculations.formatted}`
      : "";

    let documentContext = "";
    if (form.document_urls.length > 0) {
      documentContext = `\n\nDocumentos anexados para análise: ${form.document_names.join(", ")}`;
    }

    const prompt = buildPrompt(form, templates, precedentsContext, calculationsContext, documentContext);
    const startTime = Date.now();

    try {
      const fileUrls = form.document_urls.length > 0 ? form.document_urls : undefined;
      setGeneratingStep("Enviando dados para a IA (isso pode levar 2–4 minutos)...");
      setGeneratingProgress(40);

      const progressInterval = setInterval(() => {
        setGeneratingProgress(prev => prev < 85 ? prev + 3 : prev);
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
      setGeneratingStep("Salvando petição...");
      setGeneratingProgress(90);

      const blob = new Blob([result], { type: "text/plain" });
      const file = new File([blob], "peticao.txt", { type: "text/plain" });
      const { file_url: contentUrl } = await base44.integrations.Core.UploadFile({ file });

      await base44.entities.Petition.update(petitionId, {
        generated_content: contentUrl,
        status: "concluida",
      });

      try {
        await base44.entities.GenerationLog.create({
          petition_id: petitionId,
          petition_title: form.title,
          status: "concluido",
          model_used: "claude_sonnet_4_6",
          duration_seconds: Math.round((Date.now() - startTime) / 1000),
          generated_at: new Date().toISOString(),
        });
      } catch (e) {}

      try { localStorage.removeItem(FORM_STORAGE_KEY); } catch (e) {}
      setGeneratingProgress(100);
      setGeneratedContent(result);
      setGeneratingStep("concluido");
      toast.success("Petição gerada com sucesso!");
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
        <p className="text-muted-foreground mt-1">Preencha os dados para gerar sua petição inicial</p>
      </div>

      <PetitionStepIndicator steps={STEPS} currentStep={step} />

      {generatedContent && (
        <Card className="p-6 lg:p-8 border-green-200 bg-green-50/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-green-700">
              <Sparkles className="w-5 h-5" />
              <h3 className="font-semibold text-lg">Petição Gerada com Sucesso!</h3>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => { navigator.clipboard.writeText(generatedContent); toast.success("Copiado!"); }}>
                <Copy className="w-4 h-4" /> Copiar
              </Button>
              <Button size="sm" className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => navigate(`/peticoes/${savedPetitionId}`)}>
                Ver Petição Completa <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-6 max-h-[500px] overflow-y-auto">
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{generatedContent}</pre>
          </div>
        </Card>
      )}

      {generateError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <p className="font-semibold mb-1">Erro ao gerar petição</p>
          <p>{generateError}</p>
          <p className="mt-2 text-xs text-red-600">Seus dados foram preservados. Clique em "Gerar Petição" para tentar novamente.</p>
        </div>
      )}

      <Card className="p-6 lg:p-8">
        {step === 0 && <StepParties form={form} updateForm={updateForm} />}
        {step === 1 && <StepDetails form={form} updateForm={updateForm} templates={templates} />}
        {step === 2 && <LaborCalculator form={form} updateForm={updateForm} />}
        {step === 3 && <DocumentUploader form={form} updateForm={updateForm} />}
        {step === 4 && <StepReview form={form} generating={generating} generatingStep={generatingStep} generatingProgress={generatingProgress} onGenerate={handleGenerate} />}
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
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed() || generating} className="gap-2">
            Próximo <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button onClick={handleGenerate} disabled={generating} className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
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

function StepParties({ form, updateForm }) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-1">Informações Gerais</h3>
        <p className="text-sm text-muted-foreground mb-4">Dados básicos da petição</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Título da Petição *</Label>
            <Input value={form.title} onChange={(e) => updateForm("title", e.target.value)} placeholder="Ex: Reclamatória Trabalhista - João vs Empresa X" className="mt-1.5" />
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
          <div key={i} className="p-4 rounded-xl border mb-3 relative">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">Reclamado {i + 2}</p>
              <button
                onClick={() => {
                  const updated = form.extra_defendants.filter((_, idx) => idx !== i);
                  updateForm("extra_defendants", updated);
                }}
                className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Razão Social</Label>
                <Input value={d.name} onChange={(e) => {
                  const updated = [...form.extra_defendants];
                  updated[i] = { ...updated[i], name: e.target.value };
                  updateForm("extra_defendants", updated);
                }} placeholder="Nome da empresa" className="mt-1.5" />
              </div>
              <div>
                <Label>CNPJ</Label>
                <Input value={d.cnpj} onChange={(e) => {
                  const updated = [...form.extra_defendants];
                  updated[i] = { ...updated[i], cnpj: e.target.value };
                  updateForm("extra_defendants", updated);
                }} placeholder="00.000.000/0000-00" className="mt-1.5" />
              </div>
              <div className="md:col-span-2">
                <Label>Endereço</Label>
                <Input value={d.address} onChange={(e) => {
                  const updated = [...form.extra_defendants];
                  updated[i] = { ...updated[i], address: e.target.value };
                  updateForm("extra_defendants", updated);
                }} placeholder="Endereço completo" className="mt-1.5" />
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

function StepDetails({ form, updateForm, templates }) {
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
        <Textarea
          value={form.work_schedule}
          onChange={(e) => updateForm("work_schedule", e.target.value)}
          placeholder="Descreva a jornada detalhadamente. Ex: Escala 12x36, das 06:00 às 18:00, com entrada 30min antes e saída 30min depois..."
          className="mt-1.5 min-h-[120px]"
        />
      </div>

      <div>
        <Label>Irregularidades *</Label>
        <Textarea
          value={form.irregularities}
          onChange={(e) => updateForm("irregularities", e.target.value)}
          placeholder="Descreva todas as irregularidades: horas extras não pagas, intervalo suprimido, folgas trabalhadas, pagamentos por fora, etc."
          className="mt-1.5 min-h-[160px]"
        />
      </div>

      <div>
        <Label>Fatos Adicionais</Label>
        <Textarea
          value={form.additional_facts}
          onChange={(e) => updateForm("additional_facts", e.target.value)}
          placeholder="Quaisquer fatos adicionais relevantes para a petição..."
          className="mt-1.5 min-h-[100px]"
        />
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

      {templates.length > 0 && (
        <div>
          <Label>Modelos Vinculados (opcional)</Label>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">
            Todos os modelos ativos são usados como referência de estilo. Vincule um ou mais para dar prioridade máxima ao estilo deles nesta petição.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {templates.map((t) => {
              const pinned = (form.pinned_templates || []).includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    const current = form.pinned_templates || [];
                    const updated = pinned
                      ? current.filter((id) => id !== t.id)
                      : [...current, t.id];
                    updateForm("pinned_templates", updated);
                  }}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    pinned
                      ? "border-amber-400 bg-amber-50 text-amber-800"
                      : "border-border hover:border-primary/40 hover:bg-muted/50 text-foreground"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                    pinned ? "border-amber-500 bg-amber-500" : "border-muted-foreground/40"
                  }`}>
                    {pinned && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{t.case_type}</p>
                  </div>
                  {pinned && (
                    <span className="ml-auto text-xs font-semibold text-amber-600 shrink-0">★ Vinculado</span>
                  )}
                </button>
              );
            })}
          </div>
          {(form.pinned_templates || []).length > 0 && (
            <p className="text-xs text-amber-700 mt-2 font-medium">
              {(form.pinned_templates || []).length} modelo(s) vinculado(s) com prioridade máxima
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StepReview({ form, generating, generatingStep, generatingProgress }) {
  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <Sparkles className="w-12 h-12 mx-auto text-accent mb-3" />
        <h3 className="text-xl font-semibold">Revisão Final</h3>
        <p className="text-muted-foreground mt-1">Confira os dados antes de gerar a petição</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
          <ReviewItem label="Salário" value={form.salary ? `R$ ${form.salary}` : ""} />
        </ReviewSection>

        <ReviewSection title="Configurações">
          <ReviewItem label="Tipo" value={form.case_type} />
          <ReviewItem label="Rito" value={form.rite} />
          <ReviewItem label="Justiça Gratuita" value={form.free_justice ? "Sim" : "Não"} />
          <ReviewItem label="Documentos" value={`${form.document_urls.length} arquivo(s)`} />
        </ReviewSection>
      </div>

      <div className="p-4 rounded-xl bg-muted/50">
        <h4 className="font-medium text-sm mb-2">Irregularidades</h4>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{form.irregularities || "Não informadas"}</p>
      </div>

      {generating && (
        <div className="text-center py-8 space-y-4">
          <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
          <p className="font-semibold text-foreground">Gerando sua petição com IA...</p>
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
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}