import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Shield, Sparkles, Loader2, Copy, Trash2, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

const AVISO_REVISAO = "Rascunho profissional — revisão final por advogado é obrigatória antes de protocolar.";

const INITIAL_FORM = {
  title: "",
  process_number: "",
  reclamante_name: "",
  reclamada_name: "",
  reclamada_cnpj: "",
  contract_start: "",
  contract_end: "",
  funcao: "",
  salario: "",
  inicial_texto: "",
};

export default function Defesa() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [generating, setGenerating] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [defesas, setDefesas] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(null);

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    loadDefesas();
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
      const configs = await base44.entities.DefesaConfig.filter({ ativo: true });
      const config = configs[0];

      const systemPrompt = config?.prompt_sistema || `Você é um advogado trabalhista sênior especializado em defesa de empregadores. Sua tarefa é elaborar uma Contestação Trabalhista tecnicamente precisa, objetiva e estratégica, com base nos dados do caso e no texto da reclamação inicial fornecida. A peça deve conter: qualificação das partes, preliminares cabíveis (ilegitimidade, inépcia, incompetência se houver), impugnação detalhada de cada pedido da inicial com fundamento legal e indicação de prova, análise de risco por pedido, requerimento de carta de preposição e pedido final de improcedência total. Ao final, indique explicitamente: lista de preliminares levantadas, tabela de pedidos impugnados (pedido | posição da defesa | fundamento | prova), tabela de análise de risco (pedido | probabilidade de procedência | estimativa de condenação), e lembrete sobre carta de preposição. Use linguagem técnica, direta, sem gerundismo, sem travessão no corpo do texto.`;

      const userPrompt = `CONTESTAÇÃO TRABALHISTA — DADOS DO CASO

Processo nº: ${form.process_number || "não informado"}
Reclamante: ${form.reclamante_name}
Reclamada: ${form.reclamada_name} — CNPJ: ${form.reclamada_cnpj || "não informado"}
Função: ${form.funcao || "não informada"}
Salário: R$ ${form.salario || "não informado"}
Admissão: ${form.contract_start || "não informada"}
Demissão: ${form.contract_end || "não informada"}

TEXTO DA RECLAMAÇÃO INICIAL (colar abaixo):
${form.inicial_texto}

---
Com base nos dados acima e no texto da inicial, elabore a contestação completa conforme as instruções do sistema. Ao final, apresente separadamente:
1. LISTA DE PRELIMINARES cabíveis
2. TABELA DE PEDIDOS IMPUGNADOS (Pedido | Posição da Defesa | Fundamento Legal | Prova a Produzir)
3. TABELA DE ANÁLISE DE RISCO (Pedido | Probabilidade de Procedência | Estimativa de Condenação)
4. LEMBRETE: Carta de preposição — providências necessárias`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: userPrompt,
        model: config?.modelo_ia || "claude_sonnet_4_6",
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

  const handleOpen = (d) => {
    setForm({
      title: d.title || "",
      process_number: d.process_number || "",
      reclamante_name: d.reclamante_name || "",
      reclamada_name: d.reclamada_name || "",
      reclamada_cnpj: d.reclamada_cnpj || "",
      contract_start: d.contract_start || "",
      contract_end: d.contract_end || "",
      funcao: d.funcao || "",
      salario: d.salario || "",
      inicial_texto: d.inicial_texto || "",
    });
    setSavedId(d.id);
    setResultado(d.generated_content || null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#0d1526] p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="pt-2">
        <p className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-1">Ferramenta Trabalhista</p>
        <h1 className="text-2xl lg:text-3xl font-playfair font-bold text-white flex items-center gap-3">
          <Shield className="w-7 h-7 text-amber-500" />
          Defesa — Contestação do Empregador
        </h1>
        <p className="text-slate-500 mt-1">Gere contestações trabalhistas com IA a partir da petição inicial recebida</p>
      </div>

      <Card className="p-6 lg:p-8 space-y-5 bg-white/[0.04] border-white/[0.07]">
        <h2 className="font-semibold text-base text-white">Dados do caso</h2>
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
            <Label>Reclamada *</Label>
            <Input className="mt-1.5" value={form.reclamada_name} onChange={e => upd("reclamada_name", e.target.value)} placeholder="Razão social" />
          </div>
          <div>
            <Label>CNPJ da reclamada</Label>
            <Input className="mt-1.5" value={form.reclamada_cnpj} onChange={e => upd("reclamada_cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
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
          <div className="md:col-span-2">
            <Label>Texto da reclamação inicial *</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">Cole aqui o texto completo da reclamação inicial recebida</p>
            <Textarea
              className="min-h-[220px] font-mono text-xs"
              value={form.inicial_texto}
              onChange={e => upd("inicial_texto", e.target.value)}
              placeholder="Cole aqui o texto integral da inicial..."
            />
          </div>
        </div>

        <Button
          onClick={handleGerar}
          disabled={generating}
          className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90 w-full sm:w-auto"
        >
          {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando contestação...</> : <><Sparkles className="w-4 h-4" /> Gerar Defesa com IA</>}
        </Button>
      </Card>

      {resultado && (
        <Card className="p-6 lg:p-8 space-y-4 bg-white/[0.04] border-white/[0.07]">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold text-base text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-400" /> Contestação gerada
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => { navigator.clipboard.writeText(resultado); toast.success("Copiado!"); }}>
                <Copy className="w-4 h-4" /> Copiar
              </Button>
              <Button size="sm" className="gap-2" onClick={handleSalvar} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? "Salvando..." : "Salvar defesa"}
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-xl border p-6 max-h-[600px] overflow-y-auto">
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{resultado}</pre>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
            <p>{AVISO_REVISAO}</p>
          </div>
        </Card>
      )}

      {/* Histórico */}
      <Card className="p-6 lg:p-8 bg-white/[0.04] border-white/[0.07]">
        <h2 className="font-semibold text-base mb-4 text-white">Defesas salvas</h2>
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