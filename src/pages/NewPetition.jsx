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

  const updateForm = (field, value) => setForm((prev) => {
    const next = { ...prev, [field]: value };
    try { localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  });

  const buildPrompt = (form, templates, precedentsContext, calculationsContext, documentContext) => {
    let templateStyleInstruction = "";

    if (form.template_used) {
      const tmpl = templates.find((t) => t.id === form.template_used);
      if (tmpl?.content) {
        templateStyleInstruction = `

INSTRUÇÃO MÁXIMA — MODELO DE REFERÊNCIA OBRIGATÓRIO

Você recebeu abaixo um MODELO PADRÃO escrito pelo advogado deste escritório.
Este modelo é a sua voz. Você É o advogado que escreveu este modelo.

O que você DEVE fazer:
- Absorver e replicar cada traço do estilo de escrita
- Usar exatamente o mesmo vocabulário jurídico e as mesmas expressões
- Replicar a estrutura interna dos parágrafos
- Copiar a forma de narrar os fatos — o ritmo, o tom, a emoção
- Reproduzir como os pedidos são formulados e numerados
- Adaptar APENAS os fatos, as partes, as datas e os valores ao novo caso

O que você NÃO DEVE fazer:
- Criar um estilo diferente do modelo
- Simplificar o que o modelo detalha
- Alterar a estrutura argumentativa do modelo

MODELO PADRÃO — REFERÊNCIA ABSOLUTA DE LINGUAGEM E ESTILO:

${tmpl.content}

FIM DO MODELO — AGORA ESCREVA O CASO ATUAL COM ESTA MESMA LINGUAGEM`;
      }
    }

    return `INSTRUÇÕES FUNDAMENTAIS — LEIA ANTES DE ESCREVER QUALQUER PALAVRA

Você não é uma IA gerando um documento. Você é um advogado trabalhista com mais de 20 anos de experiência. Você conhece pessoalmente este cliente. Você já venceu dezenas de casos idênticos. Você sabe exatamente o que o juiz precisa ler para deferir os pedidos.

Sua escrita tem peso. Tem história. Tem humanidade.

REGRAS ABSOLUTAS DE LINGUAGEM — QUALQUER VIOLAÇÃO INVALIDA O TRABALHO

REGRA 1 — HUMANIDADE TOTAL
Cada parágrafo deve soar como escrito por um ser humano que se importa com o caso. Se uma frase parecer gerada por computador, delete e reescreva.

REGRA 2 — ZERO CLICHÊS JURÍDICOS
As seguintes expressões são ABSOLUTAMENTE PROIBIDAS:
"é importante destacar" | "cabe ressaltar" | "outrossim" | "nesse diapasão" | "mister se faz" | "ad argumentandum" | "consoante" | "depreende-se" | "insta salientar" | "imperioso reconhecer" | "há que se pontuar" | "resta evidente" | "conforme se depreende" | "revela-se patente"

REGRA 3 — AFIRMAÇÕES DIRETAS E FIRMES
Nunca escreva "pode-se verificar que", "é possível perceber". Afirme com convicção: "O reclamante trabalhou", "A empresa não pagou", "Os cartões de ponto foram fraudados".

REGRA 4 — NARRATIVA CRONOLÓGICA E HUMANIZADA
Conte a história do trabalhador como se você o conhecesse há anos. Dê concretude aos fatos. Mencione os dias, os horários, as condições reais de trabalho. Faça o juiz visualizar a situação.

REGRA 5 — VARIAÇÃO SINTÁTICA
Alterne entre períodos curtos e longos. Nunca inicie dois parágrafos consecutivos com a mesma palavra.

REGRA 6 — TEXTO CORRIDO
Nenhuma lista com bullets. Argumentos em parágrafos numerados, densos e fluidos.

REGRA 7 — TOM COMBATIVO E TÉCNICO
Você acredita genuinamente nesta causa. Isso deve aparecer em cada linha — sem arrogância, mas com convicção absoluta.

---

TAREFA

Elaborar PETIÇÃO INICIAL TRABALHISTA COMPLETA, rito ${form.rite}, com máximo detalhamento fático e jurídico, todos os pedidos cabíveis, fundamentação legal robusta, jurisprudência pertinente e liquidação estimada com reflexos discriminados.

Formatação: Arial 12, espaçamento 1,5, recuo de 3cm nos parágrafos, tópicos em CAIXA ALTA E NEGRITO, parágrafos numerados.

---

DADOS DO CASO

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

ESTRATÉGIA JURÍDICA OBRIGATÓRIA

A petição deve necessariamente:
1. Narrar a jornada real de forma rica, estratégica e detalhada
2. Demonstrar fraude sistemática na jornada: extrapolação habitual, trabalho em folgas, supressão de intervalo
3. Desenvolver as teses: descaracterização da escala, horas extras (8ª diária/44ª semanal), minutos residuais (art. 58 §1º), intervalo intrajornada (art. 71 CLT), reflexos em DSR/férias+1/3/13º/FGTS+40%, integração de valores extrafolha, CCT quando pertinente
4. Fundar em: CLT arts. 58, 59, 71, 818; Súmulas TST 85, 338, 444 e OJs pertinentes
5. Incluir estratégias processuais: impugnar cartões de ponto, requerer exibição de documentos, prova testemunhal
6. Garantir coerência absoluta entre fatos, fundamentos e pedidos

UTILIZE OBRIGATORIAMENTE os valores da memória de cálculo nos PEDIDOS, com cada verba discriminada e seu valor estimado.

---

ESTRUTURA OBRIGATÓRIA DA PETIÇÃO

1. Endereçamento formal
2. Qualificação completa das partes
3. Competência
4. Justiça gratuita
5. Juízo 100% digital
6. DOS FATOS — narrativa detalhada, cronológica e humanizada
7. Tópicos jurídicos (CAIXA ALTA + NEGRITO): DAS HORAS EXTRAS, DA DESCARACTERIZAÇÃO DA JORNADA, DO INTERVALO INTRAJORNADA, DOS MINUTOS RESIDUAIS, DO DSR, DA INTEGRAÇÃO DE VALORES EXTRAFOLHA, e outros pertinentes
8. DO DIREITO — fundamentação com legislação e jurisprudência
9. DOS PEDIDOS — enumerados (a, b, c...) com valores estimados e reflexos
10. DOS REQUERIMENTOS
11. DO VALOR DA CAUSA
12. Fechamento formal

---

CRITÉRIOS DE QUALIDADE:
- Soar como escrita por um advogado humano experiente, jamais por uma IA
- Não conter nenhuma das frases proibidas
- Narrar os fatos com profundidade humana e cronologia clara
- Conter todos os pedidos com valores discriminados
- Estar pronta para protocolo sem qualquer edição
- Ser indistinguível de uma petição escrita pelo mesmo advogado do modelo${templateStyleInstruction}${documentContext}${precedentsContext}`;
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

    // 1. Salvar rascunho no banco ANTES de chamar a API
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

    setGeneratingStep("Carregando precedentes e modelos...");
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

      // Simular progresso enquanto aguarda
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

      // Upload conteúdo como arquivo
      const blob = new Blob([result], { type: "text/plain" });
      const file = new File([blob], "peticao.txt", { type: "text/plain" });
      const { file_url: contentUrl } = await base44.integrations.Core.UploadFile({ file });

      // Atualizar petição no banco
      await base44.entities.Petition.update(petitionId, {
        generated_content: contentUrl,
        status: "concluida",
      });

      // Registrar no GenerationLog
      try {
        await base44.entities.GenerationLog.create({
          petition_id: petitionId,
          petition_title: form.title,
          status: "concluido",
          model_used: "claude_sonnet_4_6",
          duration_seconds: Math.round((Date.now() - startTime) / 1000),
          generated_at: new Date().toISOString(),
        });
      } catch (e) { /* ignore log errors */ }

      try { localStorage.removeItem(FORM_STORAGE_KEY); } catch (e) {}
      setGeneratingProgress(100);
      setGeneratedContent(result);
      setGeneratingStep("concluido");
      toast.success("Petição gerada com sucesso!");
    } catch (err) {
      // Marcar petição como rascunho novamente em caso de erro
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

      {/* Resultado gerado inline */}
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

      {/* Erro de geração */}
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
          <Button
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0 || generating}
            className="gap-2"
          >
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
                <div
                  className="bg-accent h-2 rounded-full transition-all duration-500"
                  style={{ width: `${generatingProgress}%` }}
                />
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