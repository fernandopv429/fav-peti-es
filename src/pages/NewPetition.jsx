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
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Plus, Trash2 } from "lucide-react";
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

  const [form, setForm] = useState(getInitialForm);

  useEffect(() => {
    base44.entities.PetitionTemplate.filter({ is_active: true }).then(setTemplates);
  }, []);

  const updateForm = (field, value) => setForm((prev) => {
    const next = { ...prev, [field]: value };
    try { localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  });

  const buildPrompt = (form, templates, precedentsContext, calculationsContext, documentContext) => {
    let templateContent = "";
    let templateStyleInstruction = "";
    if (form.template_used) {
      const tmpl = templates.find((t) => t.id === form.template_used);
      if (tmpl?.content) {
        templateStyleInstruction = `

⚠️ INSTRUÇÃO CRÍTICA — MODELO PADRÃO SELECIONADO:
Foi fornecido um MODELO PADRÃO abaixo. Você DEVE usar EXATAMENTE a mesma linguagem, tom, estilo de escrita, estrutura de parágrafos, vocabulário jurídico, forma de argumentação e padrão textual desse modelo. Não crie um estilo próprio. O modelo é sua referência primária de redação — adapte apenas os fatos, partes e pedidos ao caso concreto.`;
        templateContent = `

---
### MODELO PADRÃO — REPLIQUE ESTA LINGUAGEM E ESTILO

Esta é a petição-modelo que define COMO você deve escrever. Analise cuidadosamente o estilo, a forma de argumentar, o vocabulário e a estrutura. Sua petição gerada deve ser indistinguível em linguagem e tom deste modelo:

${tmpl.content}

--- FIM DO MODELO PADRÃO ---`;
      }
    }

    return `### PAPEL (ROLE)
Você é um advogado trabalhista sênior com mais de 20 anos de experiência em contencioso trabalhista. Você escreve suas petições com voz própria, autoridade e humanidade — como um profissional que conhece profundamente o caso do seu cliente e se importa com o resultado.${templateStyleInstruction}

### REGRAS CRÍTICAS DE LINGUAGEM (SIGA OBRIGATORIAMENTE)

1. ESCREVA COMO HUMANO: Use linguagem natural, fluida e autentíca. Evite frases genéricas, repetitivas ou que soam geradas por máquina.
2. VARIE AS CONSTRUÇÕES SINTÁTICAS: Alterne entre períodos curtos e longos. Não inicie parágrafos consecutivos da mesma forma.
3. EVITE PALAVRAS DE PREENCHIMENTO: Não use expressões como "é importante destacar", "cabe ressaltar", "outrossim", "nesse diapasão", "mister se faz", "ad argumentandum".
4. ARGUMENTAÇÃO DIRETA E FIRME: Afirme os fatos com convicção. Substitua "pode-se verificar que" por afirmações diretas.
5. CONTE A HISTÓRIA DO CLIENTE: Narre os fatos de forma cronológica e humanízada, como se estivesse apresentando o caso a um juiz pela primeira vez.
6. NÃO USE LISTAS: Escreva todos os argumentos em forma de texto corrido, em parágrafos numerados.
7. TOM: Combativo e técnico, mas humano. Não excessivamente formal ao ponto de soar robótico.

---

### TAREFA/ATIVIDADE
Elaborar uma PETIÇÃO INICIAL TRABALHISTA COMPLETA, pelo rito ${form.rite}, com alto nível de detalhamento fático e jurídico, incluindo todos os pedidos cabíveis, fundamentação legal, jurisprudência pertinente e liquidação estimada dos pedidos com reflexos.

A formatação da peça deve ser em Arial tamanho 12, com espaçamento entre as linhas de 1,5, cada início de parágrafo deve ter o espaçamento de 3cm, os tópicos deverão estar em CAIXA ALTA e em NEGRITO e cada parágrafo deve ser NUMERADO.

---

### CONTEXTO

**Reclamante:** ${form.claimant_name}
CPF: ${form.claimant_cpf}
Endereço: ${form.claimant_address}
Função: ${form.claimant_role}

**Reclamado 1 (Principal):** ${form.defendant_name}
CNPJ: ${form.defendant_cnpj}
Endereço: ${form.defendant_address}${form.extra_defendants?.length > 0 ? "\n" + form.extra_defendants.map((d, i) => `\n**Reclamado ${i + 2}:** ${d.name}\nCNPJ: ${d.cnpj}\nEndereço: ${d.address}`).join("") : ""}

**Contrato de Trabalho:**
Início: ${form.contract_start}
Término: ${form.contract_end || "Contrato vigente"}
Salário: R$ ${form.salary}

**Jornada de Trabalho:** ${form.work_schedule}

**Irregularidades:** ${form.irregularities}

**Fatos Adicionais:** ${form.additional_facts}

**Jurisdição:** ${form.jurisdiction}
**Justiça Gratuita:** ${form.free_justice ? "Sim" : "Não"}
**Juízo 100% Digital:** ${form.digital_court ? "Sim" : "Não"}${calculationsContext}

---

### RACIOCÍNIO

A petição deve obrigatoriamente:

- Descrever de forma rica, detalhada e estratégica a jornada real de trabalho
- Demonstrar fraude na jornada, com base em: extrapolação habitual, trabalho em folgas e supressão de intervalo
- Estruturar as seguintes teses principais:
  1. Descaracterização da escala (quando aplicável)
  2. Horas extras além da 8ª diária e 44ª semanal
  3. Pagamento dos minutos que antecedem e sucedem a jornada
  4. Intervalo intrajornada suprimido (art. 71 CLT)
  5. Reflexos em DSR, férias + 1/3, 13º, FGTS + 40%
  6. Integração de valores pagos "por fora"
  7. Eventual aplicação de CCT
- Utilizar fundamentos: CLT (arts. 58, 59, 71, 818), Súmulas do TST (85, 338, 444) e jurisprudência atual pertinente
- Incluir estratégias processuais: impugnação de cartões de ponto, pedido de exibição de documentos, produção de prova testemunhal
- Aplicar linguagem técnica, persuasiva, com trechos enfáticos em CAIXA ALTA quando estratégico
- Realizar validação interna: verificar coerência dos pedidos, garantir compatibilidade entre fatos, fundamentos e pedidos, evitar contradições

---

### INSTRUÇÃO SOBRE OS CÁLCULOS
Utilize OBRIGATORIAMENTE os valores da memória de cálculo abaixo na seção de PEDIDOS. Cada pedido deve conter o valor estimado calculado. Na seção de liquidação, reproduza a memória de cálculo de forma técnica e detalhada, justificando cada verba com base na jornada real descrita.

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
8. Tópicos jurídicos individualizados (com títulos em CAIXA ALTA e NEGRITO), incluindo:
   - HORAS EXTRAS
   - DESCARACTERIZAÇÃO DA JORNADA
   - INTERVALO INTRAJORNADA
   - MINUTOS RESIDUAIS
   - DSR
   - INTEGRAÇÃO DE VALORES EXTRAFOLHA
   - (outros pertinentes ao caso)
9. Fundamentação jurídica com legislação + jurisprudência
10. Seção completa de PEDIDOS: enumerados (a, b, c...), com valores estimados e reflexos discriminados
11. Requerimentos finais
12. Valor da causa
13. Fechamento formal

A redação deve ser contínua, sem simplificações, com alto nível técnico.

---

### CONDIÇÕES FINAIS

A resposta será considerada excelente se:
- Soar como escrita por um advogado humano experiente, NÃO por uma IA
- Não contiver frases clichês ou genéricas típicas de IA ("é importante ressaltar", "nesse diapasão", "outrossim", "mister se faz")
- Narrar os fatos do cliente de forma humanizada e cronológica
- Apresentar profundidade jurídica e estratégica real
- Contiver todos os pedidos cabíveis com valores discriminados
- Estar pronta para protocolo sem nenhuma edição
- Demonstrar coerência absoluta entre fatos, fundamentos e pedidos
- Maximizar o potencial de procedência da ação${templateContent}${documentContext}${precedentsContext}`;
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGeneratingStep("Carregando precedentes e modelos...");

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

    try {
      const fileUrls = form.document_urls.length > 0 ? form.document_urls : undefined;
      setGeneratingStep("Enviando dados para a IA (isso pode levar 2-4 minutos)...");

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

      setGeneratingStep("Salvando petição...");

      // Upload content as file to avoid field size limit
      const blob = new Blob([result], { type: "text/plain" });
      const file = new File([blob], "peticao.txt", { type: "text/plain" });
      const { file_url: contentUrl } = await base44.integrations.Core.UploadFile({ file });

      const petition = await base44.entities.Petition.create({
        ...form,
        salary: form.salary ? parseFloat(form.salary) : undefined,
        status: "concluida",
        generated_content: contentUrl,
      });

      try { localStorage.removeItem(FORM_STORAGE_KEY); } catch (e) {}
      toast.success("Petição gerada com sucesso!");
      navigate(`/peticoes/${petition.id}`);
    } catch (err) {
      toast.error("Erro ao gerar petição: " + (err.message || "Tente novamente"));
      console.error(err);
    } finally {
      setGenerating(false);
      setGeneratingStep("");
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

      <Card className="p-6 lg:p-8">
        {step === 0 && <StepParties form={form} updateForm={updateForm} />}
        {step === 1 && <StepDetails form={form} updateForm={updateForm} templates={templates} />}
        {step === 2 && <LaborCalculator form={form} updateForm={updateForm} />}
        {step === 3 && <DocumentUploader form={form} updateForm={updateForm} />}
        {step === 4 && <StepReview form={form} generating={generating} generatingStep={generatingStep} onGenerate={handleGenerate} />}
      </Card>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Anterior
        </Button>

        {!isLastStep ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()} className="gap-2">
            Próximo <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            onClick={handleGenerate}
            disabled={generating}
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
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold">Reclamado(s)</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Dados da(s) empresa(s) reclamada(s)</p>

        {/* Reclamado principal */}
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

        {/* Reclamados adicionais */}
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
          <Label>Modelo de Referência (opcional)</Label>
          <Select value={form.template_used} onValueChange={(v) => updateForm("template_used", v)}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione um modelo" /></SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function StepReview({ form, generating, generatingStep }) {
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
        <div className="text-center py-8 space-y-3">
          <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
          <p className="font-semibold text-foreground">Gerando sua petição com IA...</p>
          <p className="text-sm text-muted-foreground">{generatingStep}</p>
          <p className="text-xs text-muted-foreground">Modelo Claude Sonnet — alta qualidade, pode levar 2–4 minutos. Não feche esta aba.</p>
          <div className="flex justify-center gap-1 pt-2">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{animationDelay: `${i * 0.2}s`}} />
            ))}
          </div>
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