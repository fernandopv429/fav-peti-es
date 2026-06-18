/**
 * ConfirmarTesesPorteiro — Modal de confirmação de teses para modelos
 * SINDEEPRES e SIEMACO (porteiro/controlador de acesso).
 *
 * Inclui TODAS as flags booleanas exigidas pelo modelo unificado:
 *  - Rescisão mutuamente exclusiva: t_dispensa, t_coacao, t_indireta, t_reversao
 *  - Jornada mutuamente exclusiva: jornada_12x36, jornada_5x2
 *  - Flags opcionais: tem_2a_reclamada, ente_publico, comp_portaria,
 *    tem_descaracterizacao, tem_adic_noturno, tem_acumulo, tem_insalubridade,
 *    tem_periculosidade, tem_assiduidade, tem_doenca
 *  - Flag computada: tem_pericia = tem_insalubridade OR tem_periculosidade
 */
import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, X, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { derivarFlags } from "@/lib/derivarFlags.js";

// ── Mapeamento TIPO_RESCISAO → flags booleanas ───────────────────────────
const RESCISAO_OPCOES = [
  {
    value: "t_dispensa",
    label: "Dispensa sem justa causa",
    sub: "Empregador dispensou sem motivo grave",
  },
  {
    value: "t_coacao",
    label: "Nulidade do pedido de demissão por coação",
    sub: "Pedido de demissão obtido mediante coação/pressão",
  },
  {
    value: "t_indireta",
    label: "Rescisão indireta",
    sub: "Empregador descumpriu obrigações graves (art. 483 CLT)",
  },
  {
    value: "t_reversao",
    label: "Reversão da justa causa",
    sub: "Empregador alegou justa causa sem amparo legal",
  },
];

const RESCISAO_FLAGS = ["t_dispensa", "t_coacao", "t_indireta", "t_reversao"];
const JORNADA_FLAGS  = ["jornada_12x36", "jornada_5x2"];

const FLAGS_OPCIONAIS = [
  { key: "tem_2a_reclamada",      label: "Possui 2ª reclamada (tomadora)",        sub: "Súmula 331 TST — responsabilidade subsidiária do tomador" },
  { key: "ente_publico",          label: "Tomadora é ente público",                sub: "Só ativo se há 2ª reclamada — Súmula 331 IV TST", dep: "tem_2a_reclamada" },
  { key: "comp_portaria",         label: "Competência por Portaria do TRT-2",      sub: "Quando verdadeiro usa portaria; quando falso usa art. 651 CLT" },
  { key: "tem_descaracterizacao", label: "Descaracterização da escala 12x36",      sub: "Escala não cumpre os requisitos para ser válida" },
  { key: "tem_adic_noturno",      label: "Adicional noturno / hora reduzida",      sub: "Art. 73 CLT — trabalho entre 22h e 05h" },
  { key: "tem_acumulo",           label: "Acúmulo / desvio de função",             sub: "Exercício de função superior sem correspondente remuneração" },
  { key: "tem_insalubridade",     label: "Insalubridade",                          sub: "Exposto a agentes nocivos à saúde — laudo pericial (computa tem_pericia)" },
  { key: "tem_periculosidade",    label: "Periculosidade",                         sub: "Atividades de risco — laudo pericial (computa tem_pericia)" },
  { key: "tem_assiduidade",       label: "Prêmio assiduidade / frequência",        sub: "Benefício previsto em CCT ou regulamento da empresa" },
  { key: "tem_doenca",            label: "Doença ocupacional / acidente de trabalho", sub: "Nexo causal entre doença/lesão e condições de trabalho" },
];

// Flags com default inicial deriváveis dos dados iniciais — pré-seleção DETERMINÍSTICA
// Delega toda a lógica para derivarFlags (módulo centralizado)
function buildInitialFlags(dadosIniciais) {
  return derivarFlags(dadosIniciais || {}, "porteiro");
}

// Computa flags derivadas (pericia, dependências) — delega para derivarFlags
function computeFlags(flags) {
  return derivarFlags(flags, "porteiro");
}

// Aviso específico de cada modelo
function getAviso(templateId) {
  if (templateId === "6a23a23e1899bb8695af99c4") {
    return { tipo: "revisao", texto: "⚠️ SIEMACO em revisão humana: a numeração das cláusulas do .docx ainda não foi auditada contra a CCT 2026/2027. Verifique os números de cláusula antes de protocolar." };
  }
  if (templateId === "6a23a89c901fce5e061a9099") {
    return { tipo: "pendencia", texto: "⚠️ SINDEEPRES: a CCT principal 2025/2026 ainda não foi cadastrada. Percentuais de HE/noturno serão citados apenas com base na CLT." };
  }
  return null;
}

