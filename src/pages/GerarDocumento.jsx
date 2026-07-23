import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  Wand2, Copy, Loader2, AlertTriangle, CheckCircle2, Paperclip, X,
  FileText, Image, File, ExternalLink, Download
} from "lucide-react";
import { toast } from "sonner";
import ExportButtons from "../components/petition/ExportButtons";
import { LetterheadHeader, LetterheadFooter } from "../components/petition/PetitionLetterhead";
import PetitionRenderer from "@/components/petition/PetitionRenderer";
import VigilanteForm from "../components/vigilante/VigilanteForm";
import GenericoForm from "../components/generico/GenericoForm";
import PorteiroForm from "../components/porteiro/PorteiroForm";
import { nomeArquivoPeticao } from "@/lib/normalizarCampos.js";
import { validarDadosPeticao, validarTextoPeticao } from "@/lib/validarPeticao.js";
import PetitionCorrectionChat from "@/components/petition/PetitionCorrectionChat.jsx";

const AREAS_ORDER = [
  "Gestão & Prazos", "Atendimento & Clientes", "Pesquisa Jurídica", "Cível",
  "Recursos", "Trabalhista", "Família & Sucessões", "Criminal", "Tributário",
  "Empresarial & Contratos", "Imobiliário & Locação", "Previdenciário", "Execução & Cálculo",
];

const CASE_TYPE_MAP = {
  "Trabalhista": "trabalhista", "Cível": "civel", "Previdenciário": "previdenciario",
  "Criminal": "outro", "Tributário": "outro", "Empresarial & Contratos": "civel",
  "Família & Sucessões": "civel", "Imobiliário & Locação": "civel", "Execução & Cálculo": "trabalhista",
};

const AVISO = "Rascunho profissional — revisão final por advogado é obrigatória antes de protocolar.";

// Verifica se o template selecionado é o modelo Vigilante (dedicado)
function isModeloVigilante(template) {
  if (!template) return false;
  return template.name?.toLowerCase().includes("vigilante") && template.case_type === "trabalhista";
}

// IDs dos templates PORTEIRO/CONTROLADOR (SINDEEPRES + SIEMACO + Limpeza) — modo PorteiroForm
const TEMPLATES_MODO_PORTEIRO = new Set([
  "6a23a89c901fce5e061a9099", // SINDEEPRES
  "6a23a23e1899bb8695af99c4", // SIEMACO
  "6a3433edd50679b069e1986a", // Limpeza (CCT SIEMACO)
]);

// Verifica se o template usa o modo PorteiroForm
function isModoPorteiro(template) {
  if (!template) return false;
  if (isModeloVigilante(template)) return false;
  return !!template.modelo_docx_url && TEMPLATES_MODO_PORTEIRO.has(template.id);
}

// Mantido para compatibilidade mas não mais necessário para SINDEEPRES/SIEMACO
const TEMPLATES_MODO_GENERICO = new Set([]);
function isModoGenerico(template) {
  if (!template) return false;
  if (isModeloVigilante(template)) return false;
  if (isModoPorteiro(template)) return false;
  return !!template.modelo_docx_url && TEMPLATES_MODO_GENERICO.has(template.id);
}

// Monta o texto da petição substituindo tokens do modelo pelos dados do formulário
function montarPeticaoDeterministica(templateContent, dados) {
  if (!templateContent || !dados) return templateContent || "";

  const vp = dados.valores_pedidos || {};

  // Mapa de tokens para valores
  const tokens = {
    "[VARA DO TRABALHO COMPETENTE]": dados.COMARCA_UF || "[VARA DO TRABALHO COMPETENTE]",
    "[REGIÃO]": dados.REGIAO_TRT || "[REGIÃO]",
    "[NOME DO RECLAMANTE]": dados.RECL_NOME || "[NOME DO RECLAMANTE]",
    "[nacionalidade]": dados.RECL_NACIONALIDADE || "brasileiro",
    "[estado civil]": dados.RECL_ESTADOCIVIL || "[estado civil]",
    "[RG]": dados.RECL_RG || "[RG]",
    "[UF]": (dados.RECL_RG || "").split(" ").pop() || "[UF]",
    "[PIS]": dados.RECL_PIS || "[PIS]",
    "[CTPS]": dados.RECL_CTPS || "[CTPS]",
    "[CPF]": dados.RECL_CPF || "[CPF]",
    "[data nascimento]": dados.RECL_NASC || "[data nascimento]",
    "[filiação]": dados.RECL_FILIACAO || "[filiação]",
    "[endereço completo]": dados.RECL_ENDERECO || "[endereço completo]",
    "[RAZÃO SOCIAL]": dados.RECL1_NOME || "[RAZÃO SOCIAL]",
    "[CNPJ]": dados.RECL1_CNPJ || "[CNPJ]",
    "[endereço]": dados.RECL1_ENDCOMPL || dados.RECL1_LOGRADOURO || "[endereço]",
    "[local da prestação de serviços]": dados.FORO_COMPETENCIA || "[local da prestação de serviços]",
    "[endereço do posto]": dados.LOCAL_PRESTACAO_COMPL || dados.LOCAL_PRESTACAO || "[endereço do posto]",
    "[data admissão]": dados.DATA_ADMISSAO || "[data admissão]",
    "[função]": dados.FUNCAO || "Vigilante",
    "[data]": dados.DATA_RESCISAO || "[data]",
    "[salário]": dados.SALARIO || "[salário]",
    "[horário, ex.: das 18:30 às 07:30]": dados.JORNADA_HORARIO || "[horário]",
    "[hora]": dados.JORNADA_EXTRAPOLA || "[hora]",
    "[x] vezes/mês": dados.JORNADA_FREQ_EXTRA || "[x] vezes/mês",
    "[x] vezes por mês": dados.JORNADA_FREQ_EXTRA || "[x] vezes por mês",
    "10 a 15 min": dados.INTERVALO_GOZADO || "10 a 15 min",
    "[CCT vigência]": dados.CCT_VIGENCIA || "2024/2025",
    "2024/2025": dados.CCT_VIGENCIA || "2024/2025",
    "[adicional convencional]": dados.ADIC_CONV || "60%",
    "60%": dados.ADIC_CONV || "60%",
    "[valor]/dia": dados.VAL_FT || "[valor]/dia",
    "[valor da condução]": dados.VAL_CONDUCAO || "[valor da condução]",
    "[valor alimentação]": dados.VAL_ALIMENTACAO || "[valor alimentação]",
    "[VALOR DA CAUSA]": dados.VALOR_CAUSA || "[VALOR DA CAUSA]",
    "[local e data]": dados.LOCAL_DATA_ASSINATURA || "[local e data]",
  };

  let texto = templateContent;

  // Substitui tokens simples
  Object.entries(tokens).forEach(([token, valor]) => {
    texto = texto.split(token).join(valor);
  });

  // Substitui P01..P87 no rol de pedidos
  for (let i = 1; i <= 87; i++) {
    const key = `P${String(i).padStart(2, "0")}`;
    const val = vp[key];
    if (val) {
      // Substitui referências como "R$ [valor P01]" ou simplesmente marca o valor
      texto = texto.split(`[${key}]`).join(val);
    }
  }

  // Injeta bloco de Valor da Causa se presente
  if (dados.VALOR_CAUSA) {
    texto = texto.replace(/R\$\s*\[VALOR DA CAUSA\]/gi, dados.VALOR_CAUSA);
    texto = texto.replace(/\[VALOR DA CAUSA\]/gi, dados.VALOR_CAUSA);
  }

  return texto;
}

