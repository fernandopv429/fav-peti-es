/**
 * AnalisarDocumentosPanel
 *
 * Exibido na etapa "Análise de Documentos" do wizard de nova petição.
 * Aciona a função analisarDocumentos no backend, faz polling e exibe o laudo.
 * O advogado DEVE revisar o laudo antes de avançar para o modelo/geração.
 */
import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, FileSearch, Loader2, RefreshCw, FileText, Eye } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABELS = {
  pendente: "Aguardando análise",
  em_analise: "Analisando documentos...",
  concluida: "Análise concluída",
  sem_documentos: "Sem documentos para analisar",
};

export default function AnalisarDocumentosPanel({ petitionId, documentUrls = [], documentNames = [], onRevisado }) {
  const [status, setStatus] = useState("pendente");
  const [laudo, setLaudo] = useState("");
  const [analisando, setAnalisando] = useState(false);
  const [revisado, setRevisado] = useState(false);
  const pollingRef = useRef(null);

  // Ao montar, carrega estado existente da petição (caso já tenha análise)
  useEffect(() => {
    if (!petitionId) return;
    base44.entities.Petition.filter({ id: petitionId }).then((r) => {
      const p = r[0];
      if (!p) return;
      if (p.analise_status) setStatus(p.analise_status);
      if (p.analise_documentos) setLaudo(p.analise_documentos);
      if (p.analise_status === "concluida" || p.analise_status === "sem_documentos") {
        setRevisado(false); // força revisão mesmo se já havia laudo anterior
      }
    }).catch(() => {});
  }, [petitionId]);

  // Limpa polling ao desmontar
  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  const iniciarAnalise = async () => {
    if (!petitionId) {
      toast.error("Salve o rascunho antes de analisar os documentos.");
      return;
    }
    if (documentUrls.length === 0) {
      setStatus("sem_documentos");
      toast.info("Nenhum documento anexado. Avance sem análise.");
      onRevisado?.();
      return;
    }

    setAnalisando(true);
    setStatus("em_analise");
    setLaudo("");
    setRevisado(false);

    try {
      await base44.functions.invoke("analisarDocumentos", { petitionId });
    } catch (err) {
      toast.error("Erro ao iniciar análise: " + err.message);
      setAnalisando(false);
      setStatus("pendente");
      return;
    }

    // Polling a cada 5s até concluir
    pollingRef.current = setInterval(async () => {
      try {
        const r = await base44.entities.Petition.filter({ id: petitionId });
        const p = r[0];
        if (!p) return;
        if (p.analise_status === "concluida" || p.analise_status === "sem_documentos") {
          clearInterval(pollingRef.current);
          setAnalisando(false);
          setStatus(p.analise_status);
          setLaudo(p.analise_documentos || "");
          toast.success("Análise concluída! Revise o laudo antes de continuar.");
        }
      } catch (_) {}
    }, 5000);

    // Timeout de 8 min
    setTimeout(() => {
      if (!analisando) return;
      clearInterval(pollingRef.current);
      setAnalisando(false);
      setStatus("pendente");
      toast.error("Tempo de análise esgotado. Tente novamente.");
    }, 8 * 60 * 1000);
  };

  const handleMarcarRevisado = () => {
    setRevisado(true);
    onRevisado?.();
    toast.success("Laudo revisado. Você pode avançar para o próximo passo.");
  };

  const semDocs = documentUrls.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <FileSearch className="w-5 h-5 text-primary" />
          Análise de Documentos do Caso
        </h3>
        <p className="text-sm text-muted-foreground">
          A IA analisa os documentos anexados (cartões de ponto, holerites, CTPS, TRCT, etc.) e gera um laudo de
          achados para subsidiar a petição inicial. <strong>Revisão obrigatória pelo advogado antes de avançar.</strong>
        </p>
      </div>

      {/* Documentos listados */}
      {documentUrls.length > 0 ? (
        <div className="p-4 rounded-xl border bg-muted/20 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {documentUrls.length} documento(s) para análise
          </p>
          {documentNames.map((name, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{name}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 border border-border text-sm">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <span className="text-muted-foreground">
            Nenhum documento anexado. Você pode avançar sem análise, mas a qualidade da petição será menor.
          </span>
        </div>
      )}

      {/* Botão de análise */}
      {(status === "pendente" || status === "em_analise") && (
        <Button
          onClick={iniciarAnalise}
          disabled={analisando}
          className="gap-2 w-full sm:w-auto"
        >
          {analisando ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Analisando documentos...</>
          ) : (
            <><FileSearch className="w-4 h-4" /> {semDocs ? "Avançar sem análise" : "Analisar Documentos com IA"}</>
          )}
        </Button>
      )}

      {/* Loading */}
      {analisando && (
        <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-sm text-center space-y-2">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
          <p className="font-medium">Analisando documentos...</p>
          <p className="text-muted-foreground text-xs">
            A IA está lendo cartões de ponto, holerites e demais documentos. Aguarde.
          </p>
        </div>
      )}

      {/* Laudo */}
      {laudo && status === "concluida" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              Laudo de Achados — revisão obrigatória
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={iniciarAnalise}
              disabled={analisando}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reanalisar
            </Button>
          </div>

          <div className="max-h-[420px] overflow-y-auto rounded-xl border bg-card p-5 text-sm leading-relaxed whitespace-pre-wrap font-sans">
            {laudo}
          </div>

          {/* Aviso gate humano */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/30 text-sm">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <p>
              <strong>Apoio à análise — não substitui validação humana.</strong> Verifique todos os achados antes
              de assinar e protocolar a petição.
            </p>
          </div>

          {/* Botão de confirmação de revisão */}
          {!revisado ? (
            <Button
              onClick={handleMarcarRevisado}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
            >
              <CheckCircle2 className="w-4 h-4" /> Confirmar Revisão do Laudo — Avançar
            </Button>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Laudo revisado. Você pode avançar para o próximo passo.
            </div>
          )}
        </div>
      )}

      {/* Sem documentos confirmado */}
      {status === "sem_documentos" && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/40 border border-border text-sm text-muted-foreground">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Sem documentos — etapa de análise ignorada. Avance para o próximo passo.
        </div>
      )}
    </div>
  );
}