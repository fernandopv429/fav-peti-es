import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BookOpen, Plus, Trash2, Search, Tag, ToggleLeft, ToggleRight, Loader2, Sparkles, ExternalLink, Link2, Bot, X, Check, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = {
  horas_extras: "Horas Extras",
  "verbas_rescisórias": "Verbas Rescisórias",
  dano_moral: "Dano Moral",
  equiparação_salarial: "Equiparação Salarial",
  assedio: "Assédio",
  intervalo: "Intervalo",
  outro: "Outro",
};

const CATEGORY_COLORS = {
  horas_extras: "bg-amber-100 text-amber-700",
  "verbas_rescisórias": "bg-blue-100 text-blue-700",
  dano_moral: "bg-red-100 text-red-700",
  equiparação_salarial: "bg-green-100 text-green-700",
  assedio: "bg-purple-100 text-purple-700",
  intervalo: "bg-orange-100 text-orange-700",
  outro: "bg-muted text-muted-foreground",
};

export default function Precedents() {
  const [precedents, setPrecedents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [showAiSearch, setShowAiSearch] = useState(false);

  const load = async () => {
    const data = await base44.entities.Precedent.list("-created_date");
    setPrecedents(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm("Excluir este precedente?")) return;
    await base44.entities.Precedent.delete(id);
    setPrecedents((prev) => prev.filter((p) => p.id !== id));
    toast.success("Precedente excluído");
  };

  const handleToggle = async (id, current) => {
    await base44.entities.Precedent.update(id, { is_active: !current });
    setPrecedents((prev) => prev.map((p) => p.id === id ? { ...p, is_active: !current } : p));
  };

  const filtered = precedents.filter((p) => {
    const matchesSearch = !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.content.toLowerCase().includes(search.toLowerCase()) ||
      p.reference?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory === "all" || p.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-playfair font-bold">Precedentes & Jurisprudências</h1>
          <p className="text-muted-foreground mt-1">Busque via IA ou cadastre manualmente para fundamentar suas petições</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setShowAiSearch(!showAiSearch)}>
            <Bot className="w-4 h-4 text-amber-600" />
            Buscar com IA
          </Button>
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> Manual</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Novo Precedente / Jurisprudência</DialogTitle>
              </DialogHeader>
              <PrecedentForm onSuccess={() => { setShowDialog(false); load(); }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* AI Search Panel */}
      {showAiSearch && (
        <AiJurisSearch onSave={() => { load(); toast.success("Jurisprudência salva com sucesso!"); }} />
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, ementa ou número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold">{precedents.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Total</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold">{precedents.filter(p => p.is_active).length}</p>
          <p className="text-xs text-muted-foreground mt-1">Ativos</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold">{[...new Set(precedents.map(p => p.source))].length}</p>
          <p className="text-xs text-muted-foreground mt-1">Tribunais</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold">{precedents.filter(p => p.source_url).length}</p>
          <p className="text-xs text-muted-foreground mt-1">Com Link</p>
        </Card>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold text-lg">Nenhum precedente encontrado</h3>
          <p className="text-muted-foreground mt-1">Use a busca com IA ou adicione manualmente</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <PrecedentCard key={p.id} precedent={p} onDelete={handleDelete} onToggle={handleToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

function PrecedentCard({ precedent: p, onDelete, onToggle }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`p-5 transition-all hover:shadow-md ${!p.is_active ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="font-semibold text-foreground">{p.title}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[p.category]}`}>
              {CATEGORIES[p.category]}
            </span>
            {p.source_url && (
              <a
                href={p.source_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors font-medium"
              >
                <ExternalLink className="w-3 h-3" /> Ver no JusBrasil
              </a>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
            <span className="font-medium text-primary">{p.source}</span>
            {p.reference && <span>• {p.reference}</span>}
          </div>
          <p className={`text-sm text-muted-foreground ${expanded ? "" : "line-clamp-3"}`}>{p.content}</p>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-primary hover:underline mt-1 flex items-center gap-1"
          >
            {expanded ? <><ChevronUp className="w-3 h-3" />Ver menos</> : <><ChevronDown className="w-3 h-3" />Ver completo</>}
          </button>
          {p.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {p.tags.map((tag, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full">
                  <Tag className="w-3 h-3" />{tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => onToggle(p.id, p.is_active)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            {p.is_active ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
          </button>
          <button onClick={() => onDelete(p.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}

function AiJurisSearch({ onSave }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("horas_extras");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState([]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é um especialista em jurisprudência trabalhista brasileira. 
      
Busque e retorne 5 jurisprudências/súmulas relevantes sobre o tema: "${query}"
Categoria: ${CATEGORIES[category]}

Para cada jurisprudência, forneça:
1. Título descritivo
2. Tribunal (TST, TRT-X, STF, etc.)
3. Referência (número do acórdão, súmula, OJ, etc.)
4. Ementa completa e detalhada
5. URL do JusBrasil para consulta (use o formato: https://www.jusbrasil.com.br/jurisprudencia/busca?q=REFERENCIA_AQUI substituindo REFERENCIA_AQUI pelo número/nome da súmula/acórdão)
6. Tags relevantes (array de strings)

IMPORTANTE: Para as URLs do JusBrasil, use sempre o formato de busca:
- Para súmulas TST: https://www.jusbrasil.com.br/jurisprudencia/busca?q=Sumula+291+TST
- Para OJs: https://www.jusbrasil.com.br/jurisprudencia/busca?q=OJ+394+TST
- Para acórdãos: https://www.jusbrasil.com.br/jurisprudencia/busca?q=NUMERO_ACORDAO

Retorne APENAS JSON válido com a estrutura:
{
  "results": [
    {
      "title": "string",
      "source": "string (ex: TST)",
      "reference": "string (ex: Súmula 291)",
      "content": "string (ementa completa)",
      "source_url": "string (URL JusBrasil)",
      "tags": ["string"]
    }
  ]
}`,
      response_json_schema: {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                source: { type: "string" },
                reference: { type: "string" },
                content: { type: "string" },
                source_url: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
              }
            }
          }
        }
      }
    });

    setResults(result.results || []);
    setSearching(false);
  };

  const handleSave = async (item, index) => {
    setSaving(index);
    await base44.entities.Precedent.create({
      title: item.title,
      source: item.source,
      reference: item.reference,
      content: item.content,
      source_url: item.source_url,
      category,
      tags: item.tags || [],
      is_active: true,
    });
    setSaved(prev => [...prev, index]);
    setSaving(null);
    onSave();
  };

  return (
    <Card className="p-6 border-amber-200 bg-amber-50/30">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <Bot className="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Busca de Jurisprudência com IA</h3>
          <p className="text-xs text-muted-foreground">Encontre precedentes relevantes com links do JusBrasil</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
          <Input
            placeholder="Ex: horas extras em escala 12x36, intervalo intrajornada suprimido..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9 bg-white"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-52 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={handleSearch} disabled={searching || !query.trim()} className="gap-2 bg-amber-500 hover:bg-amber-600 text-white">
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {searching ? "Buscando..." : "Buscar"}
        </Button>
      </div>

      {searching && (
        <div className="flex items-center gap-3 py-6 justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
          <span className="text-sm">Consultando jurisprudências via IA...</span>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3 mt-2">
          <p className="text-sm font-medium text-foreground">{results.length} resultado(s) encontrado(s):</p>
          {results.map((item, i) => (
            <div key={i} className="bg-white rounded-xl border border-border p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h4 className="font-semibold text-sm text-foreground">{item.title}</h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[category]}`}>
                      {CATEGORIES[category]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <span className="font-medium text-primary">{item.source}</span>
                    {item.reference && <span>• {item.reference}</span>}
                    {item.source_url && (
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        <ExternalLink className="w-3 h-3" /> JusBrasil
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3">{item.content}</p>
                  {item.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.tags.map((tag, ti) => (
                        <span key={ti} className="text-xs bg-muted px-2 py-0.5 rounded-full">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={saved.includes(i) ? "outline" : "default"}
                  disabled={saving === i || saved.includes(i)}
                  onClick={() => handleSave(item, i)}
                  className="shrink-0 gap-1.5"
                >
                  {saving === i ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : saved.includes(i) ? (
                    <><Check className="w-3 h-3 text-green-600" /> Salvo</>
                  ) : (
                    <><Plus className="w-3 h-3" /> Salvar</>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function PrecedentForm({ onSuccess }) {
  const [form, setForm] = useState({ title: "", source: "", reference: "", category: "horas_extras", content: "", source_url: "", tags: "" });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.title || !form.content || !form.source) { toast.error("Preencha os campos obrigatórios"); return; }
    setSaving(true);
    const tags = form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
    await base44.entities.Precedent.create({ ...form, tags, is_active: true });
    toast.success("Precedente cadastrado!");
    setSaving(false);
    onSuccess();
  };

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Título *</Label>
          <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="Ex: Horas extras habituais - integração ao salário" className="mt-1.5" />
        </div>
        <div>
          <Label>Tribunal/Órgão *</Label>
          <Input value={form.source} onChange={e => set("source", e.target.value)} placeholder="Ex: TST, TRT-2, STF" className="mt-1.5" />
        </div>
        <div>
          <Label>Número/Referência</Label>
          <Input value={form.reference} onChange={e => set("reference", e.target.value)} placeholder="Ex: Súmula 291 TST" className="mt-1.5" />
        </div>
        <div>
          <Label>Categoria</Label>
          <Select value={form.category} onValueChange={v => set("category", v)}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tags (separadas por vírgula)</Label>
          <Input value={form.tags} onChange={e => set("tags", e.target.value)} placeholder="Ex: 12x36, vigilante, escala" className="mt-1.5" />
        </div>
        <div className="col-span-2">
          <Label>Link JusBrasil / Fonte Oficial</Label>
          <Input value={form.source_url} onChange={e => set("source_url", e.target.value)} placeholder="https://www.jusbrasil.com.br/..." className="mt-1.5" />
        </div>
        <div className="col-span-2">
          <Label>Ementa / Texto do Precedente *</Label>
          <Textarea value={form.content} onChange={e => set("content", e.target.value)} placeholder="Cole aqui a ementa ou texto da decisão..." className="mt-1.5 min-h-[150px]" />
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        {saving ? "Salvando..." : "Cadastrar Precedente"}
      </Button>
    </div>
  );
}