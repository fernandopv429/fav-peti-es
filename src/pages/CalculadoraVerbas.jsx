import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useEspecialista } from "@/hooks/useEspecialista";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Calculator, Save, FileText, AlertTriangle, Info, Sparkles, Loader2 } from "lucide-react";

const MOTIVOS = [
  { value: "sem_justa_causa", label: "Sem justa causa" },
  { value: "justa_causa", label: "Justa causa" },
  { value: "pedido_demissao", label: "Pedido de demissão" },
  { value: "acordo_484a", label: "Acordo (art. 484-A)" },
  { value: "prazo_determinado", label: "Término de contrato a prazo determinado" },
  { value: "aposentadoria", label: "Aposentadoria" },
  { value: "falecimento", label: "Falecimento" },
  { value: "rescisao_indireta", label: "Rescisão indireta" },
];

const AVISOS = [
  { value: "trabalhado", label: "Trabalhado" },
  { value: "indenizado", label: "Indenizado" },
  { value: "dispensado", label: "Dispensado pelo empregador" },
];

const fmt = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function diffAnosCompletos(admissao, demissao) {
  const a = new Date(admissao);
  const d = new Date(demissao);
  let anos = d.getFullYear() - a.getFullYear();
  const mesOk = d.getMonth() > a.getMonth() || (d.getMonth() === a.getMonth() && d.getDate() >= a.getDate());
  if (!mesOk) anos--;
  return Math.max(0, anos);
}

function avisoDias(anosCompletos, motivo, tipoAviso) {
  if (!["sem_justa_causa", "rescisao_indireta", "acordo_484a"].includes(motivo)) return 0;
  if (tipoAviso === "dispensado") return 0;
  const dias = Math.min(30 + anosCompletos * 3, 90);
  if (motivo === "acordo_484a") return Math.round(dias * 0.5);
  return dias;
}

