import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { TrendingUp, Save, Trash2, Info, AlertTriangle } from "lucide-react";

const AVISO_REVISAO = "Rascunho profissional — revisão final por advogado é obrigatória antes de protocolar.";

const ORIGENS = [
  { value: "trabalhista", label: "Trabalhista" },
  { value: "dano_material", label: "Dano material" },
  { value: "dano_moral", label: "Dano moral" },
  { value: "tributario", label: "Tributário" },
  { value: "alimentos", label: "Alimentos" },
  { value: "contratual", label: "Contratual" },
];

const INDICES = [
  { value: "selic", label: "SELIC" },
  { value: "ipca_e", label: "IPCA-E" },
  { value: "inpc", label: "INPC" },
  { value: "igpm", label: "IGP-M" },
  { value: "tr", label: "TR" },
];

const FUNDAMENTOS = {
  selic: "SELIC (EC 113/2021 para Fazenda Pública; Tema 962 STF para repetição de indébito tributário; art. 406 CC para relações privadas).",
  ipca_e: "IPCA-E (Tema 810 STF — correção de débitos trabalhistas, conforme decisão do STF que substituiu TR pelo IPCA-E até EC 113/2021).",
  inpc: "INPC (utilizado em condenações alimentares e contratos que prevejam este índice; verificar convenção coletiva).",
  igpm: "IGP-M (contratos de aluguel e acordos convencionais; verificar se o contrato prevê este índice).",
  tr: "TR (utilizado em contratos de mútuo e FGTS até decisão do STF; substituído pelo IPCA-E em débitos trabalhistas).",
};

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4 }) + "%";

