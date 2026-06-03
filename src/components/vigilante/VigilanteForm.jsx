import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ChevronDown, ChevronRight, Save, Download, Loader2, FileDown, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { gerarDocxVigilante } from "@/lib/gerarDocxVigilante.js";
import ExtrairDadosIA from "./ExtrairDadosIA.jsx";

const EMPTY_CASO = {
  titulo: "",
  COMARCA_UF: "", REGIAO_TRT: "",
  RECL_NOME: "", RECL_NACIONALIDADE: "brasileiro", RECL_ESTADOCIVIL: "", RECL_RG: "",
  RECL_PIS: "", RECL_SERIE: "", RECL_CTPS: "", RECL_CPF: "", RECL_NASC: "",
  RECL_FILIACAO: "", RECL_ENDERECO: "", RECL_CEP: "",
  RECL1_NOME: "", RECL1_CNPJ: "", RECL1_LOGRADOURO: "", RECL1_ENDCOMPL: "",
  RECL2_NOME: "", RECL2_CNPJ: "", RECL2_LOGRADOURO: "", RECL2_ENDCOMPL: "",
  RECL3_NOME: "", RECL3_CNPJ: "", RECL3_LOGRADOURO: "", RECL3_ENDCOMPL: "",
  FORO_COMPETENCIA: "", LOCAL_PRESTACAO: "", LOCAL_PRESTACAO_COMPL: "",
  DATA_ADMISSAO: "", FUNCAO: "Vigilante", DATA_RESCISAO: "", SALARIO: "",
  JORNADA_HORARIO: "", JORNADA_EXTRAPOLA: "", JORNADA_FREQ_EXTRA: "", INTERVALO_GOZADO: "",
  LOCAL_DATA_ASSINATURA: "", CCT_VIGENCIA: "2024/2025", ADIC_CONV: "60%",
  VAL_FT: "", VAL_CONDUCAO: "", VAL_ALIMENTACAO: "", VALOR_CAUSA: "",
  valores_pedidos: {},
};

const P_LABELS = {
  P01:"Aviso Prévio Indenizado",P02:"FGTS + 40% s/ Aviso",P03:"Saldo de Salário",
  P04:"13º Proporcional",P05:"Férias Proporcionais + 1/3",P06:"Férias Vencidas + 1/3",
  P07:"Rescisão Indireta (multa)",P08:"FGTS s/ contrato",P09:"DSR s/ HE semana",
  P10:"DSR s/ HE mês",P11:"Reflexos Saldo",P12:"Reflexos Férias + 1/3",
  P13:"Reflexos 13º",P14:"Reflexos Aviso",P15:"HE além 8ª diária",
  P16:"HE além 8ª diária (descaracterização)",P17:"HE reflexo DSR",
  P18:"HE Reflexo Férias",P19:"HE Reflexo 13º",P20:"HE Reflexo Aviso",
  P21:"HE Reflexo FGTS",P22:"HE Reflexo FGTS+40%",P23:"HE Total",
  P24:"Intervalo Intrajornada (art. 71 CLT)",P25:"Intervalo Reflexo DSR",
  P26:"Intervalo Reflexo Férias",P27:"Intervalo Reflexo 13º",P28:"Intervalo Reflexo Aviso",
  P29:"Intervalo Reflexo FGTS+40%",P30:"Intervalo Total",
  P31:"Min. antec./sucess. jornada",P32:"Min. Reflexo DSR",P33:"Min. Reflexo Férias",
  P34:"Min. Reflexo 13º",P35:"Min. Reflexo Aviso",P36:"Min. Reflexo FGTS+40%",
  P37:"Min. Reflexo FGTS",P38:"Min. Total",
  P39:"Folgas Trabalhadas (FT) — diferenças",P40:"FT Reflexo DSR",
  P41:"FT Reflexo Férias",P42:"FT Reflexo 13º",P43:"FT Reflexo Aviso",
  P44:"FT Reflexo FGTS",P45:"FT Reflexo FGTS+40%",P46:"FT Total",
  P47:"Adicional Noturno + Hora Reduzida",P48:"AN Reflexo DSR",
  P49:"AN Reflexo Férias",P50:"AN Reflexo 13º",P51:"AN Reflexo Aviso",
  P52:"AN Reflexo FGTS+40%",P53:"AN Total",
  P54:"Periculosidade nas HE",P55:"Perc. Reflexo DSR",P56:"Perc. Reflexo Férias",
  P57:"Perc. Reflexo 13º",P58:"Perc. Reflexo Aviso",P59:"Perc. Reflexo FGTS",
  P60:"Perc. Reflexo FGTS+40%",P61:"Periculosidade Total",
  P62:"Dano Moral",
  P63:"Desvio de Função — multa convencional",P64:"Desvio Reflexo DSR",
  P65:"Desvio Reflexo Férias",P66:"Desvio Reflexo 13º",P67:"Desvio Reflexo Aviso",
  P68:"Desvio Reflexo FGTS",P69:"Desvio Reflexo FGTS+40%",P70:"Desvio Total",
  P71:"VT — Folgas não pagas",P72:"VT Reflexo DSR",P73:"VT Reflexo Férias",
  P74:"VT Reflexo 13º",P75:"VT Reflexo Aviso",P76:"VT Reflexo FGTS",
  P77:"VT Reflexo FGTS+40%",P78:"VT Total",
  P79:"VA — Folgas não pagas",P80:"VA Reflexo DSR",P81:"VA Reflexo Férias",
  P82:"VA Reflexo 13º",P83:"VA Reflexo Aviso",P84:"VA Reflexo FGTS+40%",
  P85:"Multas Convencionais (cláusula 71ª)",P86:"10 min descanso/hora",
  P87:"TOTAL GERAL DA CAUSA",
};

