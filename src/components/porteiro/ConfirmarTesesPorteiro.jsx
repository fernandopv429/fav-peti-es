/**
 * ConfirmarTesesPorteiro — Modal de confirmação de teses para modelos
 * SINDEEPRES e SIEMACO (porteiro/controlador de acesso).
 *
 * Análogo ao ConfirmarTeses do Vigilante, mas com teses específicas para portaria.
 * Recebe `templateId` para adaptar avisos e teses ao modelo correto.
 */
import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, X, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";

const TIPOS_RESCISAO = [
  { value: "dispensa_sem_justa_causa", label: "Dispensa sem justa causa" },
  { value: "rescisao_indireta",        label: "Rescisão indireta" },
  { value: "reversao_justa_causa",     label: "Reversão de justa causa" },
  { value: "pedido_demissao",          label: "Pedido de demissão" },
];

// Teses opcionais variam por modelo
function getTeses(templateId) {
  const isSiemaco = templateId === "6a23a23e1899bb8695af99c4";

  const base = [
    {
      key: "tem_subsidiaria",
      label: "Responsabilidade subsidiária",
      sub: "Súmula 331 TST — tomador de serviços responde subsidiariamente",
    },
    {
      key: "tem_adic_noturno",
      label: "Adicional noturno / hora reduzida",
      sub: "Art. 73 CLT — horas entre 22h e 05h",
    },
    {
      key: "tem_desvio",
      label: "Acúmulo / desvio de função",
      sub: isSiemaco
        ? "Cláusula 12ª CCT SIEMACO 2026/2027 — +20% do salário contratual"
        : "Desvio de função — CLT (CCT principal SINDEEPRES ainda não cadastrada)",
    },
  ];

  if (isSiemaco) {
    base.push({
      key: "tem_rescisao_indireta_dobro",
      label: "Verbas rescisórias em dobro (rescisão indireta)",
      sub: "Cláusula 25ª CCT SIEMACO 2026/2027 — descumprimento = pagamento em dobro",
    });
    base.push({
      key: "tem_multa_atraso",
      label: "Multa por atraso salarial",
      sub: "Cláusula 5ª CCT SIEMACO 2026/2027 — 5% do SM por dia de atraso",
    });
  }

  return base;
}

// Aviso específico de cada modelo para o advogado
function getAviso(templateId) {
  const isSiemaco = templateId === "6a23a23e1899bb8695af99c4";
  const isSindeepres = templateId === "6a23a89c901fce5e061a9099";

  if (isSiemaco) {
    return {
      tipo: "revisao",
      texto: "⚠️ SIEMACO em revisão humana: a numeração das cláusulas do .docx ainda não foi auditada contra a CCT 2026/2027. Verifique os números de cláusula antes de protocolar.",
    };
  }
  if (isSindeepres) {
    return {
      tipo: "pendencia",
      texto: "⚠️ SINDEEPRES: a CCT principal 2025/2026 (cláusulas de HE, noturno, jornada) ainda não foi cadastrada. Percentuais de HE/noturno serão citados apenas com base na CLT — não inventar valores convencionais.",
    };
  }
  return null;
}

