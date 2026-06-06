import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";
import { FileText, Search, FilePlus, ArrowRight, Trash2, AlertTriangle, FileDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const STATUS_BADGE = {
  rascunho: "bg-muted text-muted-foreground",
  em_geracao: "bg-amber-100 text-amber-700",
  concluida: "bg-blue-100 text-blue-700",
  revisao_necessaria: "bg-red-100 text-red-700",
  pronto_para_protocolo: "bg-green-100 text-green-700",
};

const STATUS_LABELS = {
  rascunho: "Rascunho",
  em_geracao: "Em Geração",
  concluida: "Aguardando Revisão",
  revisao_necessaria: "Revisão Necessária",
  pronto_para_protocolo: "Pronto para Protocolo",
};

const CASE_LABELS = {
  trabalhista: "Trabalhista",
  civel: "Cível",
  previdenciario: "Previdenciário",
  consumidor: "Consumidor",
  outro: "Outro",
};

export default function PetitionsList() {
  const [petitions, setPetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    base44.entities.Petition.list("-created_date", 200).then((data) => {
      setPetitions(data);
      setLoading(false);
    });
  }, []);

  const handleDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Tem certeza que deseja excluir esta petição?")) return;
    await base44.entities.Petition.delete(id);
    setPetitions((prev) => prev.filter((p) => p.id !== id));
    toast.success("Petição excluída");
  };

  const filtered = petitions.filter((p) => {
    const matchSearch =
      p.title?.toLowerCase().includes(search.toLowerCase()) ||
      p.claimant_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.defendant_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-playfair font-bold">Minhas Petições</h1>
          <p className="text-muted-foreground mt-1">{petitions.length} petição(ões) encontrada(s)</p>
        </div>
        <Link
          to="/nova-peticao"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
        >
          <FilePlus className="w-4 h-4" />
          Nova Petição
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, reclamante ou reclamado..."
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="rascunho">Rascunho</SelectItem>
            <SelectItem value="em_geracao">Em Geração</SelectItem>
            <SelectItem value="concluida">Aguardando Revisão</SelectItem>
            <SelectItem value="revisao_necessaria">Revisão Necessária</SelectItem>
            <SelectItem value="pronto_para_protocolo">Pronto para Protocolo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold text-lg">Nenhuma petição encontrada</h3>
          <p className="text-muted-foreground mt-1">Crie sua primeira petição para começar</p>
          <Link to="/nova-peticao" className="inline-block mt-4 text-primary hover:underline text-sm">
            Criar petição
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const isRevisao = p.status === "revisao_necessaria";
            const isEmGeracao = p.status === "em_geracao";
            return (
              <Link key={p.id} to={`/peticoes/${p.id}`}>
                <Card className={`p-5 hover:shadow-md transition-all group cursor-pointer ${isRevisao ? "border-red-400 bg-red-50/40" : ""} ${isEmGeracao ? "border-amber-300 bg-amber-50/30" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isRevisao ? "bg-red-100" : "bg-primary/10"}`}>
                        {isRevisao
                          ? <AlertTriangle className="w-6 h-6 text-red-500" />
                          : <FileText className="w-6 h-6 text-primary" />
                        }
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground truncate">{p.title}</h3>
                          {isRevisao && (
                            <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">⚠ Clique para revisar</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {p.claimant_name} vs {p.defendant_name} • {CASE_LABELS[p.case_type] || p.case_type}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <p className="text-xs text-muted-foreground">
                            {new Date(p.created_date).toLocaleDateString("pt-BR")} {new Date(p.created_date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          {p.document_urls?.some(u => u?.endsWith(".docx")) && (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                              <FileDown className="w-3 h-3" /> DOCX
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${STATUS_BADGE[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                      <button
                        onClick={(e) => handleDelete(p.id, e)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}