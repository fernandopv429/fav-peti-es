import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, X, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";

const TIPOS_RESCISAO = [
  { value: "dispensa_sem_justa_causa", label: "Dispensa sem justa causa" },
  { value: "rescisao_indireta",        label: "Rescisão indireta" },
  { value: "reversao_justa_causa",     label: "Reversão de justa causa" },
  { value: "pedido_demissao",          label: "Pedido de demissão" },
];

/**
 * Modal de confirmação do tipo de rescisão e teses opcionais.
 * Props:
 *   dadosIniciais — objeto CasoVigilante
 *   documentUrls  — URLs dos documentos anexados (para análise IA)
 *   onConfirmar(dadosAtualizados) — chamado com dados incluindo TIPO_RESCISAO + flags
 *   onCancelar()
 */
export default function ConfirmarTeses({ dadosIniciais, documentUrls = [], onConfirmar, onCancelar }) {
  const [tipoRescisao, setTipoRescisao]     = useState(dadosIniciais?.TIPO_RESCISAO || "");
  const [temSubsidiaria, setTemSubsidiaria] = useState(dadosIniciais?.tem_subsidiaria ?? true);
  const [temDesvio, setTemDesvio]           = useState(dadosIniciais?.tem_desvio ?? false);
  const [temAdicNoturno, setTemAdicNoturno] = useState(dadosIniciais?.tem_adic_noturno ?? false);

  const [analisando, setAnalisando]   = useState(false);
  const [sugestao, setSugestao]       = useState(null); // { tipo_rescisao, tem_subsidiaria, tem_desvio, tem_adic_noturno, justificativas, confianca }
  const [erroIA, setErroIA]           = useState("");

  // Executa análise automaticamente ao abrir o modal (se não há tipo já definido)
  useEffect(() => {
    if (!dadosIniciais?.TIPO_RESCISAO) {
      analisarComIA();
    }
  }, []);

  const analisarComIA = async () => {
    setAnalisando(true);
    setErroIA("");
    setSugestao(null);

    // Monta contexto do caso
    const contexto = [
      dadosIniciais?.RECL_NOME && `Reclamante: ${dadosIniciais.RECL_NOME}`,
      dadosIniciais?.RECL1_NOME && `1ª Reclamada: ${dadosIniciais.RECL1_NOME}`,
      dadosIniciais?.RECL2_NOME && `2ª Reclamada (tomadora): ${dadosIniciais.RECL2_NOME}`,
      dadosIniciais?.RECL3_NOME && `3ª Reclamada (tomadora): ${dadosIniciais.RECL3_NOME}`,
      dadosIniciais?.DATA_ADMISSAO && `Admissão: ${dadosIniciais.DATA_ADMISSAO}`,
      dadosIniciais?.DATA_RESCISAO && `Rescisão: ${dadosIniciais.DATA_RESCISAO}`,
      dadosIniciais?.FUNCAO && `Função: ${dadosIniciais.FUNCAO}`,
      dadosIniciais?.SALARIO && `Salário: ${dadosIniciais.SALARIO}`,
      dadosIniciais?.JORNADA_HORARIO && `Jornada: ${dadosIniciais.JORNADA_HORARIO}`,
      dadosIniciais?.titulo && `Caso: ${dadosIniciais.titulo}`,
    ].filter(Boolean).join("\n");

    const prompt = `Você é um advogado trabalhista especializado em casos de vigilantes 12x36. Analise os dados e documentos do caso abaixo e determine:

1. TIPO_RESCISAO: qual das 4 opções se aplica:
   - "dispensa_sem_justa_causa": empregador dispensou sem motivo grave
   - "rescisao_indireta": empregador descumpriu obrigações graves (NR10, pagamentos, etc.)
   - "reversao_justa_causa": empregador alegou justa causa indevida
   - "pedido_demissao": empregado pediu demissão voluntariamente

2. tem_subsidiaria (true/false): há 2ª ou 3ª reclamada (tomadora de serviços)? → Súmula 331 TST

3. tem_desvio (true/false): há indícios de desvio de função (atividades além das atribuições do vigilante, fora da cláusula 64ª CCT)?

4. tem_adic_noturno (true/false): a jornada tem horas noturnas (entre 22h e 05h)? → Súmulas 60 e 91 TST

DADOS DO CASO:
${contexto}

Responda SOMENTE com JSON válido neste formato:
{
  "tipo_rescisao": "dispensa_sem_justa_causa",
  "tem_subsidiaria": true,
  "tem_desvio": false,
  "tem_adic_noturno": true,
  "confianca": "alta",
  "justificativas": {
    "tipo_rescisao": "Texto curto explicando a conclusão (1-2 linhas)",
    "tem_subsidiaria": "Texto curto",
    "tem_desvio": "Texto curto",
    "tem_adic_noturno": "Texto curto"
  }
}

Se não houver informação suficiente para decidir com segurança algum item, use "confianca": "baixa" e explique na justificativa correspondente.`;

    try {
      const fileUrls = (documentUrls || []).filter(Boolean);
      const resultado = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: "claude_sonnet_4_6",
        file_urls: fileUrls.length > 0 ? fileUrls : undefined,
        response_json_schema: {
          type: "object",
          properties: {
            tipo_rescisao:    { type: "string" },
            tem_subsidiaria:  { type: "boolean" },
            tem_desvio:       { type: "boolean" },
            tem_adic_noturno: { type: "boolean" },
            confianca:        { type: "string" },
            justificativas: {
              type: "object",
              properties: {
                tipo_rescisao:    { type: "string" },
                tem_subsidiaria:  { type: "string" },
                tem_desvio:       { type: "string" },
                tem_adic_noturno: { type: "string" },
              }
            }
          }
        }
      });

      setSugestao(resultado);

      // Pré-seleciona as sugestões
      if (resultado.tipo_rescisao) setTipoRescisao(resultado.tipo_rescisao);
      if (typeof resultado.tem_subsidiaria === "boolean") setTemSubsidiaria(resultado.tem_subsidiaria);
      if (typeof resultado.tem_desvio === "boolean")      setTemDesvio(resultado.tem_desvio);
      if (typeof resultado.tem_adic_noturno === "boolean") setTemAdicNoturno(resultado.tem_adic_noturno);

    } catch (e) {
      setErroIA("Não foi possível analisar automaticamente: " + (e.message || String(e)));
    } finally {
      setAnalisando(false);
    }
  };

  const podeGerar = !!tipoRescisao;

  const handleConfirmar = () => {
    if (!podeGerar) return;
    onConfirmar({
      ...dadosIniciais,
      TIPO_RESCISAO:    tipoRescisao,
      tem_subsidiaria:  temSubsidiaria,
      tem_desvio:       temDesvio,
      tem_adic_noturno: temAdicNoturno,
    });
  };

  const justas = sugestao?.justificativas || {};
  const confiancaBaixa = sugestao?.confianca === "baixa";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h2 className="font-bold text-foreground text-base">Confirmar tipo de rescisão e teses</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Revise a sugestão da IA e confirme antes de gerar</p>
            </div>
          </div>
          <button onClick={onCancelar} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status da análise IA */}
        {analisando && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
            <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
            <p className="text-sm text-primary font-medium">Analisando documentos e dados do caso com IA...</p>
          </div>
        )}

        {!analisando && sugestao && (
          <div className={`flex items-center gap-3 p-3 rounded-xl border ${confiancaBaixa ? "bg-amber-50/50 border-amber-200 dark:bg-amber-950/20" : "bg-green-50/50 border-green-200 dark:bg-green-950/20"}`}>
            <Sparkles className={`w-4 h-4 shrink-0 ${confiancaBaixa ? "text-amber-500" : "text-green-600"}`} />
            <p className={`text-xs font-medium ${confiancaBaixa ? "text-amber-700 dark:text-amber-400" : "text-green-700 dark:text-green-400"}`}>
              {confiancaBaixa
                ? "IA analisou com baixa confiança — revise as sugestões com atenção."
                : "IA classificou o caso automaticamente — revise e confirme."}
            </p>
            <button
              type="button"
              onClick={analisarComIA}
              className="ml-auto p-1 rounded-lg hover:bg-black/10 text-muted-foreground"
              title="Re-analisar"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {!analisando && erroIA && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50/50 border border-red-200 dark:bg-red-950/20">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-red-700 dark:text-red-400">{erroIA}</p>
            </div>
            <button type="button" onClick={analisarComIA} className="ml-auto p-1 rounded-lg hover:bg-red-100 text-red-500 shrink-0" title="Tentar novamente">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tipo de rescisão — obrigatório */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Tipo de rescisão <span className="text-destructive">*</span>
          </label>
          <div className="space-y-2">
            {TIPOS_RESCISAO.map(op => {
              const isIA = sugestao?.tipo_rescisao === op.value;
              const isSelected = tipoRescisao === op.value;
              return (
                <label
                  key={op.value}
                  className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                    isSelected ? "border-primary bg-primary/8 text-foreground" : "border-border hover:border-primary/40 text-foreground"
                  }`}
                >
                  <input
                    type="radio"
                    name="tipo_rescisao"
                    value={op.value}
                    checked={isSelected}
                    onChange={() => setTipoRescisao(op.value)}
                    className="accent-primary mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{op.label}</span>
                      {isIA && (
                        <span className="text-xs bg-primary/15 text-primary font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" /> IA sugeriu
                        </span>
                      )}
                    </div>
                    {isIA && justas.tipo_rescisao && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{justas.tipo_rescisao}</p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
          {!tipoRescisao && !analisando && (
            <p className="text-xs text-destructive mt-1.5">Selecione o tipo de rescisão para habilitar a geração.</p>
          )}
        </div>

        {/* Teses opcionais */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Teses opcionais</label>
          <div className="space-y-2">
            {[
              {
                key: "tem_subsidiaria", val: temSubsidiaria, set: setTemSubsidiaria,
                label: "Responsabilidade subsidiária", sub: "Súmula 331 TST",
                just: justas.tem_subsidiaria,
                iaVal: sugestao?.tem_subsidiaria,
              },
              {
                key: "tem_desvio", val: temDesvio, set: setTemDesvio,
                label: "Desvio de função", sub: "Cláusula 64ª da CCT",
                just: justas.tem_desvio,
                iaVal: sugestao?.tem_desvio,
              },
              {
                key: "tem_adic_noturno", val: temAdicNoturno, set: setTemAdicNoturno,
                label: "Adicional noturno / hora reduzida", sub: "Súmulas 60 e 91 TST",
                just: justas.tem_adic_noturno,
                iaVal: sugestao?.tem_adic_noturno,
              },
            ].map(item => (
              <label
                key={item.key}
                className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                  item.val ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.val}
                  onChange={e => item.set(e.target.checked)}
                  className="accent-primary w-4 h-4 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    {sugestao && typeof item.iaVal === "boolean" && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        {item.iaVal ? "IA: incluir" : "IA: não incluir"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{item.sub}</p>
                  {item.just && (
                    <p className="text-xs text-muted-foreground/80 mt-0.5 leading-relaxed italic">{item.just}</p>
                  )}
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
            disabled={!podeGerar || analisando}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground text-sm font-bold transition-colors"
          >
            {analisando
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Analisando...</>
              : <><CheckCircle2 className="w-4 h-4" /> Gerar petição</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}