export default function GerarDocumento() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(search);
  const preArea = params.get("area") || "";
  const preEspId = params.get("especialista") || "";

  const [todos, setTodos] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [petitionConfig, setPetitionConfig] = useState(null);
  const [area, setArea] = useState(preArea);
  const [espId, setEspId] = useState(preEspId);
  const [templateId, setTemplateId] = useState("");
  const [contexto, setContexto] = useState("");
  const [resultado, setResultado] = useState("");
  const [gerando, setGerando] = useState(false);
  const [gerandoStep, setGerandoStep] = useState("");
  const [savedPetitionId, setSavedPetitionId] = useState(null);
  const [iaMode, setIaMode] = useState(false);
  const [chatAberto, setChatAberto] = useState(false);
  const [arquivos, setArquivos] = useState([]);
  const [uploadingIdx, setUploadingIdx] = useState(null);
  const fileInputRef = useRef(null);
  const [resetKey, setResetKey] = useState(0);

  // Limpa estado de trabalho/entrada após cada geração bem-sucedida
  // para que o próximo caso comece do zero (sem contaminar dados).
  const resetEstadoTrabalho = () => {
    setArquivos([]);
    setContexto("");
    setResetKey(k => k + 1);
  };

  useEffect(() => {
    Promise.all([
      base44.entities.Especialista.filter({ ativo: true }).catch(() => []),
      base44.entities.PetitionTemplate.filter({ is_active: true }).catch(() => []),
      base44.entities.PetitionConfig.filter({ ativo: true }).catch(() => []),
    ]).then(([especialistas, tmpl, configs]) => {
      const sorted = especialistas.sort((a, b) => Number(a.numero) - Number(b.numero));
      setTodos(sorted);
      if (preEspId && !preArea) {
        const found = sorted.find(e => e.id === preEspId);
        if (found) setArea(found.area);
      }
      setTemplates(tmpl);
      setPetitionConfig(configs[0] || null);
    });
  }, []);

  const espDaArea = todos.filter(e => !area || e.area === area);
  const espSelecionado = todos.find(e => e.id === espId);
  const templateSelecionado = templates.find(t => t.id === templateId) || null;
  const modoVigilante = isModeloVigilante(templateSelecionado);
  const modoPorteiro = isModoPorteiro(templateSelecionado);
  const modoGenerico = isModoGenerico(templateSelecionado);

  const handleAreaChange = (val) => { setArea(val); setEspId(""); };

  const handleAddArquivos = async (files) => {
    const lista = Array.from(files);
    for (let i = 0; i < lista.length; i++) {
      const file = lista[i];
      setUploadingIdx(arquivos.length + i);
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setArquivos(prev => [...prev, { name: file.name, url: file_url, type: file.type }]);
      } catch (e) {
        toast.error(`Erro ao enviar ${file.name}: ` + e.message);
      }
    }
    setUploadingIdx(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoverArquivo = (idx) => setArquivos(prev => prev.filter((_, i) => i !== idx));

  const getFileIcon = (type) => {
    if (type?.startsWith("image/")) return <Image className="w-4 h-4 text-blue-500" />;
    if (type?.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
    return <File className="w-4 h-4 text-muted-foreground" />;
  };

  const extractDocumentContents = async () => {
    const conteudosTexto = [], urlsVisuais = [], naoPudeLer = [];
    for (const arq of arquivos) {
      const lower = arq.url.toLowerCase().split("?")[0];
      const isVisual = arq.type?.startsWith("image/") || arq.type?.includes("pdf") ||
        lower.endsWith(".pdf") || lower.endsWith(".png") || lower.endsWith(".jpg") ||
        lower.endsWith(".jpeg") || lower.endsWith(".webp");
      if (isVisual) {
        urlsVisuais.push(arq.url);
      } else {
        try {
          const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
            file_url: arq.url,
            json_schema: { type: "object", properties: { conteudo: { type: "string" } } }
          });
          if (extracted?.status === "success" && extracted?.output?.conteudo) {
            conteudosTexto.push(`=== ${arq.name} ===\n${extracted.output.conteudo}`);
          } else {
            try {
              const resp = await fetch(arq.url);
              if (resp.ok) {
                const txt = (await resp.text()).slice(0, 12000).trim();
                txt ? conteudosTexto.push(`=== ${arq.name} ===\n${txt}`) : naoPudeLer.push(arq.name);
              } else naoPudeLer.push(arq.name);
            } catch (_) { naoPudeLer.push(arq.name); }
          }
        } catch (_) { naoPudeLer.push(arq.name); }
      }
    }
    return { conteudosTexto, urlsVisuais, naoPudeLer };
  };

  // ── GERAÇÃO MODO VIGILANTE (determinística + DOCX) ───────────────────────
  const handleGerarVigilante = async (dadosVigilante) => {
    setGerando(true);
    setResultado("");
    setSavedPetitionId(null);
    setGerandoStep("");
    setIaMode(false);
    let sucessoVigilante = false;

    try {
      const titulo = dadosVigilante.titulo || `${dadosVigilante.RECL_NOME || "Vigilante"} — ${new Date().toLocaleDateString("pt-BR")}`;

      // PASSO 1: DOCX byte-idêntico ao modelo (prioridade) ─────────────────
      const modeloDocxUrl = templateSelecionado?.modelo_docx_url;
      if (modeloDocxUrl) {
        setGerandoStep("Gerando DOCX a partir do modelo oficial...");
        try {
          const { gerarDocxVigilante } = await import("@/lib/gerarDocxVigilante.js");
          const { blob, tokensFaltando } = await gerarDocxVigilante(modeloDocxUrl, dadosVigilante);
          const nomeArquivo = nomeArquivoPeticao(dadosVigilante.RECL_NOME, dadosVigilante.RECL1_NOME);

          // Download imediato
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = nomeArquivo;
          a.click();
          URL.revokeObjectURL(url);

          // Persiste na entidade Petition (upload + criar/atualizar registro)
          setGerandoStep("Salvando em Minhas Petições...");
          try {
            const file = new File([blob], nomeArquivo, {
              type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            });
            const { file_url: docxUrl } = await base44.integrations.Core.UploadFile({ file });

            const tituloPet = dadosVigilante.titulo ||
              `${dadosVigilante.RECL_NOME || "Vigilante"} × ${dadosVigilante.RECL1_NOME || "Reclamada"} — ${new Date().toLocaleDateString("pt-BR")}`;

            const { valido: docxValido, pendencias: docxPendencias } = validarDadosPeticao(dadosVigilante);
            const petitionPayload = {
              title: tituloPet,
              case_type: "trabalhista",
              claimant_name: dadosVigilante.RECL_NOME || "—",
              defendant_name: dadosVigilante.RECL1_NOME || "—",
              defendant_cnpj: dadosVigilante.RECL1_CNPJ || "",
              status: docxValido ? "concluida" : "revisao_necessaria",
              document_urls: [docxUrl],
              document_names: [nomeArquivo],
              template_used: templateSelecionado?.id || "vigilante_unificado",
              ...(docxPendencias.length > 0 ? { additional_facts: "Pendências: " + docxPendencias.join("; ") } : {}),
            };

            // Evita duplicata: usa petition_id já vinculado ao CasoVigilante
            const existingPetitionId = dadosVigilante.petition_id || null;
            let petId = existingPetitionId;
            if (petId) {
              await base44.entities.Petition.update(petId, petitionPayload).catch(() => {});
            } else {
              const criada = await base44.entities.Petition.create(petitionPayload).catch(() => null);
              petId = criada?.id;
            }

            // Vincula petition_id no CasoVigilante se houver caso salvo
            if (petId && dadosVigilante.id) {
              base44.entities.CasoVigilante.update(dadosVigilante.id, { petition_id: petId, status: "gerado" }).catch(() => {});
            }

            setSavedPetitionId(petId);
            if (tokensFaltando.length > 0) {
              toast.warning(`DOCX gerado e salvo! Tokens em branco: ${tokensFaltando.slice(0, 8).join(", ")}${tokensFaltando.length > 8 ? "..." : ""}`);
            } else {
              toast.success("DOCX gerado e salvo em Minhas Petições!");
            }
          } catch (uploadErr) {
            toast.warning("DOCX baixado, mas falha ao salvar em Petições: " + uploadErr.message);
          }
          sucessoVigilante = true;
          return;
        } catch (docxErr) {
          const detalhe = docxErr?.properties?.errors?.map(er => er.message).join("; ") || docxErr.message || String(docxErr);
          base44.entities.ErrorLog.create({
            context: "Geração DOCX Vigilante",
            error_type: "template",
            message: detalhe,
          }).catch(() => {});
          toast.error("Erro no DOCX: " + detalhe + " — gerando versão texto com IA.", { duration: 7000 });
          // Cai para geração em texto abaixo
        }
      }

      // PASSO 2: Fallback — texto determinístico + IA ───────────────────────
      if (!templateSelecionado?.content) {
        toast.error("Modelo Vigilante sem conteúdo. Verifique em Modelos.");
        return;
      }

      // Cria registro Petition
      let petitionId = null;
      setGerandoStep("Criando registro...");
      const created = await base44.entities.Petition.create({
        title: titulo, case_type: "trabalhista",
        claimant_name: dadosVigilante.RECL_NOME || "—",
        defendant_name: dadosVigilante.RECL1_NOME || "—",
        status: "em_geracao", template_used: templateSelecionado.id,
        document_urls: arquivos.map(a => a.url),
        document_names: arquivos.map(a => a.name),
        salary: parseFloat((dadosVigilante.SALARIO || "0").replace(/[^\d,]/g, "").replace(",", ".")) || undefined,
      });
      petitionId = created.id;
      setSavedPetitionId(petitionId);

      // Substituição determinística de tokens
      setGerandoStep("Preenchendo modelo com dados do formulário...");
      let textoBase = montarPeticaoDeterministica(templateSelecionado.content, dadosVigilante);
      let textoFinal = textoBase;
      let statusFinal = "concluida";

      // IA completa narrativa fática
      try {
        setGerandoStep("IA completando narrativa fática...");
        let urlsVisuais = [];
        if (arquivos.length > 0) {
          const extracted = await extractDocumentContents();
          urlsVisuais = extracted.urlsVisuais;
        }
        const contextoBlock = contexto.trim() ? `\n\nCONTEXTO ADICIONAL DO CASO:\n${contexto}` : "";

        // Endereçamento determinístico (correção 2): Vara do Trabalho de COMARCA/UF — REGIÃO
        const enderecoVara = dadosVigilante.COMARCA_UF && dadosVigilante.REGIAO_TRT
          ? `VARA DO TRABALHO DE ${dadosVigilante.COMARCA_UF} — ${dadosVigilante.REGIAO_TRT}`
          : (dadosVigilante.COMARCA_UF ? `VARA DO TRABALHO DE ${dadosVigilante.COMARCA_UF}` : "[VARA DO TRABALHO COMPETENTE]");

        // Modalidade de dispensa (correção 2)
        const MODALIDADE_MAP = {
          sem_justa_causa: "dispensa sem justa causa",
          rescisao_indireta: "rescisão indireta (art. 483 CLT)",
          nulidade_pedido_demissao: "pedido de demissão eivado de coação — nulidade",
          reversao_justa_causa: "reversão da justa causa",
        };
        const modalidade = MODALIDADE_MAP[dadosVigilante.tipo_dispensa] || dadosVigilante.TIPO_RESCISAO || "";

        // Reclamadas confirmadas na entrevista (correção 3)
        let reclamadasBlock = `1ª Reclamada (empregadora): ${dadosVigilante.RECL1_NOME || "[A PREENCHER]"} — CNPJ: ${dadosVigilante.RECL1_CNPJ || "[A PREENCHER]"}`;
        if (dadosVigilante.RECL2_NOME) {
          reclamadasBlock += `\n2ª Reclamada (tomadora): ${dadosVigilante.RECL2_NOME} — CNPJ: ${dadosVigilante.RECL2_CNPJ || "[A PREENCHER]"}`;
        }
        if (dadosVigilante.RECL3_NOME) {
          reclamadasBlock += `\n3ª Reclamada (tomadora): ${dadosVigilante.RECL3_NOME} — CNPJ: ${dadosVigilante.RECL3_CNPJ || "[A PREENCHER]"}`;
        }

        // Dano moral (correção 2 + 4)
        let danoBlock = "";
        if (dadosVigilante.DANO_FATOS || dadosVigilante.DANO_SUPERVISOR || dadosVigilante.dano_sem_estrutura) {
          danoBlock = "\nDANO MORAL: ";
          if (dadosVigilante.DANO_SUPERVISOR) danoBlock += `Superior hierárquico: ${dadosVigilante.DANO_SUPERVISOR}. `;
          if (dadosVigilante.DANO_FATOS) danoBlock += `Fatos: ${dadosVigilante.DANO_FATOS}. `;
          if (dadosVigilante.dano_sem_estrutura) danoBlock += "Posto sem banheiro/bebedouro.";
          danoBlock += "\nINSTRUÇÃO: Inclua o tópico de dano moral com os subtópicos padronizados do modelo, citando o nome do supervisor e os fatos relatados.";
        }

        // Acúmulo/desvio (correção 2)
        const desvioBlock = dadosVigilante.acumulo_funcao
          ? "\nACÚMULO/DESVIO DE FUNÇÃO: Indicado na entrevista. INSTRUÇÃO: Inclua obrigatoriamente o tópico e o pedido de desvio/acúmulo de função."
          : "";

        const promptIA = `Você é um advogado trabalhista. Preencha os [colchetes] restantes e expanda a narrativa fática das seções descritivas. NÃO altere valores monetários (P01-P87, VALOR_CAUSA, SALARIO). Mantenha estrutura e títulos.
${contextoBlock}
ENDEREÇAMENTO: ${enderecoVara}
RECLAMADAS (confirmadas na entrevista — NÃO adicionar outras empresas além das listadas):
${reclamadasBlock}
${modalidade ? `MODALIDADE DE DISPENSA: ${modalidade}` : ""}
DADOS: Reclamante: ${dadosVigilante.RECL_NOME} | Admissão: ${dadosVigilante.DATA_ADMISSAO} | Rescisão: ${dadosVigilante.DATA_RESCISAO} | Salário: ${dadosVigilante.SALARIO} | Jornada: ${dadosVigilante.JORNADA_HORARIO} | Extrapolação: ${dadosVigilante.JORNADA_EXTRAPOLA || "não informada"} | Frequência extras: ${dadosVigilante.JORNADA_FREQ_EXTRA || "não informada"} | Intervalo: ${dadosVigilante.INTERVALO_GOZADO}${dadosVigilante.VAL_FT ? ` | Folgas trabalhadas: ${dadosVigilante.VAL_FT}` : ""}${danoBlock}${desvioBlock}

PETIÇÃO:
${textoBase}

Retorne a petição completa, sem comentários adicionais.`;
        textoFinal = await base44.integrations.Core.InvokeLLM({
          prompt: promptIA,
          model: "claude_sonnet_4_6",
          file_urls: urlsVisuais.length > 0 ? urlsVisuais : undefined,
        });
        if (/\[A PREENCHER|\[PENDÊNCIA/i.test(textoFinal)) statusFinal = "revisao_necessaria";
        // Validação automática (correção 5): tópicos obrigatórios e consistência
        const { valido: textoValido, pendencias: textoPendencias } = validarTextoPeticao(textoFinal, dadosVigilante);
        if (!textoValido) {
          statusFinal = "revisao_necessaria";
          dadosVigilante._pendenciasValidacao = textoPendencias;
        }
      } catch (_) {
        textoFinal = textoBase;
        statusFinal = "revisao_necessaria";
        toast.warning("IA indisponível — petição gerada com dados do formulário apenas.");
      }

      // Persiste
      setGerandoStep("Salvando...");
      try {
        const blob = new Blob([textoFinal], { type: "text/plain" });
        const fileObj = new File([blob], "peticao.txt", { type: "text/plain" });
        const { file_url: contentUrl } = await base44.integrations.Core.UploadFile({ file: fileObj });
        await base44.entities.Petition.update(petitionId, {
          generated_content: contentUrl, status: statusFinal,
          claimant_name: dadosVigilante.RECL_NOME || "—",
          defendant_name: dadosVigilante.RECL1_NOME || "—",
          ...(dadosVigilante._pendenciasValidacao ? { additional_facts: "Pendências de validação: " + dadosVigilante._pendenciasValidacao.join("; ") } : {}),
        });
        if (dadosVigilante.id) {
          base44.entities.CasoVigilante.update(dadosVigilante.id, { petition_id: petitionId, status: "gerado" }).catch(() => {});
        }
        base44.entities.PetitionTemplate.update(templateSelecionado.id, {
          use_count: (templateSelecionado.use_count || 0) + 1,
        }).catch(() => {});
      } catch (_) {
        try { await base44.entities.Petition.update(petitionId, { generated_content: textoFinal.slice(0, 50000), status: statusFinal }); } catch (_e) {}
      }

      setResultado(textoFinal);
      if (statusFinal === "revisao_necessaria") {
        toast.warning("Petição gerada com pendências — revise antes de protocolar.");
      } else {
        toast.success("Petição gerada e salva com sucesso!");
      }
      sucessoVigilante = true;

    } catch (fatalErr) {
      const msg = fatalErr?.message || String(fatalErr);
      toast.error("Erro inesperado na geração: " + msg);
      base44.entities.ErrorLog.create({
        context: "Geração DOCX Vigilante",
        error_type: "template",
        message: msg,
      }).catch(() => {});
    } finally {
      setGerando(false);
      setGerandoStep("");
      if (sucessoVigilante) resetEstadoTrabalho();
    }
  };

  // ── GERAÇÃO MODO GENÉRICO DETERMINÍSTICO (SINDEEPRES, SIEMACO, etc.) ────
  const handleGerarGenerico = async (dadosForm) => {
    if (!templateSelecionado?.modelo_docx_url) {
      toast.error("Template sem modelo DOCX configurado.");
      return;
    }
    setGerando(true);
    setGerandoStep("Salvando registro da petição...");
    setSavedPetitionId(null);
    setIaMode(false);

    const titulo = dadosForm.titulo ||
      `${templateSelecionado.name} — ${dadosForm.RECL_NOME || "Caso"} × ${dadosForm.RECL1_NOME || "Reclamada"} — ${new Date().toLocaleDateString("pt-BR")}`;

    let petitionId = null;
    try {
      const petition = await base44.entities.Petition.create({
        title: titulo,
        case_type: templateSelecionado.case_type || "trabalhista",
        claimant_name: dadosForm.RECL_NOME || "—",
        defendant_name: dadosForm.RECL1_NOME || "—",
        defendant_cnpj: dadosForm.RECL1_CNPJ || "",
        status: "em_geracao",
        template_used: templateSelecionado.id,
        document_urls: arquivos.map(a => a.url),
        document_names: arquivos.map(a => a.name),
        // Persiste dados estruturados como additional_facts (JSON) para rastreabilidade
        additional_facts: JSON.stringify(dadosForm),
        extra_defendants: dadosForm.RECL2_NOME
          ? [{ name: dadosForm.RECL2_NOME, cnpj: dadosForm.RECL2_CNPJ || "", address: dadosForm.RECL2_LOGRADOURO || "" }]
          : [],
      });
      petitionId = petition.id;
      setSavedPetitionId(petitionId);
    } catch (e) {
      toast.error("Erro ao criar registro: " + e.message);
      setGerando(false);
      return;
    }

    // Injeta os dados do formulário diretamente como additional_facts para que o
    // backend possa usar o buildBaseTokens + aiTokens do formulário.
    // Para evitar re-extração IA no backend, passamos os tokens diretamente.
    try {
      setGerandoStep("Disparando geração DOCX em segundo plano...");
      await base44.functions.invoke("generatePetitionDocx", {
        petitionId,
        templateId: templateSelecionado.id,
        modeloIA: petitionConfig?.modelo_ia || "claude_sonnet_4_6",
        formTokens: dadosForm,
        // casoVigilanteId: fonte primária de dados (carregado diretamente do banco)
        casoVigilanteId: dadosForm._casoVigilanteId || undefined,
      });
    } catch (err) {
      toast.error("Erro ao iniciar geração: " + err.message);
      setGerando(false);
      base44.entities.Petition.update(petitionId, { status: "rascunho" }).catch(() => {});
      return;
    }

    // Polling: aguarda status sair de "em_geracao"
    setGerandoStep("Aguardando geração DOCX...");
    const interval = setInterval(async () => {
      try {
        const results = await base44.entities.Petition.filter({ id: petitionId });
        const p = results[0];
        if (!p || p.status === "em_geracao") return;
        clearInterval(interval);
        setGerando(false);
        const msg = p.status === "revisao_necessaria"
          ? "DOCX gerado com pendências — revise antes de protocolar."
          : "DOCX gerado com sucesso!";
        p.status === "revisao_necessaria" ? toast.warning(msg) : toast.success(msg);
        resetEstadoTrabalho();
      } catch (_) {}
    }, 4000);

    // Timeout 12 min
    setTimeout(() => {
      clearInterval(interval);
      if (gerando) {
        setGerando(false);
        toast.error("Tempo de espera esgotado. Verifique em Minhas Petições.");
      }
    }, 12 * 60 * 1000);
  };

  // ── GERAÇÃO MODO LIVRE / COM TEMPLATE ────────────────────────────────────
  const handleGerar = async () => {
    if (!espSelecionado) { toast.error("Selecione um especialista."); return; }
    if (!contexto.trim()) { toast.error("Descreva o contexto do caso."); return; }

    setGerando(true);
    setResultado("");
    setSavedPetitionId(null);
    setIaMode(true);

    const titulo = `${espSelecionado.titulo || espSelecionado.name} — ${new Date().toLocaleDateString("pt-BR")}`;
    const caseType = CASE_TYPE_MAP[area] || "outro";

    let petitionId = null;
    try {
      setGerandoStep("Criando registro...");
      const created = await base44.entities.Petition.create({
        title: titulo, case_type: caseType, claimant_name: "—", defendant_name: "—",
        status: "em_geracao", additional_facts: contexto,
        template_used: templateSelecionado?.id || "",
        document_urls: arquivos.map(a => a.url),
        document_names: arquivos.map(a => a.name),
      });
      petitionId = created.id;
      setSavedPetitionId(petitionId);
    } catch (e) {
      toast.error("Erro ao criar registro: " + e.message);
      setGerando(false);
      return;
    }

    let conteudosTexto = [], urlsVisuais = [], naoPudeLer = [];
    if (arquivos.length > 0) {
      setGerandoStep(`Lendo ${arquivos.length} documento(s)...`);
      try {
        const extracted = await extractDocumentContents();
        conteudosTexto = extracted.conteudosTexto;
        urlsVisuais = extracted.urlsVisuais;
        naoPudeLer = extracted.naoPudeLer;
      } catch (_) {}
    }

    const nomeEsp = espSelecionado.titulo || espSelecionado.name;
    const baseSystemPrompt = espSelecionado.prompt_sistema ||
      `Você é ${nomeEsp}, especialista em ${espSelecionado.area}. Elabore o documento jurídico solicitado com precisão técnica.`;

    const docTextBlock = conteudosTexto.length > 0
      ? `\n\n${"═".repeat(60)}\nCONTEÚDO DOS DOCUMENTOS:\n${"═".repeat(60)}\n\n${conteudosTexto.join("\n\n")}` : "";
    const docVisualNote = urlsVisuais.length > 0
      ? `\n\nAnalise os ${urlsVisuais.length} arquivo(s) em anexo e use os dados concretos.` : "";
    const naoLidosNote = naoPudeLer.length > 0
      ? `\n\nDOCUMENTOS NÃO LIDOS: ${naoPudeLer.join(", ")}` : "";

    const docAnalysisInstructions = arquivos.length > 0
      ? `\n\nPROTOCOLO OBRIGATÓRIO: 1) Extraia todos os dados dos documentos. 2) Use exclusivamente dados reais, nunca hipotéticos.` : "";

    let systemPrompt, userPrompt;
    if (templateSelecionado?.content) {
      systemPrompt = `Você é um redator jurídico.${docAnalysisInstructions}`;
      userPrompt = `INSTRUÇÕES: Reproduza o modelo INTEGRALMENTE, substituindo [colchetes] pelos dados do caso.\n\nREGRAS:\n1. Copie o modelo linha por linha.\n2. Substitua cada [campo] pelo dado correspondente.\n3. NUNCA omita, resuma ou reordene seções.\n4. Se não houver dado: [A PREENCHER: nome do campo]\n5. Mantenha intactos: fundamentos legais, súmulas, artigos.\n\n${"═".repeat(60)}\nDADOS DO CASO:\n${"═".repeat(60)}\n${contexto}${docTextBlock}${docVisualNote}${naoLidosNote}\n\n${"═".repeat(60)}\nMODELO A REPRODUZIR:\n${"═".repeat(60)}\n\n${templateSelecionado.content}\n\n${"═".repeat(60)}\nReproduz o modelo acima do início ao fim, substituindo os [colchetes].`;
    } else {
      systemPrompt = baseSystemPrompt + docAnalysisInstructions;
      userPrompt = `Especialista: ${nomeEsp} | Área: ${espSelecionado.area}\n\nCONTEXTO DO CASO:\n${contexto}${docTextBlock}${docVisualNote}${naoLidosNote}\n\nElaore o documento jurídico completo.`;
    }

    let textoGerado = "", statusFinal = "concluida";
    try {
      setGerandoStep("IA elaborando o documento...");
      const model = espSelecionado.modelo_ia === "sonnet"
        ? "claude_sonnet_4_6" : (espSelecionado.modelo_ia || "claude_sonnet_4_6");
      textoGerado = await base44.integrations.Core.InvokeLLM({
        prompt: `${systemPrompt}\n\n---\n\n${userPrompt}`,
        model,
        file_urls: urlsVisuais.length > 0 ? urlsVisuais : undefined,
      });
      if (/\[A PREENCHER|\[PENDÊNCIA/i.test(textoGerado)) statusFinal = "revisao_necessaria";
    } catch (e) {
      statusFinal = "revisao_necessaria";
      textoGerado = `[ERRO NA GERAÇÃO: ${e.message}]\n\nContexto do caso:\n${contexto}`;
      toast.error("Erro ao gerar: " + e.message);
    }

    try {
      setGerandoStep("Salvando documento...");
      const blob = new Blob([textoGerado], { type: "text/plain" });
      const fileObj = new File([blob], "documento.txt", { type: "text/plain" });
      const { file_url: contentUrl } = await base44.integrations.Core.UploadFile({ file: fileObj });
      await base44.entities.Petition.update(petitionId, { generated_content: contentUrl, status: statusFinal, template_used: templateSelecionado?.id || "" });
      if (templateSelecionado?.id) {
        base44.entities.PetitionTemplate.update(templateSelecionado.id, { use_count: (templateSelecionado.use_count || 0) + 1 }).catch(() => {});
      }
    } catch (_) {
      try { await base44.entities.Petition.update(petitionId, { generated_content: textoGerado.slice(0, 50000), status: statusFinal }); } catch (_) {}
      toast.error("Aviso: problema ao salvar arquivo.");
    }

    setResultado(textoGerado);
    setGerando(false);
    setGerandoStep("");
    if (statusFinal === "revisao_necessaria") toast.warning("Documento gerado com pendências.");
    else toast.success("Documento gerado e salvo com sucesso!");
    resetEstadoTrabalho();
  };

  const handleCopiar = () => { navigator.clipboard.writeText(resultado); toast.success("Copiado!"); };

  const petitionForExport = savedPetitionId ? {
    id: savedPetitionId,
    title: `${espSelecionado?.titulo || "Documento"} — ${new Date().toLocaleDateString("pt-BR")}`,
    generated_content: resultado, claimant_name: "—", defendant_name: "—",
  } : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="px-6 lg:px-10 pt-8 pb-6 border-b border-border">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-foreground font-bold text-xl">Gerar Documento</h1>
        </div>
        <p className="text-muted-foreground text-sm ml-12">Selecione o especialista ideal para o seu caso e forneça o contexto</p>
      </div>

      <div className="px-6 lg:px-10 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl">
        {/* Left — Form */}
        <div className="space-y-5">
          {/* Step 1: Área */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">1. Área do Direito</label>
            <select value={area} onChange={e => handleAreaChange(e.target.value)}
              className="w-full bg-input border border-border text-foreground rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors">
              <option value="">Selecione a área...</option>
              {AREAS_ORDER.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Step 2: Especialista */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">2. Especialista</label>
            <select value={espId} onChange={e => setEspId(e.target.value)} disabled={!area}
              className="w-full bg-input border border-border text-foreground rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors disabled:opacity-40">
              <option value="">{area ? "Selecione o especialista..." : "Selecione a área primeiro"}</option>
              {espDaArea.map(e => <option key={e.id} value={e.id}>#{e.numero} — {e.titulo || e.name}</option>)}
            </select>
            {espSelecionado && (
              <div className="mt-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{espSelecionado.icone || "⚖️"}</span>
                  <p className="text-foreground font-semibold text-sm">{espSelecionado.titulo || espSelecionado.name}</p>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">{espSelecionado.descricao}</p>
              </div>
            )}
          </div>

          {/* Step 3: Modelo */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              3. Modelo a seguir <span className="normal-case font-normal text-muted-foreground/70">(opcional)</span>
            </label>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)}
              className="w-full bg-input border border-border text-foreground rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors">
              <option value="">Sem modelo — IA decide a estrutura</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.case_type})</option>)}
            </select>
            {templateSelecionado && (
              <div className="mt-2 flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
                <FileText className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{templateSelecionado.name}</p>
                  {modoVigilante && <p className="text-xs text-green-600 font-semibold mt-0.5">⚙️ Modo determinístico ativo — formulário Vigilante</p>}
                  {modoPorteiro && <p className="text-xs text-green-600 font-semibold mt-0.5">⚙️ Modo determinístico ativo — formulário Porteiro/Controlador</p>}
                  {modoGenerico && <p className="text-xs text-green-600 font-semibold mt-0.5">⚙️ Modo determinístico ativo — formulário estruturado</p>}
                </div>
                <span className="text-xs bg-primary/15 text-primary font-semibold px-2 py-0.5 rounded-full shrink-0">Obrigatório</span>
              </div>
            )}
          </div>

          {/* Step 4: Contexto do caso — sempre visível */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">4. Contexto do caso</label>
            <textarea value={contexto} onChange={e => setContexto(e.target.value)}
              placeholder="Descreva detalhadamente o caso, as partes envolvidas, os fatos relevantes..."
              className="w-full bg-input border border-border text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors min-h-[160px] resize-y leading-relaxed" />
            <p className="text-muted-foreground text-xs mt-1">{contexto.length} caracteres</p>
          </div>

          {/* Upload de documentos — compartilhado pelos 3 modos */}
          {(modoVigilante || modoGenerico || modoPorteiro) && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                5. Documentos para análise <span className="normal-case font-normal text-muted-foreground/70">(opcional — IA extrai dados)</span>
              </label>
              <div className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleAddArquivos(e.dataTransfer.files); }}>
                <Paperclip className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
                <p className="text-sm text-muted-foreground">Clique ou arraste arquivos aqui</p>
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt,.csv,.xlsx"
                  className="hidden" onChange={e => handleAddArquivos(e.target.files)} />
              </div>
              {uploadingIdx !== null && <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...</div>}
              {arquivos.length > 0 && (
                <div className="mt-2 space-y-1">
                  {arquivos.map((arq, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border">
                      {getFileIcon(arq.type)}
                      <span className="text-xs text-foreground flex-1 truncate">{arq.name}</span>
                      <button onClick={() => handleRemoverArquivo(i)} className="p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MODO VIGILANTE: Formulário dedicado */}
          {modoVigilante ? (
            <>
              <div className="rounded-xl border border-amber-300 bg-amber-50/50 p-3 text-xs text-amber-800 font-medium">
                ⚙️ <strong>Modo Vigilante ativo:</strong> Preencha o formulário abaixo. Os valores monetários e dados das partes serão inseridos deterministicamente — a IA só redige a narrativa fática.
              </div>
              <VigilanteForm key={resetKey} onGerarComDados={handleGerarVigilante} onCasoConcluido={resetEstadoTrabalho} templateDocxUrl={templateSelecionado?.modelo_docx_url || ""} documentUrls={arquivos.map(a => a.url)} />
            </>
          ) : modoPorteiro ? (
            <>
              <div className="rounded-xl border border-blue-300 bg-blue-50/50 p-3 text-xs text-blue-800 font-medium">
                ⚙️ <strong>Modo Porteiro/Controlador ativo ({templateSelecionado.name}):</strong> Formulário determinístico com tokens do .docx. A IA classifica teses antes de gerar. Revisão humana obrigatória.
              </div>
              <PorteiroForm
                key={resetKey}
                templateDocxUrl={templateSelecionado.modelo_docx_url}
                templateId={templateSelecionado.id}
                templateName={templateSelecionado.name}
                documentUrls={arquivos.map(a => a.url)}
                onGerarComDados={handleGerarGenerico}
                onCasoConcluido={resetEstadoTrabalho}
              />
            </>
          ) : modoGenerico ? (
            <>
              <div className="rounded-xl border border-green-300 bg-green-50/50 p-3 text-xs text-green-800 font-medium">
                ⚙️ <strong>Modo determinístico ativo ({templateSelecionado.name}):</strong> Os tokens são preenchidos a partir do formulário. A IA completa apenas campos narrativos. O DOCX final preserva cabeçalho, rodapé e formatação do modelo.
              </div>
              {gerando ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">{gerandoStep || "Gerando DOCX..."}</p>
                  {savedPetitionId && (
                    <button
                      onClick={() => window.open(`/peticoes/${savedPetitionId}`, "_blank")}
                      className="text-xs text-primary underline mt-1"
                    >
                      Ver petição em Minhas Petições →
                    </button>
                  )}
                </div>
              ) : (
                <GenericoForm
                  key={resetKey}
                  templateDocxUrl={templateSelecionado.modelo_docx_url}
                  templateId={templateSelecionado.id}
                  templateName={templateSelecionado.name}
                  documentUrls={arquivos.map(a => a.url)}
                  onGerar={handleGerarGenerico}
                />
              )}
            </>
          ) : (
            <>
              {/* MODO NORMAL */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  5. Documentos para análise <span className="normal-case font-normal text-muted-foreground/70">(opcional)</span>
                </label>
                <div className="border-2 border-dashed border-border rounded-xl p-5 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleAddArquivos(e.dataTransfer.files); }}>
                  <Paperclip className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Clique ou arraste arquivos aqui</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">PDF, imagens, Word — a IA lerá e extrairá o conteúdo integral</p>
                  <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt,.csv,.xlsx"
                    className="hidden" onChange={e => handleAddArquivos(e.target.files)} />
                </div>
                {uploadingIdx !== null && <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando arquivo...</div>}
                {arquivos.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {arquivos.map((arq, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
                        {getFileIcon(arq.type)}
                        <span className="text-sm text-foreground flex-1 truncate">{arq.name}</span>
                        <button onClick={() => handleRemoverArquivo(i)} className="p-1 rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                    <p className="text-xs text-primary font-medium">✓ {arquivos.length} documento(s) serão analisados</p>
                  </div>
                )}
              </div>

              <button onClick={handleGerar} disabled={gerando || !espSelecionado || !contexto.trim()}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground font-bold text-sm transition-colors">
                {gerando ? <><Loader2 className="w-4 h-4 animate-spin" /> {gerandoStep || "Processando..."}</> : <><Wand2 className="w-4 h-4" /> Gerar Documento com IA</>}
              </button>
            </>
          )}
        </div>

        {/* Right — Result */}
        <div>
          {gerando && (
            <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
              <p className="text-foreground font-semibold">Gerando com IA...</p>
              <p className="text-muted-foreground text-sm text-center max-w-xs">{gerandoStep || "Processando..."}</p>
            </div>
          )}

          {!gerando && !resultado && (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-20 border border-dashed border-border rounded-2xl">
              <Wand2 className="w-12 h-12 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm text-center">O documento gerado aparecerá aqui</p>
            </div>
          )}

          {resultado && !gerando && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-foreground font-semibold text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" /> Documento gerado e salvo
                </p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={handleCopiar} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium transition-colors">
                    <Copy className="w-3.5 h-3.5" /> Copiar
                  </button>
                  {savedPetitionId && (
                    <button onClick={() => navigate(`/peticoes/${savedPetitionId}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary text-xs font-medium transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" /> Ver em Petições
                    </button>
                  )}
                  {petitionForExport && <ExportButtons petition={petitionForExport} petitionConfig={petitionConfig} />}
                </div>
              </div>

              {iaMode && (
                <button
                  onClick={() => setChatAberto(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors shadow-sm"
                >
                  <Wand2 className="w-4 h-4" /> Corrigir com IA
                </button>
              )}

              <div className="bg-card border border-border rounded-2xl p-6 max-h-[600px] overflow-y-auto" id="gerar-doc-print-area">
                <LetterheadHeader config={petitionConfig} />
                <PetitionRenderer content={resultado} />
                <LetterheadFooter config={petitionConfig} />
              </div>

              {savedPetitionId && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-xs text-green-700">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Salvo em <strong>Minhas Petições</strong> — não se perderá ao recarregar.</span>
                </div>
              )}
              <div className="flex items-start gap-2.5 p-3 rounded-xl border text-xs" style={{ background: "hsl(var(--warning) / 0.1)", borderColor: "hsl(var(--warning) / 0.3)", color: "hsl(var(--foreground))" }}>
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "hsl(var(--warning))" }} />
                <p>{AVISO}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {iaMode && savedPetitionId && resultado && espSelecionado && (
        <PetitionCorrectionChat
          petition={{
            id: savedPetitionId,
            title: `${espSelecionado.titulo || espSelecionado.name} — ${new Date().toLocaleDateString("pt-BR")}`,
            case_type: CASE_TYPE_MAP[area] || "outro",
            generated_content: resultado,
            template_used: templateSelecionado?.id || "",
          }}
          learningTarget={{
            entityName: "Especialista",
            id: espSelecionado.id,
            prompt: espSelecionado.prompt_sistema,
          }}
          open={chatAberto}
          onOpenChange={setChatAberto}
          onFieldsUpdated={(fields) => {
            if (fields.generated_content) setResultado(fields.generated_content);
          }}
        />
      )}
    </div>
  );
}