function diffMeses(di, df) {
  const a = new Date(di);
  const b = new Date(df);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function calcularAtualizacao(f) {
  const vo = parseFloat(f.valor_original) || 0;
  const pctIdx = parseFloat(f.indice_acumulado) || 0;
  const pctJuros = parseFloat(f.juros_percent_mes) || 0;
  const pctHon = parseFloat(f.honorarios_percent) || 0;
  const meses = diffMeses(f.data_inicial, f.data_final);
  const selicEmbutida = f.selic_embutida;
  const multa = f.multa_10_percent;

  const valorCorrecao = vo * (pctIdx / 100);
  const valorJuros = selicEmbutida ? 0 : vo * (pctJuros / 100) * meses;
  const subtotal = vo + valorCorrecao + valorJuros;
  const valorMulta = multa ? subtotal * 0.10 : 0;
  const subtotal2 = subtotal + valorMulta;
  const valorHonorarios = pctHon > 0 ? subtotal2 * (pctHon / 100) : 0;
  const total = subtotal2 + valorHonorarios;

  const fundamento = FUNDAMENTOS[f.indice_correcao] || "";

  const memoria = [
    `MEMÓRIA DE CÁLCULO — ATUALIZAÇÃO MONETÁRIA`,
    ``,
    `Título: ${f.title}`,
    `Origem do débito: ${ORIGENS.find(o => o.value === f.origem_debito)?.label || f.origem_debito}`,
    `Período: ${f.data_inicial} a ${f.data_final} (${meses} meses)`,
    `Índice de correção: ${INDICES.find(i => i.value === f.indice_correcao)?.label || f.indice_correcao}`,
    ``,
    `PASSO 1 — VALOR ORIGINAL`,
    `  Valor original: ${fmt(vo)}`,
    ``,
    `PASSO 2 — CORREÇÃO MONETÁRIA`,
    `  Índice acumulado informado: ${fmtPct(pctIdx)}`,
    `  Valor correção: ${fmt(vo)} × ${pctIdx}% = ${fmt(valorCorrecao)}`,
    ``,
    selicEmbutida
      ? `PASSO 3 — JUROS\n  SELIC embutida: juros não calculados separadamente (Tema 99 STJ — Selic já engloba juros e correção).\n`
      : `PASSO 3 — JUROS\n  Taxa: ${pctJuros}% ao mês × ${meses} meses\n  Valor juros: ${fmt(vo)} × ${pctJuros}% × ${meses} = ${fmt(valorJuros)}\n`,
    `SUBTOTAL: ${fmt(vo)} + ${fmt(valorCorrecao)} + ${fmt(valorJuros)} = ${fmt(subtotal)}`,
    ``,
    multa ? `PASSO 4 — MULTA 10% (art. 523 CPC)\n  ${fmt(subtotal)} × 10% = ${fmt(valorMulta)}\n` : `PASSO 4 — MULTA: não aplicada\n`,
    pctHon > 0 ? `PASSO 5 — HONORÁRIOS ${pctHon}%\n  ${fmt(subtotal2)} × ${pctHon}% = ${fmt(valorHonorarios)}\n` : `PASSO 5 — HONORÁRIOS: não informados\n`,
    `TOTAL ATUALIZADO: ${fmt(total)}`,
    ``,
    `FUNDAMENTO DO ÍNDICE:`,
    fundamento,
    ``,
    `NOTAS DE TERMO INICIAL:`,
    `- Dano material: Súmula 43 STJ (dano desde o evento).`,
    `- Juros: Súmula 54 STJ (juros desde o evento para responsabilidade extracontratual).`,
    `- Dano moral: Súmula 362 STJ (correção do arbitramento) e Súmula 54 STJ (juros desde o evento).`,
    `- Repetição de indébito tributário: Tema 962 STF (SELIC).`,
    `- Fazenda Pública: EC 113/2021 (SELIC substituiu IPCA-E + juros).`,
    ``,
    `AVISO: O índice acumulado real deve ser consultado nas tabelas oficiais (BACEN, Receita Federal, tabelas dos tribunais) e informado pelo usuário. Este sistema não busca valores automaticamente.`,
  ].join("\n");

  return { valorCorrecao, valorJuros, valorMulta, valorHonorarios, total, memoria, fundamento, meses };
}

const INITIAL_FORM = {
  title: "",
  origem_debito: "trabalhista",
  valor_original: "",
  data_inicial: "",
  data_final: "",
  indice_correcao: "selic",
  indice_acumulado: "",
  juros_percent_mes: "1",
  selic_embutida: false,
  honorarios_percent: "",
  multa_10_percent: false,
};

export default function AtualizacaoCalculoPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [resultado, setResultado] = useState(null);
  const [calculos, setCalculos] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => { loadList(); }, []);

  const loadList = async () => {
    setLoadingList(true);
    try {
      const data = await base44.entities.AtualizacaoCalculo.list("-created_date", 20);
      setCalculos(data);
    } catch (e) { /* ignore */ } finally { setLoadingList(false); }
  };

  const handleCalcular = () => {
    if (!form.valor_original || !form.data_inicial || !form.data_final || !form.indice_acumulado) {
      toast.error("Preencha valor original, datas e índice acumulado.");
      return;
    }
    const r = calcularAtualizacao(form);
    setResultado(r);
  };

  const handleSalvar = async () => {
    if (!resultado) return;
    setSaving(true);
    try {
      await base44.entities.AtualizacaoCalculo.create({
        title: form.title || `Cálculo ${form.data_final}`,
        origem_debito: form.origem_debito,
        valor_original: parseFloat(form.valor_original) || 0,
        data_inicial: form.data_inicial,
        data_final: form.data_final,
        indice_correcao: form.indice_correcao,
        indice_acumulado: parseFloat(form.indice_acumulado) || 0,
        juros_percent_mes: parseFloat(form.juros_percent_mes) || 0,
        selic_embutida: form.selic_embutida,
        honorarios_percent: parseFloat(form.honorarios_percent) || 0,
        multa_10_percent: form.multa_10_percent,
        valor_correcao: resultado.valorCorrecao,
        valor_juros: resultado.valorJuros,
        valor_honorarios: resultado.valorHonorarios,
        valor_multa: resultado.valorMulta,
        valor_atualizado: resultado.total,
        memoria_calculo: resultado.memoria,
        fundamento_indice: resultado.fundamento,
      });
      toast.success("Cálculo salvo!");
      loadList();
    } catch (e) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este cálculo?")) return;
    try {
      await base44.entities.AtualizacaoCalculo.delete(id);
      setCalculos(c => c.filter(x => x.id !== id));
      toast.success("Excluído.");
    } catch (e) { toast.error("Erro: " + e.message); }
  };

  const handleOpen = (c) => {
    setForm({
      title: c.title || "",
      origem_debito: c.origem_debito || "trabalhista",
      valor_original: c.valor_original?.toString() || "",
      data_inicial: c.data_inicial || "",
      data_final: c.data_final || "",
      indice_correcao: c.indice_correcao || "selic",
      indice_acumulado: c.indice_acumulado?.toString() || "",
      juros_percent_mes: c.juros_percent_mes?.toString() || "1",
      selic_embutida: c.selic_embutida || false,
      honorarios_percent: c.honorarios_percent?.toString() || "",
      multa_10_percent: c.multa_10_percent || false,
    });
    if (c.memoria_calculo) {
      setResultado({ memoria: c.memoria_calculo, total: c.valor_atualizado, valorCorrecao: c.valor_correcao, valorJuros: c.valor_juros, valorMulta: c.valor_multa, valorHonorarios: c.valor_honorarios });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="pt-2">
        <p className="text-primary text-xs font-bold uppercase tracking-widest mb-1">Ferramenta Trabalhista</p>
        <h1 className="text-2xl lg:text-3xl font-playfair font-bold text-foreground flex items-center gap-3">
          <TrendingUp className="w-7 h-7 text-primary" />
          Atualização de Cálculo
        </h1>
        <p className="text-muted-foreground mt-1">Correção monetária e juros com fundamento legal automático</p>
      </div>

      {/* Aviso sobre índices */}
      <div className="flex items-start gap-2.5 p-4 rounded-xl border text-sm" style={{ background: "hsl(var(--primary) / 0.08)", borderColor: "hsl(var(--primary) / 0.25)", color: "hsl(var(--foreground))" }}>
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
        <div>
          <p className="font-medium mb-1">Atenção: informe o índice acumulado manualmente</p>
          <p>O percentual acumulado real (SELIC, IPCA-E, INPC, IGP-M, TR) deve ser consultado nas tabelas oficiais — BACEN (<span className="font-mono text-xs">bcb.gov.br</span>), Receita Federal, Portal CNJ ou tabelas do tribunal competente — e informado no campo abaixo. Este sistema não busca esses valores automaticamente.</p>
        </div>
      </div>

      <Card className="p-6 lg:p-8 space-y-5">
        <h2 className="font-semibold text-base text-foreground">Dados do cálculo</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Título</Label>
            <Input className="mt-1.5" value={form.title} onChange={e => upd("title", e.target.value)} placeholder="Ex: Atualização — Rescisória João 2024" />
          </div>
          <div>
            <Label>Origem do débito</Label>
            <Select value={form.origem_debito} onValueChange={v => upd("origem_debito", v)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>{ORIGENS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Valor original (R$) *</Label>
            <Input type="number" className="mt-1.5" value={form.valor_original} onChange={e => upd("valor_original", e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <Label>Data inicial *</Label>
            <Input type="date" className="mt-1.5" value={form.data_inicial} onChange={e => upd("data_inicial", e.target.value)} />
          </div>
          <div>
            <Label>Data final *</Label>
            <Input type="date" className="mt-1.5" value={form.data_final} onChange={e => upd("data_final", e.target.value)} />
          </div>
          <div>
            <Label>Índice de correção</Label>
            <Select value={form.indice_correcao} onValueChange={v => upd("indice_correcao", v)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>{INDICES.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Índice acumulado do período (%) *</Label>
            <Input type="number" className="mt-1.5" value={form.indice_acumulado} onChange={e => upd("indice_acumulado", e.target.value)} placeholder="Ex: 12.45" step="0.0001" />
          </div>

          {/* Selic embutida */}
          <div className="md:col-span-2">
            <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-muted/30 transition-colors">
              <input
                type="checkbox"
                checked={form.selic_embutida}
                onChange={e => upd("selic_embutida", e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
              <div>
                <p className="text-sm font-medium">SELIC já engloba juros (Tema 99 STJ)</p>
                <p className="text-xs text-muted-foreground">Marque quando a SELIC for o único índice (juros + correção). Não serão calculados juros separados.</p>
              </div>
            </label>
          </div>

          {!form.selic_embutida && (
            <div>
              <Label>Juros (% ao mês)</Label>
              <Input type="number" className="mt-1.5" value={form.juros_percent_mes} onChange={e => upd("juros_percent_mes", e.target.value)} placeholder="1" step="0.01" />
            </div>
          )}

          <div>
            <Label>Honorários advocatícios (%)</Label>
            <Input type="number" className="mt-1.5" value={form.honorarios_percent} onChange={e => upd("honorarios_percent", e.target.value)} placeholder="Deixe em branco se não aplicável" step="0.1" />
          </div>

          <div className="md:col-span-2">
            <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-muted/30 transition-colors">
              <input
                type="checkbox"
                checked={form.multa_10_percent}
                onChange={e => upd("multa_10_percent", e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
              <div>
                <p className="text-sm font-medium">Multa de 10% (art. 523 CPC — inadimplemento do devedor)</p>
                <p className="text-xs text-muted-foreground">Incide sobre o subtotal após correção e juros.</p>
              </div>
            </label>
          </div>
        </div>

        <Button onClick={handleCalcular} className="gap-2 w-full sm:w-auto">
          <TrendingUp className="w-4 h-4" /> Calcular atualização
        </Button>
      </Card>

      {resultado && (
        <Card className="p-6 lg:p-8 space-y-4">
          <h2 className="font-semibold text-base text-foreground flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" /> Resultado
          </h2>

          {/* Sumário */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Valor original", val: parseFloat(form.valor_original) || 0 },
              { label: "Correção monetária", val: resultado.valorCorrecao },
              { label: "Juros", val: resultado.valorJuros },
              { label: "TOTAL ATUALIZADO", val: resultado.total, highlight: true },
            ].map((item, i) => (
              <div key={i} className={`p-3 rounded-xl border text-center ${item.highlight ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30"}`}>
                <p className={`text-xs mb-1 ${item.highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{item.label}</p>
                <p className={`font-bold text-sm tabular-nums ${item.highlight ? "text-primary-foreground" : ""}`}>{fmt(item.val)}</p>
              </div>
            ))}
          </div>

          {(resultado.valorMulta > 0 || resultado.valorHonorarios > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {resultado.valorMulta > 0 && (
                <div className="p-3 rounded-xl border bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Multa 10%</p>
                  <p className="font-bold text-sm tabular-nums">{fmt(resultado.valorMulta)}</p>
                </div>
              )}
              {resultado.valorHonorarios > 0 && (
                <div className="p-3 rounded-xl border bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Honorários</p>
                  <p className="font-bold text-sm tabular-nums">{fmt(resultado.valorHonorarios)}</p>
                </div>
              )}
            </div>
          )}

          {/* Fundamento */}
          <div className="p-3 rounded-xl bg-muted/30 border text-sm">
            <p className="font-medium text-xs text-muted-foreground uppercase tracking-wider mb-1">Fundamento do índice</p>
            <p>{resultado.fundamento || FUNDAMENTOS[form.indice_correcao]}</p>
          </div>

          {/* Notas de termo inicial */}
          <div className="p-4 rounded-xl border text-xs space-y-1" style={{ background: "hsl(var(--primary) / 0.07)", borderColor: "hsl(var(--primary) / 0.2)", color: "hsl(var(--foreground))" }}>
            <p className="font-semibold text-sm mb-2 flex items-center gap-1.5 text-primary"><Info className="w-3.5 h-3.5" /> Notas sobre termo inicial</p>
            <p>• <strong>Dano material:</strong> Súmula 43 STJ — correção monetária desde o evento danoso.</p>
            <p>• <strong>Juros (extracontratual):</strong> Súmula 54 STJ — juros de mora desde o evento.</p>
            <p>• <strong>Dano moral:</strong> Súmula 362 STJ (correção do arbitramento) + Súmula 54 STJ (juros desde o evento).</p>
            <p>• <strong>Repetição de indébito tributário:</strong> Tema 962 STF — SELIC a partir do recolhimento indevido.</p>
            <p>• <strong>Fazenda Pública:</strong> EC 113/2021 — SELIC substitui IPCA-E + juros a partir de 30/11/2021.</p>
          </div>

          {/* Memória */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Memória de cálculo</h3>
            <pre className="text-xs font-mono bg-muted/40 rounded-xl p-4 whitespace-pre-wrap leading-relaxed border overflow-x-auto">{resultado.memoria}</pre>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSalvar} disabled={saving} variant="outline" className="gap-2">
              <Save className="w-4 h-4" />
              {saving ? "Salvando..." : "Salvar cálculo"}
            </Button>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl border text-sm" style={{ background: "hsl(var(--warning) / 0.1)", borderColor: "hsl(var(--warning) / 0.3)", color: "hsl(var(--foreground))" }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "hsl(var(--warning))" }} />
            <p>{AVISO_REVISAO}</p>
          </div>
        </Card>
      )}

      {/* Histórico */}
      <Card className="p-6 lg:p-8">
        <h2 className="font-semibold text-base mb-4 text-foreground">Cálculos salvos</h2>
        {loadingList ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : calculos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum cálculo salvo ainda.</p>
        ) : (
          <div className="space-y-2">
            {calculos.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {ORIGENS.find(o => o.value === c.origem_debito)?.label} · {fmt(c.valor_original)} → {fmt(c.valor_atualizado)} · {c.data_inicial} a {c.data_final}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <Button variant="ghost" size="sm" onClick={() => handleOpen(c)}>Abrir</Button>
                  <button onClick={() => handleDelete(c.id)} className="p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}