function calcular(form) {
  const admissao = new Date(form.admission_date);
  const demissao = new Date(form.termination_date);
  const salario = parseFloat(form.salary_base) || 0;
  const media = parseFloat(form.media_variavel) || 0;
  const saldoFgtsInicial = parseFloat(form.saldo_fgts) || 0;
  const motivo = form.termination_reason;
  const tipoAviso = form.aviso_tipo;
  const remuneracao = salario + media;

  const anosCompletos = diffAnosCompletos(form.admission_date, form.termination_date);
  const diasAviso = avisoDias(anosCompletos, motivo, tipoAviso);
  const mesesAviso = tipoAviso === "indenizado" ? diasAviso / 30 : 0;

  // Saldo de salário
  const diaFinal = demissao.getDate();
  const saldoSalario = (remuneracao / 30) * diaFinal;

  // Aviso prévio indenizado
  const avisoValor = tipoAviso === "indenizado" ? (remuneracao / 30) * diasAviso : 0;

  // Avos
  const admissaoMes = admissao.getMonth() + 1;
  const admissaoDia = admissao.getDate();
  const demissaoMes = demissao.getMonth() + 1;
  const demissaoDia = demissao.getDate();
  const demissaoAno = demissao.getFullYear();
  const admissaoAno = admissao.getFullYear();

  // Avos de férias (período aquisitivo)
  const dataFimProjetada = tipoAviso === "indenizado"
    ? new Date(demissao.getTime() + diasAviso * 86400000)
    : demissao;

  // Avos 13º proporcional (jan = 1)
  const avo13 = () => {
    let meses = dataFimProjetada.getMonth() + 1; // jan=1
    if (dataFimProjetada.getDate() < 15) meses -= 1;
    // Descontar meses já de outro ano
    if (dataFimProjetada.getFullYear() > admissaoAno) {
      // avos do ano atual
      meses = dataFimProjetada.getMonth() + 1;
      if (dataFimProjetada.getDate() < 15) meses -= 1;
    } else {
      meses = dataFimProjetada.getMonth() - admissao.getMonth();
      if (admissaoDia > 1) meses += 1;
      if (dataFimProjetada.getDate() < 15) meses -= 1;
    }
    return Math.max(0, Math.min(meses, 12));
  };

  const avosFeriasProporcionais = () => {
    let anoInicioPeriodo = demissaoAno;
    let mesInicio = admissaoMes;
    // último período aquisitivo: aniversário do contrato
    // simplificado: avos desde o último aniversário
    const aniversario = new Date(demissaoAno, admissaoMes - 1, admissaoDia);
    if (aniversario > dataFimProjetada) {
      aniversario.setFullYear(demissaoAno - 1);
    }
    const diffMs = dataFimProjetada - aniversario;
    const diffDias = Math.floor(diffMs / 86400000);
    const avos = Math.min(Math.floor(diffDias / 30) + 1, 12);
    return Math.max(0, avos);
  };

  const avos13 = avo13();
  const avosFerProp = avosFeriasProporcionais();

  // Férias vencidas
  const aniversarioVencido = new Date(demissaoAno, admissaoMes - 1, admissaoDia);
  let feriasVencidas = 0;
  if (aniversarioVencido <= demissao) {
    // há período aquisitivo completo — verificar se já usufruiu (dados não disponíveis, calcular sempre)
    feriasVencidas = remuneracao * (4 / 3);
  }

  // Férias proporcionais
  const feriasProp = motivo === "justa_causa" ? 0 : (remuneracao / 12) * avosFerProp * (4 / 3);

  // 13º proporcional
  const decimo = motivo === "justa_causa" ? 0 : (remuneracao / 12) * avos13;

  // FGTS rescisório (8% sobre aviso indenizado e 13º)
  const fgtsRescisorio = (avisoValor + decimo) * 0.08;

  // Multa FGTS
  let pctMulta = 0;
  if (motivo === "sem_justa_causa" || motivo === "rescisao_indireta") pctMulta = 0.40;
  else if (motivo === "acordo_484a") pctMulta = 0.20;
  const multaFgts = (saldoFgtsInicial + fgtsRescisorio) * pctMulta;

  const total = saldoSalario + avisoValor + feriasVencidas + feriasProp + decimo + fgtsRescisorio + multaFgts;

  const verbas = [
    { nome: "Saldo de salário", valor: saldoSalario, base: `(R$ ${fmt(remuneracao)} ÷ 30) × ${diaFinal} dias` },
    { nome: "Aviso prévio indenizado", valor: avisoValor, base: tipoAviso === "indenizado" ? `${diasAviso} dias × (R$ ${fmt(remuneracao)} ÷ 30)` : "Não aplicável" },
    { nome: "Férias vencidas + 1/3", valor: feriasVencidas, base: feriasVencidas > 0 ? `R$ ${fmt(remuneracao)} × 4/3` : "Não aplicável" },
    { nome: `Férias proporcionais + 1/3 (${avosFerProp}/12 avos)`, valor: feriasProp, base: motivo === "justa_causa" ? "Não devidas (justa causa)" : `R$ ${fmt(remuneracao)} ÷ 12 × ${avosFerProp} × 4/3` },
    { nome: `13º proporcional (${avos13}/12 avos)`, valor: decimo, base: motivo === "justa_causa" ? "Não devido (justa causa)" : `R$ ${fmt(remuneracao)} ÷ 12 × ${avos13}` },
    { nome: "FGTS rescisório (8%)", valor: fgtsRescisorio, base: `8% sobre aviso indenizado + 13º = 8% × R$ ${fmt(avisoValor + decimo)}` },
    { nome: `Multa FGTS (${pctMulta * 100}%)`, valor: multaFgts, base: pctMulta > 0 ? `${pctMulta * 100}% × R$ ${fmt(saldoFgtsInicial + fgtsRescisorio)}` : "Não aplicável" },
  ];

  const alertas = [];
  if (motivo === "acordo_484a") {
    alertas.push("Acordo art. 484-A: aviso prévio de 50% e multa do FGTS de 20% (não 40%).");
    alertas.push("Metade das férias proporcionais + 1/3 e do 13º proporcional são devidos.");
  }
  if (motivo === "justa_causa") alertas.push("Justa causa: não há férias proporcionais, 13º proporcional nem aviso prévio.");
  if (motivo === "pedido_demissao") alertas.push("Pedido de demissão: não há aviso prévio indenizado nem multa de FGTS.");
  if (motivo === "rescisao_indireta") alertas.push("Rescisão indireta equiparada à dispensa sem justa causa para fins de verbas.");
  if (tipoAviso === "indenizado") alertas.push("Aviso prévio indenizado: período projetado soma avos de 13º e férias (Súmula 305 TST). IRRF não incide sobre aviso indenizado.");

  const memoria = [
    `MEMÓRIA DE CÁLCULO`,
    ``,
    `Empregado: ${form.claimant_name} — CPF: ${form.claimant_cpf}`,
    `Admissão: ${form.admission_date} | Demissão: ${form.termination_date} | Anos completos: ${anosCompletos}`,
    `Motivo: ${MOTIVOS.find(m => m.value === motivo)?.label} | Aviso: ${AVISOS.find(a => a.value === tipoAviso)?.label}`,
    `Salário base: ${fmt(salario)} | Média variável: ${fmt(media)} | Remuneração total: ${fmt(remuneracao)}`,
    `Saldo FGTS informado: ${fmt(saldoFgtsInicial)}`,
    ``,
    `AVISO PRÉVIO`,
    `Lei 12.506/2011: 30 dias + ${anosCompletos} × 3 = ${Math.min(30 + anosCompletos * 3, 90)} dias (máx. 90 dias)${motivo === "acordo_484a" ? " × 50% (acordo 484-A)" : ""} = ${diasAviso} dias`,
    ``,
    `VERBAS CALCULADAS`,
    ...verbas.map(v => `  ${v.nome}: ${fmt(v.valor)}  [${v.base}]`),
    ``,
    `TOTAL BRUTO ESTIMADO: ${fmt(total)}`,
    ``,
    `OBSERVAÇÕES`,
    `- Valores estimados para fins de petição. Sujeitos a liquidação por cálculos oficiais.`,
    `- Não foram calculados IRRF nem INSS (sujeitos a tabela progressiva e não-incidências específicas).`,
    `- Férias vencidas: verificar se há período aquisitivo completo não usufruído nos registros do cliente.`,
    ...alertas.map(a => `- ${a}`),
  ].join("\n");

  return { verbas, total, memoria, alertas, anosCompletos, diasAviso, avos13, avosFerProp };
}

