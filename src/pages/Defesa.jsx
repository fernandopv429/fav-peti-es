import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useEspecialista } from "@/hooks/useEspecialista";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Shield, Sparkles, Loader2, Copy, Trash2, ChevronDown, ChevronUp, AlertTriangle, Paperclip, FileDown, FileText } from "lucide-react";
import AnalisarDocumentosDefesa from "@/components/defesa/AnalisarDocumentosDefesa.jsx";
import DefesaCorrectionChat from "@/components/defesa/DefesaCorrectionChat.jsx";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { fetchDocxViaBackend } from "@/lib/fetchDocxViaBackend.js";

const AVISO_REVISAO = "Rascunho profissional — revisão final por advogado é obrigatória antes de protocolar.";

const INITIAL_FORM = {
  title: "",
  process_number: "",
  reclamante_name: "",
  reclamante_cpf: "",
  reclamada_name: "",
  reclamada_cnpj: "",
  reclamada_setor: "",
  posicao_processual: "",
  contract_start: "",
  contract_end: "",
  funcao: "",
  salario: "",
  jornada: "",
  valor_causa: "",
  inicial_texto: "",
  pedidos_identificados: [],
  analise_documentos: "",
  analise_status: "pendente",
  document_urls: [],
  document_names: [],
};

export default function Defesa() {
  const { especialista: esp32 } = useEspecialista("32");
  const [form, setForm] = useState(INITIAL_FORM);
  const [generating, setGenerating] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [defesas, setDefesas] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const [baixandoDocx, setBaixandoDocx] = useState(false);
  const [gerandoModelo, setGerandoModelo] = useState(false);
  const [defesaConfig, setDefesaConfig] = useState(null);

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    loadDefesas();
    base44.entities.DefesaConfig.filter({ ativo: true }).then(r => setDefesaConfig(r[0] || null)).catch(() => {});
  }, []);

  const loadDefesas = async () => {
    setLoadingList(true);
    try {
      const data = await base44.entities.Defesa.list("-created_date", 20);
      setDefesas(data);
    } catch (e) {
      /* ignore */
    } finally {
      setLoadingList(false);
    }
  };

  const handleGerar = async () => {
    if (!form.reclamante_name || !form.reclamada_name || !form.inicial_texto) {
      toast.error("Preencha reclamante, reclamada e o texto da inicial.");
      return;
    }
    setGenerating(true);
    setResultado(null);
    setSavedId(null);

    try {
      // Instrução vem do Especialista #32 — fonte única de verdade
      const systemPrompt = esp32?.prompt_sistema || "Você é um advogado trabalhista sênior especializado em defesa de empregadores. Elabore a contestação trabalhista completa com base nos dados fornecidos.";
      const modelo = esp32?.modelo_ia === "sonnet" ? "claude_sonnet_4_6" : (esp32?.modelo_ia || "claude_sonnet_4_6");

      const userPrompt = `${systemPrompt}

---

CONTESTAÇÃO TRABALHISTA — DADOS DO CASO

Processo nº: ${form.process_number || "não informado"}
Reclamante: ${form.reclamante_name}
Reclamada: ${form.reclamada_name} — CNPJ: ${form.reclamada_cnpj || "não informado"}
Função: ${form.funcao || "não informada"}
Salário: R$ ${form.salario || "não informado"}
Admissão: ${form.contract_start || "não informada"}
Demissão: ${form.contract_end || "não informada"}

TEXTO DA RECLAMAÇÃO INICIAL:
${form.inicial_texto}

---
Elabore a contestação completa. Ao final, apresente separadamente:
1. LISTA DE PRELIMINARES cabíveis
2. TABELA DE PEDIDOS IMPUGNADOS (Pedido | Posição da Defesa | Fundamento Legal | Prova a Produzir)
3. TABELA DE ANÁLISE DE RISCO (Pedido | Probabilidade de Procedência | Estimativa de Condenação)
4. LEMBRETE: Carta de preposição — providências necessárias`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: userPrompt,
        model: modelo,
      });

      setResultado(result);
    } catch (e) {
      toast.error("Erro ao gerar defesa: " + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSalvar = async () => {
    if (!resultado) return;
    setSaving(true);
    try {
      const data = {
        ...form,
        salario: form.salario ? parseFloat(form.salario) : undefined,
        valor_causa: form.valor_causa ? parseFloat(form.valor_causa) : undefined,
        generated_content: resultado,
        status: "concluida",
      };
      let d;
      if (savedId) {
        d = await base44.entities.Defesa.update(savedId, data);
      } else {
        d = await base44.entities.Defesa.create(data);
        setSavedId(d.id);
      }
      toast.success("Defesa salva!");
      loadDefesas();
    } catch (e) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir esta defesa?")) return;
    try {
      await base44.entities.Defesa.delete(id);
      toast.success("Excluída.");
      setDefesas(d => d.filter(x => x.id !== id));
    } catch (e) {
      toast.error("Erro: " + e.message);
    }
  };

  const handleExtracted = (dados) => {
    // Muda analise_status para "em_analise" enquanto processa, depois "concluida" ao confirmar
    setForm(prev => ({
      ...prev,
      ...dados,
      // salário e valor_causa chegam como number; mantém string no form para inputs
      salario: dados.salario != null ? String(dados.salario) : prev.salario,
      valor_causa: dados.valor_causa != null ? String(dados.valor_causa) : prev.valor_causa,
      analise_status: "concluida",
    }));
  };

  const handleDocsChange = (urls, names) => {
    setForm(prev => ({ ...prev, document_urls: urls, document_names: names }));
  };

  const handleBaixarDocx = async (conteudo, reclamante, reclamada) => {
    setBaixandoDocx(true);
    try {
      // 1. Busca template pelo ID fixo
      const lista = await base44.entities.PetitionTemplate.list();
      const tmpl = lista.find(t => t.id === "6a346bc910fba561105aca82");
      if (!tmpl?.modelo_docx_url) {
        throw new Error("Modelo CONTESTACAO_TIMBRADO.docx não encontrado. Verifique se está cadastrado em Modelos.");
      }

      // 2. Baixa o .docx via backend (evita CORS)
      const arrayBuffer = await fetchDocxViaBackend(tmpl.modelo_docx_url);
      const zip = new PizZip(arrayBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => "",
        delimiters: { start: "{{", end: "}}" },
      });

      // 3. Converte Markdown → array de blocos { t, h } para o loop {{#blocos}} do modelo
      const SEP_ONLY = /^[-–—*_=#]{2,}$/;
      const TITULO_ROMANO  = /^[IVXLCDM]+\s*[–-]\s/i;
      const TITULO_NUMERAL = /^\d+(\.\d+)*\s*[–-]\s/;
      const NAO_TITULO     = /^[-•*]|^\w\)|^\d+\)|.*:.+/;

      const blocos = conteudo
        .split("\n")
        .map(l => {
          // Limpa Markdown
          let t = l
            .replace(/^#{1,6}\s*/, "")
            .replace(/^>\s*/, "")
            .replace(/[*_`]/g, "")
            .trim();
          return t;
        })
        .filter(t => t.length > 0 && !SEP_ONLY.test(t))
        .map(t => {
          const letras = t.replace(/[^a-zA-ZÀ-ú]/g, "");
          const isCaixaAlta = letras.length > 0 && letras === letras.toUpperCase() && t.length <= 70;
          const isRomano  = TITULO_ROMANO.test(t);
          const isNumeral = TITULO_NUMERAL.test(t);
          const naoTitulo = NAO_TITULO.test(t);
          const h = !naoTitulo && (isCaixaAlta || isRomano || isNumeral);
          return { t, h };
        });

      doc.render({ blocos });

      // 4. Gera o blob e faz download
      const blob = doc.getZip().generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const nomeArquivo = `${reclamante || "Reclamante"} x ${reclamada || "Reclamada"}.docx`
        .replace(/[/\\:*?"<>|]/g, " ").replace(/\s{2,}/g, " ").trim();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomeArquivo; a.click();
      URL.revokeObjectURL(url);
      toast.success("DOCX baixado!");
      // Limpa estado de trabalho para o próximo caso
      setForm(INITIAL_FORM);
      setSavedId(null);
      setResultado(null);
    } catch (e) {
      const msg = e?.properties?.errors?.map(er => er.message).join("; ") || e.message || String(e);
      toast.error("Erro ao gerar timbrado: " + msg, { duration: 10000 });
      base44.entities.ErrorLog.create({
        context: "gerar_timbrado_defesa",
        error_type: "geracao",
        message: msg,
        occurred_at: new Date().toISOString(),
      }).catch(() => {});
    } finally {
      setBaixandoDocx(false);
    }
  };

  const handleGerarModelo = async () => {
    setGerandoModelo(true);
    try {
      // 1. Busca o template CONTESTACAO_MODELO.docx
      const lista = await base44.entities.PetitionTemplate.list();
      const tmpl = lista.find(t => t.modelo_docx_name === "CONTESTACAO_MODELO.docx");
      if (!tmpl?.modelo_docx_url) {
        throw new Error("Modelo CONTESTACAO_MODELO.docx não encontrado. Cadastre-o em Modelos com o nome exato.");
      }

      // 2. Busca PetitionConfig para advogado/OAB
      const configs = await base44.entities.PetitionConfig.filter({ ativo: true });
      const cfg = configs[0] || {};

      // 3. LOCAL_DATA em PT-BR (America/Sao_Paulo)
      const agora = new Date();
      const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
      const partes = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "numeric", month: "numeric", year: "numeric",
      }).formatToParts(agora);
      const dia  = partes.find(p => p.type === "day").value;
      const mes  = partes.find(p => p.type === "month").value;
      const ano  = partes.find(p => p.type === "year").value;
      const LOCAL_DATA = `São Paulo, ${dia} de ${MESES[parseInt(mes, 10) - 1]} de ${ano}`;

      // 4. Prescrição: contrato > 5 anos antes de hoje
      const prescricao = form.contract_start
        ? (agora - new Date(form.contract_start)) / (1000 * 60 * 60 * 24 * 365) > 5
        : false;

      // 5. Flags a partir de pedidos_identificados
      const pedidos = (Array.isArray(form.pedidos_identificados) ? form.pedidos_identificados : [])
        .join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const flag = (r) => r.test(pedidos);
      const tem_he             = flag(/hora extra/);
      const tem_intervalo      = flag(/intervalo/);
      const tem_adic_noturno   = flag(/noturno/);
      const tem_insalubridade  = flag(/insalub/);
      const tem_periculosidade = flag(/periculos/);
      const tem_acumulo        = flag(/acumulo|desvio de func/);
      const tem_equiparacao    = flag(/equiparac/);
      const tem_doenca_ocup    = flag(/doenca|ocupacional|acidente|ler|dort/);
      const tem_dano_moral     = flag(/dano moral|assedio/);
      const tem_rescisao_indireta = flag(/rescisao indireta/);
      const tem_reversao_jc    = flag(/reversao|justa causa/);
      const tem_multas         = flag(/477|467|multa/);
      const tem_verbas         = flag(/verbas rescis|saldo de salario|aviso previo|ferias|13/);
      const tem_subsidiaria    = flag(/subsidiar|tomadora/);
      const tem_solidaria      = flag(/solidar|grupo economico/);
      const tem_vinculo        = flag(/vinculo|pejotiz/);

      // 6. Camada 3 — tese setorial
      const setor = (form.reclamada_setor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const CAMADAS = [
        { re: /refeic|aliment/, tese: "Tratando-se de contrato de fornecimento de refeições, a relação é de consumo, o que afasta a Súmula 331 do C. TST (Tema 725 do STF)." },
        { re: /limpeza|facilities|conservac/, tese: "Cuidando-se de terceirização de serviços de limpeza em atividade-meio, a contratação é de natureza civil, sem pessoalidade ou subordinação perante a tomadora, e a insalubridade de banheiros não se equipara a lixo urbano (Súmula 448, II, e Anexo 14 da NR-15)." },
        { re: /telecom|fibra|internet/, tese: "O técnico instalador atua em linhas aéreas de telecomunicações, que não constituem Sistema Elétrico de Potência, sendo indevido o adicional de periculosidade (Decreto 93.412/86; Súmula 364 do C. TST); a verba de veículo tem natureza indenizatória (Súmula 367, I, do C. TST)." },
        { re: /transporte|motorista|logistic/, tese: "O motorista profissional submete-se à Lei nº 13.103/2015, em que o tempo de espera não se confunde com tempo à disposição (art. 235-C, § 1º, da CLT), sendo válidos os controles e a compensação (Tema 1.046 do STF)." },
        { re: /comercio|loja|varejo/, tese: "Tratando-se de estabelecimento com menos de vinte empregados, é dispensado o controle de jornada (art. 74, § 2º, da CLT)." },
        { re: /academia/, tese: "A academia não constitui local de grande circulação para fins de insalubridade (afastamento da Súmula 448, II), e os produtos de limpeza são de uso diluído (Anexo 13 da NR-15; OJ 4 da SDI-1)." },
        { re: /call center|teleatend|telemarketing/, tese: "Eventual doença psíquica exige nexo e responsabilidade subjetiva; o autor nunca foi afastado pelo INSS, e patologias dessa natureza são frequentemente degenerativas (art. 20, § 1º, da Lei 8.213/91)." },
      ];
      const camadaMatch = CAMADAS.find(c => c.re.test(setor));
      const tem_camada3  = !!camadaMatch;
      const TESE_EMPRESA = camadaMatch?.tese || "";

      // 7. Monta objeto de dados
      const dados = {
        RECLAMANTE: form.reclamante_name || "[VERIFICAR]",
        RECLAMADA:  form.reclamada_name  || "[VERIFICAR]",
        RECLAMADA_CNPJ:     form.reclamada_cnpj || "[VERIFICAR]",
        RECLAMADA_ENDERECO: form.reclamada_endereco || "[VERIFICAR]",
        PROCESSO: form.process_number || "[VERIFICAR]",
        VARA:     form.vara     || "[VERIFICAR]",
        COMARCA:  form.comarca  || "[VERIFICAR]",
        ADVOGADO: cfg.advogado_principal || "[VERIFICAR]",
        OAB:      cfg.oab && cfg.uf_oab ? `${cfg.oab}/${cfg.uf_oab}` : (cfg.oab || "[VERIFICAR]"),
        LOCAL_DATA,
        TESE_EMPRESA,
        // flags booleanas
        tem_he, tem_intervalo, tem_adic_noturno, tem_insalubridade, tem_periculosidade,
        tem_acumulo, tem_equiparacao, tem_doenca_ocup, tem_dano_moral,
        tem_rescisao_indireta, tem_reversao_jc, tem_multas, tem_verbas,
        tem_subsidiaria, tem_solidaria, tem_vinculo, tem_camada3, prescricao,
      };

      // 8. Processa o template
      const arrayBuffer = await fetchDocxViaBackend(tmpl.modelo_docx_url);
      const zip = new PizZip(arrayBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => "",
        delimiters: { start: "{{", end: "}}" },
      });
      doc.render(dados);

      const blob = doc.getZip().generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const nomeArquivo = `${form.reclamante_name || "Reclamante"} x ${form.reclamada_name || "Reclamada"}.docx`
        .replace(/[/\\:*?"<>|]/g, " ").replace(/\s{2,}/g, " ").trim();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomeArquivo; a.click();
      URL.revokeObjectURL(url);
      toast.success("Modelo gerado e baixado!");
      // Limpa estado de trabalho para o próximo caso
      setForm(INITIAL_FORM);
      setSavedId(null);
      setResultado(null);
    } catch (e) {
      const msg = e?.properties?.errors?.map(er => er.message).join("; ") || e.message || String(e);
      toast.error("Erro ao gerar modelo: " + msg, { duration: 10000 });
      base44.entities.ErrorLog.create({
        context: "gerar_modelo_defesa",
        error_type: "geracao",
        message: msg,
        occurred_at: new Date().toISOString(),
      }).catch(() => {});
    } finally {
      setGerandoModelo(false);
    }
  };

  const handleOpen = (d) => {
    setForm({
      title: d.title || "",
      process_number: d.process_number || "",
      reclamante_name: d.reclamante_name || "",
      reclamante_cpf: d.reclamante_cpf || "",
      reclamada_name: d.reclamada_name || "",
      reclamada_cnpj: d.reclamada_cnpj || "",
      reclamada_setor: d.reclamada_setor || "",
      posicao_processual: d.posicao_processual || "",
      contract_start: d.contract_start || "",
      contract_end: d.contract_end || "",
      funcao: d.funcao || "",
      salario: d.salario || "",
      jornada: d.jornada || "",
      valor_causa: d.valor_causa || "",
      inicial_texto: d.inicial_texto || "",
      pedidos_identificados: d.pedidos_identificados || [],
      analise_documentos: d.analise_documentos || "",
      analise_status: d.analise_status || "pendente",
      document_urls: d.document_urls || [],
      document_names: d.document_names || [],
    });
    setSavedId(d.id);
    setResultado(d.generated_content || null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="pt-2">
        <p className="text-primary text-xs font-bold uppercase tracking-widest mb-1">Ferramenta Trabalhista</p>
        <h1 className="text-2xl lg:text-3xl font-playfair font-bold text-foreground flex items-center gap-3">
          <Shield className="w-7 h-7 text-primary" />
          Defesa — Contestação do Empregador
        </h1>
        <p className="text-muted-foreground mt-1">Gere contestações trabalhistas com IA a partir da petição inicial recebida</p>
      </div>

      <Card className="p-6 lg:p-8 space-y-5">
        <h2 className="font-semibold text-base text-foreground">Dados do caso</h2>

        {/* Upload e análise de documentos */}
        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-primary" />
            Documentos (petição inicial / pasta funcional)
          </p>
          <p className="text-xs text-muted-foreground">Anexe os documentos para que a IA preencha os campos automaticamente.</p>
          <AnalisarDocumentosDefesa
            existingUrls={form.document_urls}
            existingNames={form.document_names}
            onExtracted={handleExtracted}
            onDocsChange={handleDocsChange}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Título *</Label>
            <Input className="mt-1.5" value={form.title} onChange={e => upd("title", e.target.value)} placeholder="Ex: Contestação — João vs Empresa X" />
          </div>
          <div>
            <Label>Número do processo</Label>
            <Input className="mt-1.5" value={form.process_number} onChange={e => upd("process_number", e.target.value)} placeholder="0000000-00.0000.5.00.0000" />
          </div>
          <div>
            <Label>Reclamante *</Label>
            <Input className="mt-1.5" value={form.reclamante_name} onChange={e => upd("reclamante_name", e.target.value)} placeholder="Nome do reclamante" />
          </div>
          <div>
            <Label>CPF do reclamante</Label>
            <Input className="mt-1.5" value={form.reclamante_cpf} onChange={e => upd("reclamante_cpf", e.target.value)} placeholder="000.000.000-00" />
          </div>
          <div>
            <Label>Reclamada *</Label>
            <Input className="mt-1.5" value={form.reclamada_name} onChange={e => upd("reclamada_name", e.target.value)} placeholder="Razão social" />
          </div>
          <div>
            <Label>CNPJ da reclamada</Label>
            <Input className="mt-1.5" value={form.reclamada_cnpj} onChange={e => upd("reclamada_cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <Label>Setor/ramo da reclamada</Label>
            <Input className="mt-1.5" value={form.reclamada_setor} onChange={e => upd("reclamada_setor", e.target.value)} placeholder="Ex: vigilância, limpeza, telecomunicações" />
          </div>
          <div>
            <Label>Posição processual</Label>
            <select
              className="mt-1.5 w-full bg-input border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={form.posicao_processual}
              onChange={e => upd("posicao_processual", e.target.value)}
            >
              <option value="">Não informado</option>
              <option value="empregadora">Empregadora direta</option>
              <option value="tomadora">Tomadora de serviços</option>
            </select>
          </div>
          <div>
            <Label>Data de admissão</Label>
            <Input type="date" className="mt-1.5" value={form.contract_start} onChange={e => upd("contract_start", e.target.value)} />
          </div>
          <div>
            <Label>Data de demissão</Label>
            <Input type="date" className="mt-1.5" value={form.contract_end} onChange={e => upd("contract_end", e.target.value)} />
          </div>
          <div>
            <Label>Função</Label>
            <Input className="mt-1.5" value={form.funcao} onChange={e => upd("funcao", e.target.value)} placeholder="Ex: Auxiliar de produção" />
          </div>
          <div>
            <Label>Salário (R$)</Label>
            <Input type="number" className="mt-1.5" value={form.salario} onChange={e => upd("salario", e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <Label>Jornada alegada</Label>
            <Input className="mt-1.5" value={form.jornada} onChange={e => upd("jornada", e.target.value)} placeholder="Ex: 08:00 às 18:00, de segunda a sábado" />
          </div>
          <div>
            <Label>Valor da causa (R$)</Label>
            <Input type="number" className="mt-1.5" value={form.valor_causa} onChange={e => upd("valor_causa", e.target.value)} placeholder="0,00" />
          </div>
          <div className="md:col-span-2">
            <Label>Pedidos identificados na inicial</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">Um por linha — preenchido automaticamente pela IA ou manualmente</p>
            <Textarea
              className="min-h-[80px] text-sm"
              value={Array.isArray(form.pedidos_identificados) ? form.pedidos_identificados.join("\n") : form.pedidos_identificados}
              onChange={e => upd("pedidos_identificados", e.target.value.split("\n").filter(Boolean))}
              placeholder="Horas extras&#10;FGTS + 40%&#10;Aviso prévio indenizado"
            />
          </div>
          {form.analise_documentos && (
            <div className="md:col-span-2">
              <Label>Laudo da análise IA</Label>
              <Textarea
                className="min-h-[120px] text-xs mt-1.5"
                value={form.analise_documentos}
                onChange={e => upd("analise_documentos", e.target.value)}
              />
            </div>
          )}
          <div className="md:col-span-2">
            <Label>Texto da reclamação inicial *</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">Cole aqui o texto completo ou edite o que foi extraído automaticamente</p>
            <Textarea
              className="min-h-[220px] font-mono text-xs"
              value={form.inicial_texto}
              onChange={e => upd("inicial_texto", e.target.value)}
              placeholder="Cole aqui o texto integral da inicial..."
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleGerar}
            disabled={generating}
            className="gap-2"
          >
            {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando contestação...</> : <><Sparkles className="w-4 h-4" /> Gerar Defesa com IA</>}
          </Button>
          <Button
            variant="outline"
            onClick={handleGerarModelo}
            disabled={gerandoModelo || !form.reclamante_name || !form.reclamada_name}
            className="gap-2"
          >
            {gerandoModelo ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando modelo...</> : <><FileText className="w-4 h-4" /> Gerar conforme o modelo (timbrado)</>}
          </Button>
        </div>
      </Card>

      {resultado && (
        <Card className="p-6 lg:p-8 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" /> Contestação gerada
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => { navigator.clipboard.writeText(resultado); toast.success("Copiado!"); }}>
                <Copy className="w-4 h-4" /> Copiar
              </Button>
              <Button
                variant="outline" size="sm" className="gap-2"
                disabled={baixandoDocx || !resultado}
                onClick={() => handleBaixarDocx(resultado, form.reclamante_name, form.reclamada_name)}
              >
                {baixandoDocx ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                {baixandoDocx ? "Gerando..." : "Timbrado (.docx)"}
              </Button>
              <Button size="sm" className="gap-2" onClick={handleSalvar} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? "Salvando..." : "Salvar defesa"}
              </Button>
            </div>
          </div>

          <div className="bg-muted/30 rounded-xl border p-6 max-h-[600px] overflow-y-auto">
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-foreground">{resultado}</pre>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl border text-sm" style={{ background: "hsl(var(--warning) / 0.1)", borderColor: "hsl(var(--warning) / 0.3)", color: "hsl(var(--foreground))" }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "hsl(var(--warning))" }} />
            <p>{AVISO_REVISAO}</p>
          </div>
        </Card>
      )}

      {resultado && savedId && esp32 && (
        <DefesaCorrectionChat
          defesa={{ ...form, id: savedId, generated_content: resultado }}
          defesaConfig={defesaConfig}
          learningTarget={{
            entityName: "Especialista",
            id: esp32.id,
            prompt: esp32.prompt_sistema,
          }}
          onFieldsUpdated={(correctedFields) => {
            setForm(prev => ({ ...prev, ...correctedFields }));
            if (correctedFields.generated_content) setResultado(correctedFields.generated_content);
          }}
        />
      )}

      {/* Histórico */}
      <Card className="p-6 lg:p-8">
        <h2 className="font-semibold text-base mb-4 text-foreground">Defesas salvas</h2>
        {loadingList ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : defesas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma defesa salva ainda.</p>
        ) : (
          <div className="space-y-2">
            {defesas.map(d => (
              <div key={d.id} className="rounded-xl border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{d.title || "Sem título"}</p>
                    <p className="text-xs text-muted-foreground">{d.reclamante_name} × {d.reclamada_name} {d.process_number ? `· Proc. ${d.process_number}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <Button variant="ghost" size="sm" onClick={() => handleOpen(d)}>Abrir</Button>
                    <button
                      onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
                      className="p-1 hover:bg-muted rounded"
                    >
                      {expandedId === d.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleDelete(d.id)} className="p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {expandedId === d.id && d.generated_content && (
                  <div className="px-4 pb-4 border-t bg-muted/10">
                    <pre className="text-xs whitespace-pre-wrap font-sans mt-3 max-h-[300px] overflow-y-auto leading-relaxed">{d.generated_content}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}