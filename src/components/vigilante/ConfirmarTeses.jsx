import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, X, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { derivarFlags } from "@/lib/derivarFlags.js";

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
  // ── Pré-seleção 100% determinística via derivarFlags ─────────────────────
  const flagsIniciais = derivarFlags(dadosIniciais || {}, "vigilante");

  // Mapa flag interna → valor TIPO_RESCISAO esperado pelos selects
  const FLAG_TO_TIPO = {
    t_dispensa: "dispensa_sem_justa_causa",
    t_indireta: "rescisao_indireta",
    t_coacao:   "pedido_demissao",
    t_reversao: "reversao_justa_causa",
  };
  const rescisaoInicial =
    FLAG_TO_TIPO[Object.keys(FLAG_TO_TIPO).find(f => flagsIniciais[f])] || "";

  const [tipoRescisao, setTipoRescisao]     = useState(rescisaoInicial);
  const [temSubsidiaria, setTemSubsidiaria] = useState(flagsIniciais.tem_subsidiaria);
  const [temDesvio, setTemDesvio]           = useState(flagsIniciais.tem_desvio);
  const [temAdicNoturno, setTemAdicNoturno] = useState(flagsIniciais.tem_adic_noturno);

  // Rastreia o que já foi preenchido deterministicamente (não deixa IA sobrescrever)
  const [detDefined] = useState(() => {
    const d = dadosIniciais || {};
    const s = new Set();
    if (d.tipo_dispensa || d.TIPO_RESCISAO || ["t_dispensa","t_coacao","t_indireta","t_reversao"].some(f => d[f])) s.add("tipo_rescisao");
    if (d.RECL2_NOME || d.tem_subsidiaria !== undefined) s.add("tem_subsidiaria");
    if (d.acumulo_funcao || d.tem_desvio !== undefined) s.add("tem_desvio");
    if (d.tem_adic_noturno !== undefined) s.add("tem_adic_noturno");
    return s;
  });

  const [analisando, setAnalisando]   = useState(false);
  const [sugestao, setSugestao]       = useState(null);
  const [erroIA, setErroIA]           = useState("");
  const [confiancaCampos, setConfiancaCampos] = useState({});

  // Sempre executa análise IA ao abrir — pré-seleciona campos faltantes a partir dos documentos e dados
  useEffect(() => {
    analisarComIA();
  }, []);

  const analisarComIA = async () => {
    setAnalisando(true);
    setErroIA("");
    setSugestao(null);
    setConfiancaCampos({});

    const d = dadosIniciais || {};

    // Contexto completo: dados estruturados + flags de entrevista
    const contexto = [
      d.RECL_NOME && `Reclamante: ${d.RECL_NOME}`,
      d.RECL_CPF && `CPF: ${d.RECL_CPF}`,
      d.RECL1_NOME && `1ª Reclamada (empregadora): ${d.RECL1_NOME}${d.RECL1_CNPJ ? ` (CNPJ: ${d.RECL1_CNPJ})` : ""}`,
      d.RECL2_NOME && `2ª Reclamada (tomadora): ${d.RECL2_NOME}${d.RECL2_CNPJ ? ` (CNPJ: ${d.RECL2_CNPJ})` : ""}`,
      d.RECL3_NOME && `3ª Reclamada: ${d.RECL3_NOME}`,
      d.DATA_ADMISSAO && `Admissão: ${d.DATA_ADMISSAO}`,
      d.DATA_RESCISAO && `Rescisão: ${d.DATA_RESCISAO}`,
      d.FUNCAO && `Função: ${d.FUNCAO}`,
      d.SALARIO && `Salário: ${d.SALARIO}`,
      d.JORNADA_HORARIO && `Jornada: ${d.JORNADA_HORARIO}`,
      d.JORNADA_EXTRAPOLA && `Extrapolação habitual: ${d.JORNADA_EXTRAPOLA}`,
      d.JORNADA_FREQ_EXTRA && `Frequência extras: ${d.JORNADA_FREQ_EXTRA}`,
      d.INTERVALO_GOZADO && `Intervalo gozado: ${d.INTERVALO_GOZADO}`,
      d.COMARCA_UF && `Comarca/UF: ${d.COMARCA_UF}`,
      d.LOCAL_PRESTACAO && `Local prestação: ${d.LOCAL_PRESTACAO}`,
      d.tipo_dispensa && `Tipo dispensa (entrevista): ${d.tipo_dispensa}`,
      d.acumulo_funcao && `Acúmulo/desvio de função: sim (marcado na entrevista)`,
      d.tem_insalubridade && `Insalubridade: sim`,
      d.tem_periculosidade && `Periculosidade: sim`,
      d.titulo && `Caso: ${d.titulo}`,
    ].filter(Boolean).join("\n");

    const prompt = `Você é um advogado trabalhista especializado em reclamações de vigilantes 12×36. Analise CUIDADOSAMENTE todos os dados do caso abaixo E os documentos/imagens anexados (CTPS, entrevista, holerites, etc.) e PRÉ-SELECIONE cada campo.

REGRAS DE PRÉ-SELEÇÃO (siga rigorosamente):

1. TIPO_RESCISAO — pré-marcar exatamente UMA opção:
   • "dispensa_sem_justa_causa" → relato/entrevista indica que o empregador dispensou sem motivo grave
   • "rescisao_indireta" → indica rescisão indireta / art. 483 CLT / faltas graves do empregador
   • "reversao_justa_causa" → indica dispensa por justa causa que se quer reverter judicialmente
   • "pedido_demissao" → indica coação/ameaça para pedir demissão ou nulidade do pedido de demissão

2. tem_subsidiaria (true/false):
   → true SOMENTE se houver 2ª reclamada / tomadora de serviços identificada (Súmula 331 TST)

3. tem_desvio (true/false):
   → true SOMENTE se o reclamante exercia funções além das atribuições contratuais de vigilante (controle de acesso, porteiro, serviços gerais — Cláusula 64ª CCT)

4. tem_adic_noturno (true/false):
   → true SOMENTE se a jornada cruzar o período noturno 22h–05h (art. 73 CLT, Súmulas 60 e 91 TST)
   → NUNCA marcar para jornada exclusivamente diurna (ex: 07h–19h)

⚠️ CONFIANÇA POR CAMPO: Para CADA campo, informe "alta" ou "baixa":
   • "alta" = há evidência clara e inequívoca nos dados ou documentos
   • "baixa" = informação insuficiente, ambígua ou ausente
   Se a confiança for "baixa", use o valor mais conservador (false para booleanos, "" para tipo_rescisao).
   É MELHOR deixar vazio/false e sinalizar "baixa" do que pré-selecionar errado.

DADOS DO CASO:
${contexto}

Retorne SOMENTE JSON válido (sem markdown):
{
  "tipo_rescisao": "dispensa_sem_justa_causa",
  "tem_subsidiaria": false,
  "tem_desvio": false,
  "tem_adic_noturno": false,
  "confianca_campos": {
    "tipo_rescisao": "alta",
    "tem_subsidiaria": "alta",
    "tem_desvio": "baixa",
    "tem_adic_noturno": "alta"
  },
  "justificativas": {
    "tipo_rescisao": "Explicação curta (1-2 linhas)",
    "tem_subsidiaria": "Explicação curta",
    "tem_desvio": "Explicação curta",
    "tem_adic_noturno": "Explicação curta"
  }
}`;

    try {
      const fileUrls = (documentUrls || []).filter(Boolean);

      // Timeout de 20s
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 20000)
      );
      const iaPromise = base44.integrations.Core.InvokeLLM({
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
            confianca_campos: {
              type: "object",
              properties: {
                tipo_rescisao:    { type: "string" },
                tem_subsidiaria:  { type: "string" },
                tem_desvio:       { type: "string" },
                tem_adic_noturno: { type: "string" },
              }
            },
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

      const resultado = await Promise.race([iaPromise, timeoutPromise]);
      setSugestao(resultado);

      // Guarda confiança por campo para indicadores visuais
      const cc = resultado.confianca_campos || {};
      setConfiancaCampos(cc);

      // Aplica sugestões — NÃO sobrescreve campos determinísticos, NÃO pré-seleciona campos com confiança baixa
      if (!detDefined.has("tipo_rescisao") && resultado.tipo_rescisao && cc.tipo_rescisao !== "baixa") {
        setTipoRescisao(resultado.tipo_rescisao);
      }
      if (!detDefined.has("tem_subsidiaria") && typeof resultado.tem_subsidiaria === "boolean" && cc.tem_subsidiaria !== "baixa") {
        setTemSubsidiaria(resultado.tem_subsidiaria);
      }
      if (!detDefined.has("tem_desvio") && typeof resultado.tem_desvio === "boolean" && cc.tem_desvio !== "baixa") {
        setTemDesvio(resultado.tem_desvio);
      }
      if (!detDefined.has("tem_adic_noturno") && typeof resultado.tem_adic_noturno === "boolean" && cc.tem_adic_noturno !== "baixa") {
        setTemAdicNoturno(resultado.tem_adic_noturno);
      }

    } catch (e) {
      const isTimeout = e.message === "timeout";
      setErroIA(
        isTimeout
          ? "Classificação automática indisponível — selecione manualmente."
          : "Não foi possível analisar automaticamente: " + (e.message || String(e))
      );
      base44.entities.ErrorLog.create({
        context: "ConfirmarTeses — analisarComIA",
        error_type: "api",
        message: e.message || String(e),
        occurred_at: new Date().toISOString(),
      }).catch(() => {});
    } finally {
      setAnalisando(false);
    }
  };

  const podeGerar = !!tipoRescisao;

  const handleConfirmar = () => {
    if (!podeGerar) return;
    // Mapa TIPO_RESCISAO → flag t_*
    const TIPO_TO_FLAG = {
      dispensa_sem_justa_causa: "t_dispensa",
      rescisao_indireta:        "t_indireta",
      pedido_demissao:          "t_coacao",
      reversao_justa_causa:     "t_reversao",
    };
    const flagAtiva = TIPO_TO_FLAG[tipoRescisao] || null;
    const flagsRescisao = {
      t_dispensa: flagAtiva === "t_dispensa",
      t_coacao:   flagAtiva === "t_coacao",
      t_indireta: flagAtiva === "t_indireta",
      t_reversao: flagAtiva === "t_reversao",
      t_demissao: flagAtiva === "t_coacao",
    };
    onConfirmar({
      ...dadosIniciais,
      ...flagsRescisao,
      TIPO_RESCISAO:    tipoRescisao,
      tem_subsidiaria:  temSubsidiaria,
      tem_desvio:       temDesvio,
      tem_adic_noturno: temAdicNoturno,
    });
  };

  const justas = sugestao?.justificativas || {};
  const confiancaBaixa = sugestao && Object.values(confiancaCampos).some(c => c === "baixa");

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
                ? "IA pré-selecionou os campos com evidência — campos incertos ficaram em branco para revisão manual."
                : "IA pré-selecionou todas as opções — revise e confirme."}
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
            sugestao && confiancaCampos.tipo_rescisao === "baixa" ? (
              <div className="flex items-center gap-2 p-2 mt-1.5 rounded-lg bg-amber-50/60 border border-amber-200 text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>IA não conseguiu determinar com segurança — selecione manualmente</span>
              </div>
            ) : (
              <p className="text-xs text-destructive mt-1.5">Selecione o tipo de rescisão para habilitar a geração.</p>
            )
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
                    {sugestao && typeof item.iaVal === "boolean" && confiancaCampos[item.key] !== "baixa" && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        {item.iaVal ? "IA: incluir" : "IA: não incluir"}
                      </span>
                    )}
                    {sugestao && confiancaCampos[item.key] === "baixa" && (
                      <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" /> incerto
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