export default function CalculadoraVerbas() {
  const navigate = useNavigate();
  const { especialista: esp33 } = useEspecialista("33");
  const [gerandoNarrativa, setGerandoNarrativa] = useState(false);
  const [narrativa, setNarrativa] = useState("");
  const [form, setForm] = useState({
    claimant_name: "",
    claimant_cpf: "",
    admission_date: "",
    termination_date: "",
    termination_reason: "sem_justa_causa",
    aviso_tipo: "indenizado",
    salary_base: "",
    media_variavel: "",
    saldo_fgts: "",
  });
  const [resultado, setResultado] = useState(null);
  const [saving, setSaving] = useState(false);

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleCalcular = () => {
    if (!form.admission_date || !form.termination_date || !form.salary_base) {
      toast.error("Preencha admissão, demissão e salário base.");
      return;
    }
    const r = calcular(form);
    setResultado(r);
  };

  const handleSalvar = async () => {
    if (!resultado) return;
    setSaving(true);
    try {
      await base44.entities.VerbaRescisoriaCalculo.create({
        title: `${form.claimant_name || "Cálculo"} — ${form.termination_date}`,
        claimant_name: form.claimant_name,
        claimant_cpf: form.claimant_cpf,
        admission_date: form.admission_date,
        termination_date: form.termination_date,
        termination_reason: form.termination_reason,
        aviso_tipo: form.aviso_tipo,
        salary_base: parseFloat(form.salary_base) || 0,
        media_variavel: parseFloat(form.media_variavel) || 0,
        saldo_fgts: parseFloat(form.saldo_fgts) || 0,
        anos_completos: resultado.anosCompletos,
        aviso_dias: resultado.diasAviso,
        saldo_salario: resultado.verbas[0].valor,
        aviso_valor: resultado.verbas[1].valor,
        ferias_vencidas: resultado.verbas[2].valor,
        ferias_proporcionais: resultado.verbas[3].valor,
        decimo_terceiro: resultado.verbas[4].valor,
        fgts_deposito_rescisorio: resultado.verbas[5].valor,
        multa_fgts: resultado.verbas[6].valor,
        total_bruto: resultado.total,
        memoria_calculo: resultado.memoria,
      });
      toast.success("Cálculo salvo com sucesso!");
    } catch (e) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGerarNarrativa = async () => {
    if (!resultado) return;
    setGerandoNarrativa(true);
    setNarrativa("");
    try {
      const systemPrompt = esp33?.prompt_sistema || "Você é especialista em cálculo de verbas rescisórias trabalhistas brasileiras. Com base na memória de cálculo fornecida, elabore um texto jurídico técnico para uso em petição.";
      const modelo = esp33?.modelo_ia === "sonnet" ? "claude_sonnet_4_6" : (esp33?.modelo_ia || "claude_sonnet_4_6");
      const r = await base44.integrations.Core.InvokeLLM({
        prompt: `${systemPrompt}\n\n---\n\nElabore o texto jurídico para uso em petição com base na seguinte memória de cálculo:\n\n${resultado.memoria}`,
        model: modelo,
      });
      setNarrativa(r);
    } catch (e) {
      toast.error("Erro ao gerar narrativa: " + e.message);
    } finally {
      setGerandoNarrativa(false);
    }
  };

  const handleUsarEmPeticao = () => {
    if (!resultado) return;
    const calcs = {
      formatted: resultado.memoria,
      total: resultado.total,
      verbas: resultado.verbas,
    };
    localStorage.setItem("juris_calc_import", JSON.stringify({ form, calcs }));
    toast.success("Dados prontos! Redirecionando para nova petição...");
    setTimeout(() => navigate("/nova-peticao"), 800);
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-playfair font-bold flex items-center gap-3">
          <Calculator className="w-7 h-7 text-amber-500" />
          Calculadora de Verbas Rescisórias
        </h1>
        <p className="text-muted-foreground mt-1">Calcule as verbas trabalhistas conforme a CLT e Leis vigentes</p>
      </div>

      <Card className="p-6 lg:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <Label>Nome do empregado</Label>
            <Input className="mt-1.5" value={form.claimant_name} onChange={e => upd("claimant_name", e.target.value)} placeholder="Nome completo" />
          </div>
          <div>
            <Label>CPF</Label>
            <Input className="mt-1.5" value={form.claimant_cpf} onChange={e => upd("claimant_cpf", e.target.value)} placeholder="000.000.000-00" />
          </div>
          <div>
            <Label>Data de admissão *</Label>
            <Input type="date" className="mt-1.5" value={form.admission_date} onChange={e => upd("admission_date", e.target.value)} />
          </div>
          <div>
            <Label>Data de demissão *</Label>
            <Input type="date" className="mt-1.5" value={form.termination_date} onChange={e => upd("termination_date", e.target.value)} />
          </div>
          <div>
            <Label>Motivo do desligamento</Label>
            <Select value={form.termination_reason} onValueChange={v => upd("termination_reason", v)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MOTIVOS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo de aviso prévio</Label>
            <Select value={form.aviso_tipo} onValueChange={v => upd("aviso_tipo", v)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AVISOS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Salário base (R$) *</Label>
            <Input type="number" className="mt-1.5" value={form.salary_base} onChange={e => upd("salary_base", e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <Label>Média variável últimos 12 meses (R$)</Label>
            <Input type="number" className="mt-1.5" value={form.media_variavel} onChange={e => upd("media_variavel", e.target.value)} placeholder="0,00" />
          </div>
          <div className="md:col-span-2">
            <Label>Saldo do FGTS na conta vinculada (R$)</Label>
            <Input type="number" className="mt-1.5" value={form.saldo_fgts} onChange={e => upd("saldo_fgts", e.target.value)} placeholder="0,00" />
          </div>
        </div>

        <div className="mt-6">
          <Button onClick={handleCalcular} className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90 w-full sm:w-auto">
            <Calculator className="w-4 h-4" /> Calcular verbas
          </Button>
        </div>
      </Card>

      {resultado && (
        <>
          {resultado.alertas.length > 0 && (
            <div className="space-y-2">
              {resultado.alertas.map((a, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                  <p>{a}</p>
                </div>
              ))}
            </div>
          )}

          <Card className="p-6 lg:p-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" />
              Resultado do Cálculo
            </h2>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-4 py-3 font-semibold text-foreground">Verba</th>
                    <th className="text-right px-4 py-3 font-semibold text-foreground">Valor</th>
                    <th className="hidden md:table-cell text-left px-4 py-3 font-semibold text-foreground">Base de cálculo</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.verbas.map((v, i) => (
                    <tr key={i} className="border-t hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{v.nome}</td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${v.valor > 0 ? "text-green-700" : "text-muted-foreground"}`}>
                        {fmt(v.valor)}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-muted-foreground text-xs">{v.base}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-primary/30 bg-primary/5">
                    <td className="px-4 py-3 font-bold text-primary">TOTAL BRUTO ESTIMADO</td>
                    <td className="px-4 py-3 text-right font-bold text-primary text-base tabular-nums">{fmt(resultado.total)}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-xs text-muted-foreground">Antes de INSS e IRRF</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Memória de cálculo</h3>
              <pre className="text-xs font-mono bg-muted/40 rounded-xl p-4 whitespace-pre-wrap leading-relaxed border overflow-x-auto">
                {resultado.memoria}
              </pre>
            </div>

            <div className="flex flex-wrap gap-3 mt-6">
              <Button onClick={handleSalvar} disabled={saving} variant="outline" className="gap-2">
                <Save className="w-4 h-4" />
                {saving ? "Salvando..." : "Salvar cálculo"}
              </Button>
              <Button onClick={handleUsarEmPeticao} variant="outline" className="gap-2">
                <FileText className="w-4 h-4" />
                Usar em nova petição
              </Button>
              <Button onClick={handleGerarNarrativa} disabled={gerandoNarrativa} className="gap-2">
                {gerandoNarrativa ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</> : <><Sparkles className="w-4 h-4" /> Gerar Narrativa Jurídica (IA)</>}
              </Button>
            </div>

            {narrativa && (
              <div className="mt-4 space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Narrativa gerada pelo Especialista #{esp33?.numero}</h3>
                <div className="bg-muted/30 rounded-xl border p-5 max-h-[400px] overflow-y-auto">
                  <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-foreground">{narrativa}</pre>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-4 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
              Valores estimados para fins de petição. Sujeitos a liquidação com cálculos oficiais. IRRF e INSS não calculados.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}