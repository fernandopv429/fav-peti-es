import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Calculator, TrendingUp, Wallet, ChevronDown, ChevronUp, Info } from "lucide-react";

function calcularMeses(inicio, fim) {
  if (!inicio) return 0;
  const d1 = new Date(inicio);
  const d2 = fim ? new Date(fim) : new Date();
  const meses = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  return Math.max(0, meses);
}

function calcularAvisoPrevi(meses) {
  const anos = Math.floor(meses / 12);
  return 30 + Math.min(anos * 3, 60); // cap em 90 dias
}

export default function LaborCalculator({ form, updateForm }) {
  const salary = parseFloat(form.salary) || 0;
  const mesesContrato = calcularMeses(form.contract_start, form.contract_end);

  const [params, setParams] = useState({
    minutos_antes: 30,
    minutos_depois: 30,
    intervalo_real_min: 15,
    intervalo_legal_min: 60,
    folgas_mes: 4,
    adicional_he_normal: 50,
    adicional_he_folga: 100,
    tipo_rescisao: "sem_justa_causa",
    dias_por_semana: 4, // média 12x36
    semanas_mes: 4.33,
    saldo_dias: 15,
  });

  const set = (k, v) => setParams((p) => ({ ...p, [k]: v }));

  // ---- CÁLCULOS ----
  const valorHoraContratual = salary / 220;

  // Minutos residuais por dia (entrada antecipada + saída postergada)
  const minResidualDia = params.minutos_antes + params.minutos_depois; // 60 min/dia
  const horasResidualDia = minResidualDia / 60;

  // Intervalo suprimido por dia
  const intervaloSuprimido = Math.max(0, params.intervalo_legal_min - params.intervalo_real_min);
  const horasIntervDia = intervaloSuprimido / 60;

  // Horas extras normais por dia de trabalho
  const heDiariaTotal = horasResidualDia + horasIntervDia;

  // Dias de trabalho por mês (12x36 ≈ 15 dias/mês)
  const diasTrabalhoMes = params.dias_por_semana * params.semanas_mes;

  // HE normais mensais (dias trabalhados)
  const heNormalMensal = heDiariaTotal * diasTrabalhoMes;

  // HE em folgas (jornada completa de 12h na folga)
  const horasFolgaMensal = params.folgas_mes * 12;

  // Valor HE normais
  const valorHeNormal = valorHoraContratual * (1 + params.adicional_he_normal / 100) * heNormalMensal;

  // Valor HE folgas
  const valorHeFolga = valorHoraContratual * (1 + params.adicional_he_folga / 100) * horasFolgaMensal;

  // Total HE mensal
  const totalHeMensal = valorHeNormal + valorHeFolga;

  // DSR sobre HE (1/5 das HE)
  const dsrHE = totalHeMensal / 5;

  const totalHeMensalComDsr = totalHeMensal + dsrHE;

  // Total no período
  const totalHePeriodo = totalHeMensalComDsr * mesesContrato;

  // Reflexos
  const base13 = totalHeMensalComDsr;
  const decimoTerceiro = (base13 / 12) * (mesesContrato % 12 || 12);
  const mesesFerias = mesesContrato % 12 || 12;
  const ferias = (salary / 12) * mesesFerias * (1 + 1 / 3);
  const feriasHE = (base13 / 12) * mesesFerias * (1 + 1 / 3);
  const fgtsBase = (totalHePeriodo + decimoTerceiro + feriasHE) * 0.08;

  // ---- VERBAS RESCISÓRIAS ----
  const saldoSalario = (salary / 30) * params.saldo_dias;

  const diasAviso = calcularAvisoPrevi(mesesContrato);
  const avisoPrevi = params.tipo_rescisao === "sem_justa_causa" ? (salary / 30) * diasAviso : 0;

  const prop13 = (salary / 12) * (mesesContrato % 12 || 12);

  const feriasProp = (salary / 12) * (mesesFerias) * (1 + 1 / 3);

  const fgtsRescisorio = (saldoSalario + avisoPrevi + prop13 + feriasProp) * 0.08;
  const multaFgts = params.tipo_rescisao === "sem_justa_causa"
    ? (salary * mesesContrato * 0.08 + totalHePeriodo * 0.08) * 0.4
    : 0;

  const totalVerbas = saldoSalario + avisoPrevi + prop13 + feriasProp + fgtsRescisorio + multaFgts;
  const totalGeral = totalHePeriodo + decimoTerceiro + feriasHE + fgtsBase + totalVerbas;

  // Persist calculations to parent
  useEffect(() => {
    const result = {
      params,
      mesesContrato,
      valorHoraContratual,
      minResidualDia,
      intervaloSuprimido,
      heDiariaTotal,
      diasTrabalhoMes,
      heNormalMensal,
      horasFolgaMensal,
      totalHePeriodo,
      totalHeMensalComDsr,
      dsrHE,
      decimoTerceiro,
      feriasHE,
      fgtsBase,
      saldoSalario,
      avisoPrevi,
      diasAviso,
      prop13,
      feriasProp,
      fgtsRescisorio,
      multaFgts,
      totalVerbas,
      totalGeral,
      formatted: formatResult({
        params,
        salary, mesesContrato, valorHoraContratual, minResidualDia, intervaloSuprimido,
        heDiariaTotal, diasTrabalhoMes, heNormalMensal, horasFolgaMensal, valorHeNormal,
        valorHeFolga, totalHeMensal, dsrHE, totalHeMensalComDsr, totalHePeriodo,
        decimoTerceiro, feriasHE, fgtsBase, saldoSalario, avisoPrevi, diasAviso,
        prop13, feriasProp, fgtsRescisorio, multaFgts, totalVerbas, totalGeral,
        adicional_he_normal: params.adicional_he_normal, adicional_he_folga: params.adicional_he_folga,
        tipo_rescisao: params.tipo_rescisao,
      }),
    };
    updateForm("calculations", result);
  }, [params, salary, mesesContrato]);

  const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtH = (v) => `${v.toFixed(2)}h`;

  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Cálculos Trabalhistas</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Ajuste os parâmetros para calcular horas extras e verbas rescisórias. Os valores serão integrados automaticamente na petição.
        </p>
      </div>

      {/* Params */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field label="Minutos antes do turno">
          <Input type="number" value={params.minutos_antes} onChange={(e) => set("minutos_antes", +e.target.value)} />
        </Field>
        <Field label="Minutos após o turno">
          <Input type="number" value={params.minutos_depois} onChange={(e) => set("minutos_depois", +e.target.value)} />
        </Field>
        <Field label="Intervalo real (min)">
          <Input type="number" value={params.intervalo_real_min} onChange={(e) => set("intervalo_real_min", +e.target.value)} />
        </Field>
        <Field label="Folgas trabalhadas/mês">
          <Input type="number" value={params.folgas_mes} onChange={(e) => set("folgas_mes", +e.target.value)} />
        </Field>
        <Field label="Adicional HE normal (%)">
          <Input type="number" value={params.adicional_he_normal} onChange={(e) => set("adicional_he_normal", +e.target.value)} />
        </Field>
        <Field label="Adicional HE folga (%)">
          <Input type="number" value={params.adicional_he_folga} onChange={(e) => set("adicional_he_folga", +e.target.value)} />
        </Field>
        <Field label="Saldo salário (dias)">
          <Input type="number" value={params.saldo_dias} onChange={(e) => set("saldo_dias", +e.target.value)} />
        </Field>
        <Field label="Tipo de Rescisão" className="col-span-2 md:col-span-2">
          <Select value={params.tipo_rescisao} onValueChange={(v) => set("tipo_rescisao", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sem_justa_causa">Sem justa causa (pelo empregador)</SelectItem>
              <SelectItem value="justa_causa">Por justa causa</SelectItem>
              <SelectItem value="pedido_demissao">Pedido de demissão</SelectItem>
              <SelectItem value="rescisao_indireta">Rescisão indireta</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          icon={TrendingUp}
          label="Total Horas Extras (c/ reflexos)"
          value={fmt(totalHePeriodo + decimoTerceiro + feriasHE + fgtsBase)}
          sub={`${fmtH(heDiariaTotal)} extras/dia · ${fmtH(horasFolgaMensal)} em folgas/mês`}
          color="text-amber-600"
          bg="bg-amber-50"
        />
        <SummaryCard
          icon={Wallet}
          label="Verbas Rescisórias"
          value={fmt(totalVerbas)}
          sub={`${diasAviso} dias aviso prévio · FGTS ${fmt(multaFgts)}`}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <SummaryCard
          icon={Calculator}
          label="VALOR TOTAL DA CAUSA"
          value={fmt(totalGeral)}
          sub={`${mesesContrato} meses de contrato`}
          color="text-green-700"
          bg="bg-green-50"
          highlight
        />
      </div>

      {/* Detailed breakdown */}
      <div className="border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted transition-colors text-sm font-medium"
        >
          <span>Ver detalhamento completo dos cálculos</span>
          {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showDetails && (
          <div className="p-5 space-y-6 text-sm">
            <Section title="HORAS EXTRAS — MINUTOS RESIDUAIS E INTERVALO">
              <Row label="Valor hora contratual" value={fmt(valorHoraContratual)} />
              <Row label={`Minutos residuais/dia (${params.minutos_antes}min antes + ${params.minutos_depois}min depois)`} value={`${minResidualDia} min (${fmtH(horasResidualDia)})`} />
              <Row label={`Intervalo suprimido/dia (legal ${params.intervalo_legal_min}min – real ${params.intervalo_real_min}min)`} value={`${intervaloSuprimido} min (${fmtH(horasIntervDia)})`} />
              <Row label="Total horas extras por dia trabalhado" value={fmtH(heDiariaTotal)} bold />
              <Row label={`Dias trabalhados/mês (estimativa 12x36)`} value={`${diasTrabalhoMes.toFixed(1)} dias`} />
              <Row label="HE mensais (dias normais)" value={`${heNormalMensal.toFixed(2)}h → ${fmt(valorHeNormal)}`} />
              <Row label={`HE em ${params.folgas_mes} folgas/mês (12h × ${params.adicional_he_folga}%)`} value={`${horasFolgaMensal}h → ${fmt(valorHeFolga)}`} />
              <Row label="DSR sobre HE (1/5)" value={fmt(dsrHE)} />
              <Row label="Total HE mensal (c/ DSR)" value={fmt(totalHeMensalComDsr)} bold />
              <Row label={`Total HE no período (${mesesContrato} meses)`} value={fmt(totalHePeriodo)} bold />
            </Section>

            <Section title="REFLEXOS DAS HORAS EXTRAS">
              <Row label="13º salário proporcional s/ HE" value={fmt(decimoTerceiro)} />
              <Row label="Férias proporcionais + 1/3 s/ HE" value={fmt(feriasHE)} />
              <Row label="FGTS (8%) s/ HE + reflexos" value={fmt(fgtsBase)} />
            </Section>

            <Section title="VERBAS RESCISÓRIAS">
              <Row label={`Saldo de salário (${params.saldo_dias} dias)`} value={fmt(saldoSalario)} />
              {params.tipo_rescisao !== "justa_causa" && (
                <Row label={`Aviso prévio indenizado (${diasAviso} dias)`} value={fmt(avisoPrevi)} />
              )}
              <Row label={`13º salário proporcional (${mesesContrato % 12 || 12}/12)`} value={fmt(prop13)} />
              <Row label={`Férias proporcionais + 1/3 (${mesesFerias}/12)`} value={fmt(feriasProp)} />
              <Row label="FGTS (8%) s/ verbas rescisórias" value={fmt(fgtsRescisorio)} />
              {params.tipo_rescisao === "sem_justa_causa" || params.tipo_rescisao === "rescisao_indireta" ? (
                <Row label="Multa FGTS (40%)" value={fmt(multaFgts)} />
              ) : null}
              <Row label="TOTAL VERBAS RESCISÓRIAS" value={fmt(totalVerbas)} bold />
            </Section>

            <div className="p-4 rounded-xl bg-green-50 border border-green-200">
              <div className="flex justify-between items-center">
                <span className="font-bold text-green-800">VALOR TOTAL DA CAUSA</span>
                <span className="font-bold text-green-800 text-lg">{fmt(totalGeral)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 text-blue-700 text-xs">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>Os valores são estimativas baseadas nos parâmetros informados. A IA utilizará estes cálculos para fundamentar os pedidos na petição gerada.</p>
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <div className={className}>
      <Label className="text-xs mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, sub, color, bg, highlight }) {
  return (
    <div className={`p-4 rounded-xl border ${highlight ? "border-green-200 bg-green-50" : "border-border bg-card"}`}>
      <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-bold ${highlight ? "text-green-700" : "text-foreground"}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-3 border-b pb-2">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className={`flex justify-between items-center py-1 ${bold ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground text-xs flex-1 pr-4">{label}</span>
      <span className={`shrink-0 ${bold ? "text-foreground" : "text-foreground/80"}`}>{value}</span>
    </div>
  );
}

function formatResult(d) {
  const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtH = (v) => `${v.toFixed(2)}h`;
  const tipoRescisaoLabel = {
    sem_justa_causa: "sem justa causa pelo empregador",
    justa_causa: "por justa causa",
    pedido_demissao: "por pedido de demissão",
    rescisao_indireta: "por rescisão indireta",
  }[d.tipo_rescisao] || d.tipo_rescisao;

  return `
=== MEMÓRIA DE CÁLCULO — VALORES ESTIMADOS ===

DADOS BASE:
- Salário contratual: ${fmt(d.salary)}
- Valor hora contratual: ${fmt(d.valorHoraContratual)}
- Período trabalhado: ${d.mesesContrato} meses
- Tipo de rescisão: ${tipoRescisaoLabel}

HORAS EXTRAS:
- Minutos residuais por dia: ${d.minResidualDia} min → ${fmtH(d.minResidualDia / 60)} extras/dia
- Intervalo suprimido por dia: ${d.intervaloSuprimido} min → ${fmtH(d.intervaloSuprimido / 60)}/dia
- Total horas extras por dia trabalhado: ${fmtH(d.heDiariaTotal)}
- Horas extras em ${d.params.folgas_mes} folgas/mês: ${fmtH(d.horasFolgaMensal)}
- DSR sobre horas extras: ${fmt(d.dsrHE)}/mês
- TOTAL HORAS EXTRAS NO PERÍODO: ${fmt(d.totalHePeriodo)}

REFLEXOS DAS HORAS EXTRAS:
- 13º salário proporcional sobre HE: ${fmt(d.decimoTerceiro)}
- Férias proporcionais + 1/3 sobre HE: ${fmt(d.feriasHE)}
- FGTS (8%) sobre HE e reflexos: ${fmt(d.fgtsBase)}

VERBAS RESCISÓRIAS:
- Saldo de salário: ${fmt(d.saldoSalario)}
- Aviso prévio indenizado (${d.diasAviso} dias): ${fmt(d.avisoPrevi)}
- 13º salário proporcional: ${fmt(d.prop13)}
- Férias proporcionais + 1/3: ${fmt(d.feriasProp)}
- FGTS (8%) sobre rescisórias: ${fmt(d.fgtsRescisorio)}
- Multa FGTS 40%: ${fmt(d.multaFgts)}
- TOTAL VERBAS RESCISÓRIAS: ${fmt(d.totalVerbas)}

VALOR TOTAL ESTIMADO DA CAUSA: ${fmt(d.totalGeral)}

IMPORTANTE: Estes valores devem ser utilizados como base para a liquidação dos pedidos na petição inicial, apresentando cada verba discriminada com seu respectivo valor estimado.
`;
}