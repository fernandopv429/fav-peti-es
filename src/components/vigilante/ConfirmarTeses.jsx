import { useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

const TIPOS_RESCISAO = [
  { value: "dispensa_sem_justa_causa", label: "Dispensa sem justa causa" },
  { value: "rescisao_indireta",        label: "Rescisão indireta" },
  { value: "reversao_justa_causa",     label: "Reversão de justa causa" },
  { value: "pedido_demissao",          label: "Pedido de demissão" },
];

/**
 * Modal de confirmação do tipo de rescisão e teses opcionais.
 * Props:
 *   dadosIniciais — objeto CasoVigilante (para pré-selecionar sugestão da IA)
 *   onConfirmar(dadosAtualizados) — chamado com dados incluindo TIPO_RESCISAO + flags
 *   onCancelar()
 */
export default function ConfirmarTeses({ dadosIniciais, onConfirmar, onCancelar }) {
  const [tipoRescisao, setTipoRescisao] = useState(dadosIniciais?.TIPO_RESCISAO || "");
  const [temSubsidiaria, setTemSubsidiaria] = useState(dadosIniciais?.tem_subsidiaria ?? true);
  const [temDesvio, setTemDesvio]           = useState(dadosIniciais?.tem_desvio ?? false);
  const [temAdicNoturno, setTemAdicNoturno] = useState(dadosIniciais?.tem_adic_noturno ?? false);

  const podeGerar = !!tipoRescisao;

  const handleConfirmar = () => {
    if (!podeGerar) return;
    onConfirmar({
      ...dadosIniciais,
      TIPO_RESCISAO: tipoRescisao,
      tem_subsidiaria: temSubsidiaria,
      tem_desvio: temDesvio,
      tem_adic_noturno: temAdicNoturno,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h2 className="font-bold text-foreground text-base">Confirmar tipo de rescisão e teses</h2>
              <p className="text-xs text-muted-foreground mt-0.5">O advogado deve confirmar antes de gerar o documento</p>
            </div>
          </div>
          <button onClick={onCancelar} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tipo de rescisão — obrigatório */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Tipo de rescisão <span className="text-destructive">*</span>
          </label>
          <div className="space-y-2">
            {TIPOS_RESCISAO.map(op => (
              <label
                key={op.value}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                  tipoRescisao === op.value
                    ? "border-primary bg-primary/8 text-foreground"
                    : "border-border hover:border-primary/40 text-foreground"
                }`}
              >
                <input
                  type="radio"
                  name="tipo_rescisao"
                  value={op.value}
                  checked={tipoRescisao === op.value}
                  onChange={() => setTipoRescisao(op.value)}
                  className="accent-primary"
                />
                <span className="text-sm font-medium">{op.label}</span>
                {dadosIniciais?.TIPO_RESCISAO === op.value && (
                  <span className="ml-auto text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">IA sugeriu</span>
                )}
              </label>
            ))}
          </div>
          {!tipoRescisao && (
            <p className="text-xs text-destructive mt-1.5">Selecione o tipo de rescisão para habilitar a geração.</p>
          )}
        </div>

        {/* Teses opcionais */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Teses opcionais</label>
          <div className="space-y-2">
            {[
              { key: "tem_subsidiaria", val: temSubsidiaria, set: setTemSubsidiaria,
                label: "Responsabilidade subsidiária", sub: "Súmula 331 TST" },
              { key: "tem_desvio", val: temDesvio, set: setTemDesvio,
                label: "Desvio de função", sub: "Cláusula 64ª da CCT" },
              { key: "tem_adic_noturno", val: temAdicNoturno, set: setTemAdicNoturno,
                label: "Adicional noturno / hora reduzida", sub: "Súmulas 60 e 91 TST" },
            ].map(item => (
              <label
                key={item.key}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                  item.val ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.val}
                  onChange={e => item.set(e.target.checked)}
                  className="accent-primary w-4 h-4"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.sub}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Ações */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onCancelar}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={!podeGerar}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground text-sm font-bold transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            Gerar petição
          </button>
        </div>
      </div>
    </div>
  );
}