function Section({ title, open, onToggle, children }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
      >
        <span className="font-semibold text-sm text-foreground">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>}
    </div>
  );
}

function Field({ label, name, value, onChange, full }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <input
        type="text"
        value={value || ""}
        onChange={e => onChange(name, e.target.value)}
        className="w-full bg-input border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

export default function VigilanteForm({ onGerarComDados, templateDocxUrl }) {
  const [casos, setCasos] = useState([]);
  const [casoId, setCasoId] = useState("");
  const [dados, setDados] = useState(EMPTY_CASO);
  const [sections, setSections] = useState({ reclamante: true, reclamadas: false, foro: false, contrato: false, cct: false, pedidos: false });
  const [salvando, setSalvando] = useState(false);
  const [gerandoDocx, setGerandoDocx] = useState(false);
  const [mostrarExtrair, setMostrarExtrair] = useState(false);

  useEffect(() => {
    base44.entities.CasoVigilante.list().then(list => {
      setCasos(list || []);
    }).catch(() => {});
  }, []);

  const handleCarregar = async (id) => {
    setCasoId(id);
    if (!id) { setDados(EMPTY_CASO); return; }
    const found = casos.find(c => c.id === id);
    if (found) {
      setDados({ ...EMPTY_CASO, ...found, valores_pedidos: found.valores_pedidos || {} });
    }
  };

  const handleChange = (key, val) => {
    setDados(prev => ({ ...prev, [key]: val }));
  };

  const handlePedido = (p, val) => {
    setDados(prev => ({ ...prev, valores_pedidos: { ...prev.valores_pedidos, [p]: val } }));
  };

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const payload = { ...dados, status: "preenchido" };
      let saved;
      if (casoId) {
        saved = await base44.entities.CasoVigilante.update(casoId, payload);
        toast.success("Caso atualizado!");
      } else {
        saved = await base44.entities.CasoVigilante.create({ ...payload, titulo: dados.titulo || `Caso ${new Date().toLocaleDateString("pt-BR")}` });
        setCasoId(saved.id);
        setCasos(prev => [...prev, saved]);
        toast.success("Caso salvo!");
      }
    } catch (e) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const handleBaixarJson = () => {
    const { titulo, status, petition_id, id, created_date, updated_date, created_by_id, ...campos } = dados;
    const { valores_pedidos, ...camposSemPedidos } = campos;
    const json = { campos: camposSemPedidos, valores_pedidos: valores_pedidos || {} };
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${dados.RECL_NOME || "caso"}_dados.json`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("dados.json baixado!");
  };

  const toggleSection = (s) => setSections(prev => ({ ...prev, [s]: !prev[s] }));

  const handleGerarDocxIdêntico = async () => {
    if (!templateDocxUrl) return;

    // Validação: campos essenciais
    const ESSENCIAIS = [
      { key: "RECL_NOME",   label: "Nome do reclamante" },
      { key: "RECL1_NOME",  label: "1ª Reclamada (razão social)" },
      { key: "COMARCA_UF",  label: "Comarca/UF" },
      { key: "DATA_ADMISSAO", label: "Data de admissão" },
      { key: "SALARIO",     label: "Salário" },
      { key: "VALOR_CAUSA", label: "Valor da causa" },
    ];
    const faltando = ESSENCIAIS.filter(e => !dados[e.key] || dados[e.key].trim() === "");
    if (faltando.length > 0) {
      toast.error(
        `Campos obrigatórios em branco — preencha antes de gerar:\n• ${faltando.map(f => f.label).join("\n• ")}`,
        { duration: 6000 }
      );
      return;
    }

    setGerandoDocx(true);
    try {
      const { blob, tokensFaltando } = await gerarDocxVigilante(templateDocxUrl, dados);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${dados.RECL_NOME || "vigilante"}_peticao.docx`;
      a.click();
      URL.revokeObjectURL(url);

      if (tokensFaltando.length > 0) {
        toast.warning(`DOCX gerado! Tokens não preenchidos: ${tokensFaltando.join(", ")}`);
      } else {
        toast.success("DOCX gerado com sucesso — idêntico ao modelo oficial!");
      }
    } catch (e) {
      toast.error("Erro ao gerar DOCX: " + e.message);
    } finally {
      setGerandoDocx(false);
    }
  };

  const handleConfirmarExtracao = (dadosExtraidos) => {
    setDados(prev => ({ ...prev, ...dadosExtraidos }));
    toast.success("Campos preenchidos! Revise e salve o caso.");
    // Abre seções relevantes para o usuário revisar
    setSections(prev => ({ ...prev, reclamante: true, reclamadas: true, contrato: true }));
  };

  const pedidosKeys = Array.from({ length: 87 }, (_, i) => `P${String(i + 1).padStart(2, "0")}`);

  return (
    <div className="space-y-4">
      {mostrarExtrair && (
        <ExtrairDadosIA
          onConfirmar={handleConfirmarExtracao}
          onFechar={() => setMostrarExtrair(false)}
        />
      )}

      {/* Seletor de caso existente */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Carregar caso salvo</label>
          <select
            value={casoId}
            onChange={e => handleCarregar(e.target.value)}
            className="w-full bg-input border border-border text-foreground rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">— Novo caso —</option>
            {casos.map(c => <option key={c.id} value={c.id}>{c.titulo || c.RECL_NOME || c.id}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={handleBaixarJson}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-border bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-semibold transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> dados.json
        </button>
      </div>

      {/* Botão extrair com IA */}
      <button
        type="button"
        onClick={() => setMostrarExtrair(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 text-primary text-sm font-semibold transition-colors"
      >
        <Wand2 className="w-4 h-4" /> Extrair dados dos documentos com IA
      </button>

      {/* Título do caso */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Título / Identificação do caso</label>
        <input
          type="text"
          value={dados.titulo || ""}
          onChange={e => handleChange("titulo", e.target.value)}
          placeholder="Ex: Fernando x Belfort"
          className="w-full bg-input border border-border text-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Accordion sections */}
      <Section title="👤 Reclamante" open={sections.reclamante} onToggle={() => toggleSection("reclamante")}>
        <Field label="Nome completo" name="RECL_NOME" value={dados.RECL_NOME} onChange={handleChange} full />
        <Field label="Nacionalidade" name="RECL_NACIONALIDADE" value={dados.RECL_NACIONALIDADE} onChange={handleChange} />
        <Field label="Estado civil" name="RECL_ESTADOCIVIL" value={dados.RECL_ESTADOCIVIL} onChange={handleChange} />
        <Field label="RG" name="RECL_RG" value={dados.RECL_RG} onChange={handleChange} />
        <Field label="PIS" name="RECL_PIS" value={dados.RECL_PIS} onChange={handleChange} />
        <Field label="CTPS" name="RECL_CTPS" value={dados.RECL_CTPS} onChange={handleChange} />
        <Field label="Série CTPS" name="RECL_SERIE" value={dados.RECL_SERIE} onChange={handleChange} />
        <Field label="CPF" name="RECL_CPF" value={dados.RECL_CPF} onChange={handleChange} />
        <Field label="Data de nascimento" name="RECL_NASC" value={dados.RECL_NASC} onChange={handleChange} />
        <Field label="Filiação" name="RECL_FILIACAO" value={dados.RECL_FILIACAO} onChange={handleChange} full />
        <Field label="Endereço" name="RECL_ENDERECO" value={dados.RECL_ENDERECO} onChange={handleChange} full />
        <Field label="CEP" name="RECL_CEP" value={dados.RECL_CEP} onChange={handleChange} />
      </Section>

      <Section title="🏢 Reclamadas" open={sections.reclamadas} onToggle={() => toggleSection("reclamadas")}>
        <div className="sm:col-span-2 text-xs font-bold text-muted-foreground uppercase tracking-wider pt-1">1ª Reclamada</div>
        <Field label="Razão social" name="RECL1_NOME" value={dados.RECL1_NOME} onChange={handleChange} full />
        <Field label="CNPJ" name="RECL1_CNPJ" value={dados.RECL1_CNPJ} onChange={handleChange} />
        <Field label="Logradouro" name="RECL1_LOGRADOURO" value={dados.RECL1_LOGRADOURO} onChange={handleChange} />
        <Field label="Complemento" name="RECL1_ENDCOMPL" value={dados.RECL1_ENDCOMPL} onChange={handleChange} full />
        <div className="sm:col-span-2 text-xs font-bold text-muted-foreground uppercase tracking-wider pt-2">2ª Reclamada (tomadora)</div>
        <Field label="Razão social" name="RECL2_NOME" value={dados.RECL2_NOME} onChange={handleChange} full />
        <Field label="CNPJ" name="RECL2_CNPJ" value={dados.RECL2_CNPJ} onChange={handleChange} />
        <Field label="Logradouro" name="RECL2_LOGRADOURO" value={dados.RECL2_LOGRADOURO} onChange={handleChange} />
        <Field label="Complemento" name="RECL2_ENDCOMPL" value={dados.RECL2_ENDCOMPL} onChange={handleChange} full />
        <div className="sm:col-span-2 text-xs font-bold text-muted-foreground uppercase tracking-wider pt-2">3ª Reclamada (tomadora)</div>
        <Field label="Razão social" name="RECL3_NOME" value={dados.RECL3_NOME} onChange={handleChange} full />
        <Field label="CNPJ" name="RECL3_CNPJ" value={dados.RECL3_CNPJ} onChange={handleChange} />
        <Field label="Logradouro" name="RECL3_LOGRADOURO" value={dados.RECL3_LOGRADOURO} onChange={handleChange} />
        <Field label="Complemento" name="RECL3_ENDCOMPL" value={dados.RECL3_ENDCOMPL} onChange={handleChange} full />
      </Section>

      <Section title="📍 Foro e Local" open={sections.foro} onToggle={() => toggleSection("foro")}>
        <Field label="Comarca/UF" name="COMARCA_UF" value={dados.COMARCA_UF} onChange={handleChange} />
        <Field label="Região TRT" name="REGIAO_TRT" value={dados.REGIAO_TRT} onChange={handleChange} />
        <Field label="Foro de competência" name="FORO_COMPETENCIA" value={dados.FORO_COMPETENCIA} onChange={handleChange} />
        <Field label="Local de prestação" name="LOCAL_PRESTACAO" value={dados.LOCAL_PRESTACAO} onChange={handleChange} />
        <Field label="Complemento local" name="LOCAL_PRESTACAO_COMPL" value={dados.LOCAL_PRESTACAO_COMPL} onChange={handleChange} full />
      </Section>

      <Section title="📋 Contrato e Jornada" open={sections.contrato} onToggle={() => toggleSection("contrato")}>
        <Field label="Data de admissão (por extenso)" name="DATA_ADMISSAO" value={dados.DATA_ADMISSAO} onChange={handleChange} />
        <Field label="Função" name="FUNCAO" value={dados.FUNCAO} onChange={handleChange} />
        <Field label="Data de rescisão (por extenso)" name="DATA_RESCISAO" value={dados.DATA_RESCISAO} onChange={handleChange} />
        <Field label="Salário (ex: R$ 2.148,22)" name="SALARIO" value={dados.SALARIO} onChange={handleChange} />
        <Field label="Jornada (ex: 18:30 às 07:30)" name="JORNADA_HORARIO" value={dados.JORNADA_HORARIO} onChange={handleChange} />
        <Field label="Extrapolação (ex: 09:00)" name="JORNADA_EXTRAPOLA" value={dados.JORNADA_EXTRAPOLA} onChange={handleChange} />
        <Field label="Frequência extras (ex: 4 a 6 vezes/mês)" name="JORNADA_FREQ_EXTRA" value={dados.JORNADA_FREQ_EXTRA} onChange={handleChange} />
        <Field label="Intervalo gozado (ex: 10 a 15 min)" name="INTERVALO_GOZADO" value={dados.INTERVALO_GOZADO} onChange={handleChange} />
        <Field label="Local e data de assinatura" name="LOCAL_DATA_ASSINATURA" value={dados.LOCAL_DATA_ASSINATURA} onChange={handleChange} full />
      </Section>

      <Section title="⚖️ CCT e Valores Unitários" open={sections.cct} onToggle={() => toggleSection("cct")}>
        <Field label="Vigência CCT (ex: 2024/2025)" name="CCT_VIGENCIA" value={dados.CCT_VIGENCIA} onChange={handleChange} />
        <Field label="Adicional convencional HE (ex: 60%)" name="ADIC_CONV" value={dados.ADIC_CONV} onChange={handleChange} />
        <Field label="Valor FT/folga trabalhada" name="VAL_FT" value={dados.VAL_FT} onChange={handleChange} />
        <Field label="Valor condução por dia" name="VAL_CONDUCAO" value={dados.VAL_CONDUCAO} onChange={handleChange} />
        <Field label="Valor alimentação por dia" name="VAL_ALIMENTACAO" value={dados.VAL_ALIMENTACAO} onChange={handleChange} />
        <Field label="Valor da causa" name="VALOR_CAUSA" value={dados.VALOR_CAUSA} onChange={handleChange} />
      </Section>

      <Section title="💰 Valores dos Pedidos (P01 a P87)" open={sections.pedidos} onToggle={() => toggleSection("pedidos")}>
        {pedidosKeys.map(p => (
          <div key={p}>
            <label className="block text-xs text-muted-foreground mb-1">
              <span className="font-bold text-primary">{p}</span> — {P_LABELS[p] || p}
            </label>
            <input
              type="text"
              value={dados.valores_pedidos?.[p] || ""}
              onChange={e => handlePedido(p, e.target.value)}
              placeholder="R$ 0,00"
              className="w-full bg-input border border-border text-foreground rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        ))}
      </Section>

      {/* Ações */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleSalvar}
          disabled={salvando}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {salvando ? "Salvando..." : "Salvar caso"}
        </button>

        {templateDocxUrl && (
          <button
            type="button"
            onClick={handleGerarDocxIdêntico}
            disabled={gerandoDocx}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
          >
            {gerandoDocx ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {gerandoDocx ? "Gerando DOCX..." : "Gerar DOCX Idêntico ao Modelo"}
          </button>
        )}

        <button
          type="button"
          onClick={() => onGerarComDados(dados)}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold transition-colors"
        >
          Gerar Petição com IA →
        </button>
      </div>
    </div>
  );
}