export default function ConfirmarTesesPorteiro({ dadosIniciais, documentUrls = [], templateId, templateName, onConfirmar, onCancelar }) {
  const [tipoRescisao, setTipoRescisao] = useState(dadosIniciais?.TIPO_RESCISAO || "");
  const [flags, setFlags] = useState(() => {
    const teses = getTeses(templateId);
    const init = {};
    teses.forEach(t => {
      if (t.key === "tem_subsidiaria") init[t.key] = dadosIniciais?.tem_subsidiaria ?? false;
      else init[t.key] = dadosIniciais?.[t.key] ?? false;
    });
    return init;
  });

  const [analisando, setAnalisando] = useState(false);
  const [sugestao, setSugestao] = useState(null);
  const [erroIA, setErroIA] = useState("");

  const teses = getTeses(templateId);
  const aviso = getAviso(templateId);

  useEffect(() => {
    if (!dadosIniciais?.TIPO_RESCISAO) {
      analisarComIA();
    }
  }, []);

  const analisarComIA = async () => {
    setAnalisando(true);
    setErroIA("");
    setSugestao(null);

    const contexto = [
      dadosIniciais?.RECL_NOME       && `Reclamante: ${dadosIniciais.RECL_NOME}`,
      dadosIniciais?.RECL1_NOME      && `1ª Reclamada: ${dadosIniciais.RECL1_NOME}`,
      dadosIniciais?.RECL2_NOME      && `2ª Reclamada (tomadora): ${dadosIniciais.RECL2_NOME}`,
      dadosIniciais?.DATA_ADMISSAO   && `Admissão: ${dadosIniciais.DATA_ADMISSAO}`,
      dadosIniciais?.DATA_RESCISAO   && `Rescisão: ${dadosIniciais.DATA_RESCISAO}`,
      dadosIniciais?.FUNCAO          && `Função: ${dadosIniciais.FUNCAO}`,
      dadosIniciais?.SALARIO         && `Salário: ${dadosIniciais.SALARIO}`,
      dadosIniciais?.JORNADA_HORARIO && `Jornada: ${dadosIniciais.JORNADA_HORARIO}`,
    ].filter(Boolean).join("\n");

    const isSiemaco = templateId === "6a23a23e1899bb8695af99c4";
    const nomeCct = isSiemaco ? "CCT SIEMACO-SP 2026/2027" : "CCT SINDEEPRES (citar apenas CLT para HE/noturno)";

    const tesesDesc = teses.map(t => `- ${t.key} (true/false): ${t.label} — ${t.sub}`).join("\n");

    const prompt = `Você é um advogado trabalhista especializado em casos de porteiro/controlador de acesso.
Modelo de petição: ${templateName} (${nomeCct}).

Analise o caso e determine:

1. TIPO_RESCISAO:
   - "dispensa_sem_justa_causa": empregador dispensou sem motivo grave
   - "rescisao_indireta": empregador descumpriu obrigações graves
   - "reversao_justa_causa": empregador alegou justa causa indevida
   - "pedido_demissao": empregado pediu demissão voluntariamente

2. Teses aplicáveis (true/false):
${tesesDesc}

DADOS DO CASO:
${contexto}

REGRAS:
- Baseie-se APENAS nos dados fornecidos. Não invente fatos.
- Para SINDEEPRES: NÃO sugira percentuais de HE/noturno da CCT (CCT principal não cadastrada). Use apenas CLT.
- Para SIEMACO: as cláusulas estão em revisão humana — indique baixa confiança para teses convencionais.

Responda SOMENTE com JSON válido:
{
  "tipo_rescisao": "...",
  ${teses.map(t => `"${t.key}": true`).join(",\n  ")},
  "confianca": "alta|baixa",
  "justificativas": {
    "tipo_rescisao": "...",
    ${teses.map(t => `"${t.key}": "..."`).join(",\n    ")}
  }
}`;

    try {
      const fileUrls = (documentUrls || []).filter(Boolean);
      const resultado = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: "claude_opus_4_8",
        file_urls: fileUrls.length > 0 ? fileUrls : undefined,
        response_json_schema: {
          type: "object",
          additionalProperties: true,
        },
      });

      setSugestao(resultado);
      if (resultado.tipo_rescisao) setTipoRescisao(resultado.tipo_rescisao);
      const novosFlags = { ...flags };
      teses.forEach(t => {
        if (typeof resultado[t.key] === "boolean") novosFlags[t.key] = resultado[t.key];
      });
      setFlags(novosFlags);
    } catch (e) {
      setErroIA("Não foi possível analisar automaticamente: " + (e.message || String(e)));
    } finally {
      setAnalisando(false);
    }
  };

  const handleConfirmar = () => {
    if (!tipoRescisao) return;
    onConfirmar({ ...dadosIniciais, TIPO_RESCISAO: tipoRescisao, ...flags });
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
              <h2 className="font-bold text-foreground text-base">Confirmar teses — {templateName}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Revise a sugestão da IA e confirme antes de gerar</p>
            </div>
          </div>
          <button onClick={onCancelar} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Aviso do modelo */}
        {aviso && (
          <div className={`flex items-start gap-2 p-3 rounded-xl border text-xs ${
            aviso.tipo === "revisao"
              ? "bg-amber-50/60 border-amber-300 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400"
              : "bg-blue-50/60 border-blue-300 text-blue-800 dark:bg-blue-950/20 dark:text-blue-400"
          }`}>
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{aviso.texto}</p>
          </div>
        )}

        {/* Status IA */}
        {analisando && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
            <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
            <p className="text-sm text-primary font-medium">Analisando caso com IA...</p>
          </div>
        )}
        {!analisando && sugestao && (
          <div className={`flex items-center gap-3 p-3 rounded-xl border ${
            confiancaBaixa ? "bg-amber-50/50 border-amber-200 dark:bg-amber-950/20" : "bg-green-50/50 border-green-200 dark:bg-green-950/20"
          }`}>
            <Sparkles className={`w-4 h-4 shrink-0 ${confiancaBaixa ? "text-amber-500" : "text-green-600"}`} />
            <p className={`text-xs font-medium flex-1 ${confiancaBaixa ? "text-amber-700 dark:text-amber-400" : "text-green-700 dark:text-green-400"}`}>
              {confiancaBaixa ? "IA analisou com baixa confiança — revise com atenção." : "IA classificou o caso — revise e confirme."}
            </p>
            <button type="button" onClick={analisarComIA} className="p-1 rounded-lg hover:bg-black/10 text-muted-foreground" title="Re-analisar">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {!analisando && erroIA && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50/50 border border-red-200 dark:bg-red-950/20">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 dark:text-red-400 flex-1">{erroIA}</p>
            <button type="button" onClick={analisarComIA} className="p-1 rounded-lg hover:bg-red-100 text-red-500 shrink-0">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tipo de rescisão */}
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
                    name="tipo_rescisao_porteiro"
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
            {teses.map(item => {
              const val = flags[item.key] || false;
              const iaVal = sugestao?.[item.key];
              return (
                <label
                  key={item.key}
                  className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                    val ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={e => setFlags(prev => ({ ...prev, [item.key]: e.target.checked }))}
                    className="accent-primary w-4 h-4 mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      {sugestao && typeof iaVal === "boolean" && (
                        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          {iaVal ? "IA: incluir" : "IA: não incluir"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{item.sub}</p>
                    {justas[item.key] && (
                      <p className="text-xs text-muted-foreground/80 mt-0.5 leading-relaxed italic">{justas[item.key]}</p>
                    )}
                  </div>
                </label>
              );
            })}
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
            disabled={!tipoRescisao || analisando}
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