export default function ConfirmarTesesPorteiro({
  dadosIniciais, documentUrls = [], templateId, templateName, onConfirmar, onCancelar,
}) {
  const [flags, setFlags] = useState(() => buildInitialFlags(dadosIniciais));
  const [analisando, setAnalisando] = useState(false);
  const [sugestao, setSugestao] = useState(null);
  const [erroIA, setErroIA] = useState("");

  const aviso = getAviso(templateId);

  // Seleciona qual flag de rescisão está ativa
  const rescisaoAtiva = RESCISAO_FLAGS.find(f => flags[f]) || "";
  // Seleciona qual jornada está ativa
  const jornadaAtiva = flags.jornada_12x36 ? "jornada_12x36" : "jornada_5x2";

  const setRescisao = (valor) => {
    setFlags(prev => {
      const f = { ...prev };
      RESCISAO_FLAGS.forEach(k => { f[k] = k === valor; });
      return f;
    });
  };

  const setJornada = (valor) => {
    setFlags(prev => ({
      ...prev,
      jornada_12x36: valor === "jornada_12x36",
      jornada_5x2:   valor === "jornada_5x2",
    }));
  };

  const toggleFlag = (key, val) => {
    setFlags(prev => {
      const f = { ...prev, [key]: val };
      if (key === "tem_2a_reclamada" && !val) f.ente_publico = false;
      return f;
    });
  };

  // Rastreia quais campos foram preenchidos deterministicamente (não devem ser sobrescritos pela IA)
  const [flagsDeterministicas] = useState(() => {
    const d = dadosIniciais || {};
    const det = new Set();
    // Rescisão determinística se qualquer fonte definiu o tipo
    if (RESCISAO_FLAGS.some(f => d[f]) || d.tipo_dispensa || d.TIPO_RESCISAO) {
      RESCISAO_FLAGS.forEach(f => det.add(f));
    }
    // Jornada determinística se definida explicitamente ou detectada
    if (d.jornada_12x36 !== undefined || d.jornada_5x2 !== undefined || /12[x×]36/i.test(d.JORNADA_HORARIO || "")) {
      det.add("jornada_12x36"); det.add("jornada_5x2");
    }
    // Flags dos campos estruturados da entrevista
    if (d.acumulo_funcao !== undefined || d.tem_acumulo !== undefined) det.add("tem_acumulo");
    if (d.tem_insalubridade !== undefined)  det.add("tem_insalubridade");
    if (d.tem_periculosidade !== undefined) det.add("tem_periculosidade");
    if (d.tem_adic_noturno !== undefined)   det.add("tem_adic_noturno");
    if (d.RECL2_NOME)                       det.add("tem_2a_reclamada");
    if (d.RECL3_NOME)                       det.add("tem_3a_reclamada");
    return det;
  });

  // Análise automática ao abrir se rescisão não tiver sido preenchida deterministicamente
  useEffect(() => {
    const d = dadosIniciais || {};
    const temRescisaoDet = RESCISAO_FLAGS.some(f => d[f]) || d.tipo_dispensa || d.TIPO_RESCISAO;
    if (!temRescisaoDet) analisarComIA();
  }, []);

  const analisarComIA = async () => {
    setAnalisando(true);
    setErroIA("");
    setSugestao(null);

    const d = dadosIniciais || {};
    const isSiemaco = templateId === "6a23a23e1899bb8695af99c4";
    const nomeCct = isSiemaco ? "CCT SIEMACO-SP 2026/2027" : "CCT SINDEEPRES (citar apenas CLT)";

    // Dados imutáveis das partes — NUNCA podem ser alterados pela IA
    const partesImutaveis = [
      d.RECL_NOME       && `Reclamante: ${d.RECL_NOME}`,
      d.RECL1_NOME      && `1ª Reclamada: ${d.RECL1_NOME} ${d.RECL1_CNPJ ? `(CNPJ: ${d.RECL1_CNPJ})` : ""}`,
      d.RECL2_NOME      && `2ª Reclamada (tomadora): ${d.RECL2_NOME} ${d.RECL2_CNPJ ? `(CNPJ: ${d.RECL2_CNPJ})` : ""}`,
      d.RECL3_NOME      && `3ª Reclamada (tomadora): ${d.RECL3_NOME} ${d.RECL3_CNPJ ? `(CNPJ: ${d.RECL3_CNPJ})` : ""}`,
      d.COMARCA_UF      && `Comarca/UF: ${d.COMARCA_UF}`,
      d.FORO_COMPETENCIA && `Foro de competência: ${d.FORO_COMPETENCIA}`,
      d.LOCAL_PRESTACAO && `Local de prestação de serviços: ${d.LOCAL_PRESTACAO}`,
    ].filter(Boolean).join("\n");

    const contextoContratual = [
      d.DATA_ADMISSAO   && `Admissão: ${d.DATA_ADMISSAO}`,
      d.DATA_RESCISAO   && `Rescisão: ${d.DATA_RESCISAO}`,
      d.FUNCAO          && `Função: ${d.FUNCAO}`,
      d.SALARIO         && `Salário: ${d.SALARIO}`,
      d.JORNADA_HORARIO && `Jornada: ${d.JORNADA_HORARIO}`,
    ].filter(Boolean).join("\n");

    const prompt = `Você é advogado trabalhista. Analise o caso de porteiro/controlador de acesso (${nomeCct}) e retorne JSON com a classificação de TODAS as flags abaixo.

⚠️ INSTRUÇÃO CRÍTICA — DADOS IMUTÁVEIS DAS PARTES:
As informações abaixo são OFICIAIS e VINCULANTES. NUNCA crie, substitua, complemente ou inferia outras partes/empregadores/endereços/CEPs/foros. Use EXCLUSIVAMENTE estes dados:

${partesImutaveis}

DADOS CONTRATUAIS:
${contextoContratual}

INSTRUÇÕES ABSOLUTAS:
1. Exatamente UMA flag de rescisão = true (t_dispensa, t_coacao, t_indireta, t_reversao).
   * t_dispensa = dispensa sem justa causa
   * t_coacao   = pedido de demissão por coação/pressão
   * t_indireta = rescisão indireta (art. 483 CLT)
   * t_reversao = reversão da justa causa
2. Exatamente UMA flag de jornada = true (jornada_12x36, jornada_5x2).
3. Para SINDEEPRES: não sugira teses de CCT não cadastrada. Use apenas CLT.
4. PROIBIDO INVENTAR PARTES: Não crie, substitua ou adicione reclamadas, endereços, CEPs, foros ou empregadores que não estejam listados acima. Se houver outros nomes em documentos anexos (ex.: CTPS com múltiplos empregadores), IGNORE — use APENAS as 1ª/2ª/3ª reclamadas listadas.
5. PROIBIDO INFERIR ENDEREÇOS: Não extraia CEPs/endereços de boletos, contratos ou outros documentos. Use APENAS o foro/comarca listado.
6. Baseie-se SOMENTE nos dados fornecidos acima. Não invente fatos.

Retorne SOMENTE JSON válido (sem markdown):
{
  "t_dispensa": false,
  "t_coacao": false,
  "t_indireta": false,
  "t_reversao": false,
  "jornada_12x36": false,
  "jornada_5x2": true,
  "tem_2a_reclamada": false,
  "ente_publico": false,
  "comp_portaria": false,
  "tem_descaracterizacao": false,
  "tem_adic_noturno": false,
  "tem_acumulo": false,
  "tem_insalubridade": false,
  "tem_periculosidade": false,
  "tem_assiduidade": false,
  "tem_doenca": false,
  "confianca": "alta",
  "justificativas": {
    "rescisao": "...",
    "jornada": "...",
    "outras": "..."
  }
}`;

    try {
      const fileUrls = (documentUrls || []).filter(Boolean);

      // Timeout de 20s — se a IA não responder, mantém pré-seleções determinísticas
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 20000)
      );
      const iaPromise = base44.integrations.Core.InvokeLLM({
        prompt,
        model: "claude_sonnet_4_6",
        file_urls: fileUrls.length > 0 ? fileUrls : undefined,
        response_json_schema: { type: "object", additionalProperties: true },
      });

      const resultado = await Promise.race([iaPromise, timeoutPromise]);

      setSugestao(resultado);

      setFlags(prev => {
        const f = { ...prev };
        // Rescisão — só aplica se NÃO foi preenchida deterministicamente
        if (!flagsDeterministicas.has("t_dispensa")) {
          const rescFlags = RESCISAO_FLAGS.filter(k => resultado[k] === true);
          if (rescFlags.length === 1) {
            RESCISAO_FLAGS.forEach(k => { f[k] = k === rescFlags[0]; });
          }
        }
        // Jornada — só aplica se NÃO foi preenchida deterministicamente
        if (!flagsDeterministicas.has("jornada_12x36")) {
          if (typeof resultado.jornada_12x36 === "boolean" || typeof resultado.jornada_5x2 === "boolean") {
            const is12x36 = resultado.jornada_12x36 === true;
            f.jornada_12x36 = is12x36;
            f.jornada_5x2   = !is12x36;
          }
        }
        // Opcionais — só preenche os que não vieram de campo estruturado
        FLAGS_OPCIONAIS.forEach(({ key }) => {
          if (!flagsDeterministicas.has(key) && typeof resultado[key] === "boolean") {
            f[key] = resultado[key];
          }
        });
        return f;
      });
    } catch (e) {
      const isTimeout = e.message === "timeout";
      setErroIA(
        isTimeout
          ? "Classificação automática indisponível — selecione manualmente."
          : "Não foi possível analisar automaticamente: " + (e.message || String(e))
      );
      // Loga no ErrorLog para diagnóstico
      base44.entities.ErrorLog.create({
        context: "ConfirmarTesesPorteiro — analisarComIA",
        error_type: "api",
        message: e.message || String(e),
        occurred_at: new Date().toISOString(),
      }).catch(() => {});
    } finally {
      setAnalisando(false);
    }
  };

  const handleConfirmar = () => {
    if (!rescisaoAtiva) return;
    const flagsFinal = computeFlags(flags);
    // Monta TIPO_RESCISAO legado para compatibilidade com backend
    const mapaRev = { t_dispensa: "dispensa_sem_justa_causa", t_coacao: "pedido_demissao", t_indireta: "rescisao_indireta", t_reversao: "reversao_justa_causa" };
    onConfirmar({ ...dadosIniciais, ...flagsFinal, TIPO_RESCISAO: mapaRev[rescisaoAtiva] || rescisaoAtiva });
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
              {justas.rescisao && <span className="block mt-0.5 font-normal opacity-80">{justas.rescisao}</span>}
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

        {/* ── Tipo de rescisão (mutuamente exclusivo) ────────────────────── */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Tipo de rescisão <span className="text-destructive">*</span>
          </label>
          <div className="space-y-2">
            {RESCISAO_OPCOES.map(op => {
              const isIA = sugestao?.[op.value] === true;
              const isSelected = rescisaoAtiva === op.value;
              return (
                <label
                  key={op.value}
                  className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                    isSelected ? "border-primary bg-primary/8 text-foreground" : "border-border hover:border-primary/40 text-foreground"
                  }`}
                >
                  <input type="radio" name="rescisao_porteiro" value={op.value} checked={isSelected}
                    onChange={() => setRescisao(op.value)} className="accent-primary mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{op.label}</span>
                      {isIA && (
                        <span className="text-xs bg-primary/15 text-primary font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" /> IA sugeriu
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{op.sub}</p>
                  </div>
                </label>
              );
            })}
          </div>
          {!rescisaoAtiva && !analisando && (
            <p className="text-xs text-destructive mt-1.5">Selecione o tipo de rescisão para habilitar a geração.</p>
          )}
        </div>

        {/* ── Jornada (mutuamente exclusivo) ─────────────────────────────── */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Escala de jornada</label>
          <div className="flex gap-2">
            {[
              { value: "jornada_5x2", label: "5×2 (jornada padrão 8h/dia)" },
              { value: "jornada_12x36", label: "12×36 (12h trabalho / 36h folga)" },
            ].map(op => (
              <label key={op.value} className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors text-sm ${
                jornadaAtiva === op.value ? "border-primary bg-primary/8 font-semibold" : "border-border hover:border-primary/40"
              }`}>
                <input type="radio" name="jornada_porteiro" checked={jornadaAtiva === op.value}
                  onChange={() => setJornada(op.value)} className="accent-primary" />
                {op.label}
                {sugestao?.[op.value] === true && (
                  <Sparkles className="w-3 h-3 text-primary ml-auto" title="IA sugeriu" />
                )}
              </label>
            ))}
          </div>
          {justas.jornada && <p className="text-xs text-muted-foreground mt-1 italic">{justas.jornada}</p>}
        </div>

        {/* ── Flags opcionais ─────────────────────────────────────────────── */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Flags e teses opcionais</label>
          <div className="space-y-2">
            {FLAGS_OPCIONAIS.map(item => {
              const val = flags[item.key] || false;
              const iaVal = sugestao?.[item.key];
              // Desabilita ente_publico se não tem 2ª reclamada
              const disabled = item.dep && !flags[item.dep];
              // tem_pericia: não editável — computada
              if (item.key === "tem_pericia") return null;
              return (
                <label
                  key={item.key}
                  className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors ${
                    disabled ? "opacity-40 cursor-not-allowed border-border" :
                    val ? "border-primary/50 bg-primary/5 cursor-pointer" : "border-border hover:border-primary/30 cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={val}
                    disabled={disabled}
                    onChange={e => toggleFlag(item.key, e.target.checked)}
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
                  </div>
                </label>
              );
            })}
          </div>

          {/* Lembrete tem_pericia computada */}
          {(flags.tem_insalubridade || flags.tem_periculosidade) && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50/50 border border-blue-200 dark:bg-blue-950/20 text-xs text-blue-700 dark:text-blue-400">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span><strong>tem_pericia = true</strong> — computado automaticamente (insalubridade e/ou periculosidade marcadas)</span>
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onCancelar}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={handleConfirmar} disabled={!rescisaoAtiva || analisando}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground text-sm font-bold transition-colors">
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