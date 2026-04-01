import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FolderOpen, Plus, Upload, Loader2, FileText, Trash2, X, ToggleLeft, ToggleRight, Eye, Pencil, Tag, Search } from "lucide-react";
import { toast } from "sonner";

const CASE_TYPE_LABELS = {
  trabalhista: "Trabalhista",
  civel: "Cível",
  previdenciario: "Previdenciário",
  consumidor: "Consumidor",
  outro: "Outro",
};

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [viewTemplate, setViewTemplate] = useState(null);
  const [editTemplate, setEditTemplate] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCaseType, setFilterCaseType] = useState("all");
  const [filterTag, setFilterTag] = useState("");

  const loadTemplates = async () => {
    const data = await base44.entities.PetitionTemplate.list("-created_date");
    setTemplates(data);
    setLoading(false);
  };

  useEffect(() => { loadTemplates(); }, []);

  const handleDelete = async (id) => {
    if (!confirm("Excluir este modelo?")) return;
    await base44.entities.PetitionTemplate.delete(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast.success("Modelo excluído");
  };

  const handleToggle = async (id, currentState) => {
    await base44.entities.PetitionTemplate.update(id, { is_active: !currentState });
    setTemplates((prev) => prev.map((t) => t.id === id ? { ...t, is_active: !currentState } : t));
    toast.success(currentState ? "Modelo desativado" : "Modelo ativado");
  };

  // Collect all unique tags across templates
  const allTags = [...new Set(templates.flatMap(t => t.tags || []))].sort();

  const filtered = templates.filter(t => {
    const matchesSearch = !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCaseType = filterCaseType === "all" || t.case_type === filterCaseType;
    const matchesTag = !filterTag || (t.tags || []).includes(filterTag);
    return matchesSearch && matchesCaseType && matchesTag;
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
          <h1 className="text-2xl lg:text-3xl font-playfair font-bold">Modelos de Petição</h1>
          <p className="text-muted-foreground mt-1">Gerencie seus modelos e templates</p>
        </div>
        <Button className="gap-2" onClick={() => setShowNewDialog(true)}>
          <Plus className="w-4 h-4" /> Novo Modelo
        </Button>
      </div>

      {/* Search and filters */}
      {templates.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar modelos..."
              className="w-full pl-9 pr-3 h-9 rounded-md border border-input bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <select
            value={filterCaseType}
            onChange={e => setFilterCaseType(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">Todas as áreas</option>
            <option value="trabalhista">Trabalhista</option>
            <option value="civel">Cível</option>
            <option value="previdenciario">Previdenciário</option>
            <option value="consumidor">Consumidor</option>
            <option value="outro">Outro</option>
          </select>
          {allTags.length > 0 && (
            <select
              value={filterTag}
              onChange={e => setFilterTag(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Todas as tags</option>
              {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          )}
        </div>
      )}

      {templates.length === 0 ? (
        <Card className="p-12 text-center">
          <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold text-lg">Nenhum modelo cadastrado</h3>
          <p className="text-muted-foreground mt-1">Adicione modelos para usar como referência nas petições</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Search className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold text-lg">Nenhum modelo encontrado</h3>
          <p className="text-muted-foreground mt-1">Tente outros filtros</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <Card key={t.id} className={`p-5 transition-all hover:shadow-md ${!t.is_active ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setViewTemplate(t)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Visualizar">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button onClick={() => setEditTemplate(t)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Editar">
                    <Pencil className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button onClick={() => handleToggle(t.id, t.is_active)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title={t.is_active ? "Desativar" : "Ativar"}>
                    {t.is_active ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-foreground">{t.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{CASE_TYPE_LABELS[t.case_type] || t.case_type}</p>
              {t.description && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{t.description}</p>}
              {t.file_name && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  <FileText className="w-3.5 h-3.5" />
                  <span className="truncate">{t.file_name}</span>
                </div>
              )}
              {(t.tags || []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(t.tags || []).map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">
                      <Tag className="w-2.5 h-2.5" />{tag}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">Criado em {new Date(t.created_date).toLocaleDateString("pt-BR")}</p>
            </Card>
          ))}
        </div>
      )}

      {/* New Template Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Modelo de Petição</DialogTitle>
          </DialogHeader>
          <TemplateForm
            onSuccess={() => { setShowNewDialog(false); loadTemplates(); }}
            onCancel={() => setShowNewDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewTemplate} onOpenChange={() => setViewTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewTemplate?.name}</DialogTitle>
          </DialogHeader>
          {viewTemplate && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span><strong>Tipo:</strong> {CASE_TYPE_LABELS[viewTemplate.case_type]}</span>
                <span><strong>Status:</strong> {viewTemplate.is_active ? "Ativo" : "Inativo"}</span>
              </div>
              {viewTemplate.description && (
                <div>
                  <p className="text-sm font-medium mb-1">Descrição</p>
                  <p className="text-sm text-muted-foreground">{viewTemplate.description}</p>
                </div>
              )}
              {viewTemplate.file_name && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="text-sm">{viewTemplate.file_name}</span>
                  {viewTemplate.file_url && (
                    <a href={viewTemplate.file_url} target="_blank" rel="noreferrer" className="ml-auto text-xs text-primary hover:underline">
                      Baixar arquivo
                    </a>
                  )}
                </div>
              )}
              {viewTemplate.content && (
                <div>
                  <p className="text-sm font-medium mb-2">Conteúdo extraído</p>
                  <div className="bg-muted/30 rounded-xl p-4 text-sm whitespace-pre-wrap max-h-96 overflow-y-auto font-mono text-xs leading-relaxed">
                    {viewTemplate.content}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setViewTemplate(null)}>Fechar</Button>
                <Button onClick={() => { setEditTemplate(viewTemplate); setViewTemplate(null); }} className="gap-2">
                  <Pencil className="w-4 h-4" /> Editar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTemplate} onOpenChange={() => setEditTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Modelo</DialogTitle>
          </DialogHeader>
          {editTemplate && (
            <TemplateForm
              initialData={editTemplate}
              onSuccess={() => { setEditTemplate(null); loadTemplates(); }}
              onCancel={() => setEditTemplate(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateForm({ initialData, onSuccess, onCancel }) {
  const isEdit = !!initialData;
  const [form, setForm] = useState({
    name: initialData?.name || "",
    case_type: initialData?.case_type || "trabalhista",
    description: initialData?.description || "",
    content: initialData?.content || "",
    tags: initialData?.tags || [],
  });
  const [tagInput, setTagInput] = useState("");

  const addTag = (e) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      const tag = tagInput.trim().toLowerCase();
      if (!form.tags.includes(tag)) setForm(prev => ({ ...prev, tags: [...prev.tags, tag] }));
      setTagInput("");
    }
  };
  const removeTag = (tag) => setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const handleSave = async () => {
    if (!form.name) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);

    let fileUrl = initialData?.file_url || "";
    let fileName = initialData?.file_name || "";
    let content = form.content;

    if (file) {
      const t = toast.loading("Enviando arquivo...");
      try {
        const result = await base44.integrations.Core.UploadFile({ file });
        fileUrl = result.file_url;
        fileName = file.name;
        toast.dismiss(t);
        toast.success("Arquivo enviado!");
      } catch (err) {
        toast.dismiss(t);
        toast.error("Erro ao enviar arquivo: " + err.message);
        setSaving(false);
        return;
      }

      // Try to extract content from file
      if (!content && file.size < 5 * 1024 * 1024) {
        try {
          const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
            file_url: fileUrl,
            json_schema: {
              type: "object",
              properties: {
                content: { type: "string", description: "O conteúdo completo do documento de petição" },
              },
            },
          });
          if (extracted.status === "success" && extracted.output?.content) {
            // Truncate to avoid entity size limits (content is used as style reference only)
            content = extracted.output.content.slice(0, 8000);
          }
        } catch (e) { /* not critical */ }
      }
    }

    const data = { ...form, file_url: fileUrl, file_name: fileName, content };

    if (isEdit) {
      await base44.entities.PetitionTemplate.update(initialData.id, data);
      toast.success("Modelo atualizado!");
    } else {
      await base44.entities.PetitionTemplate.create({ ...data, is_active: true });
      toast.success("Modelo criado com sucesso!");
    }

    setSaving(false);
    onSuccess();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Label>Nome do Modelo *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Petição Trabalhista Padrão" className="mt-1.5" />
        </div>
        <div>
          <Label>Tipo de Ação</Label>
          <Select value={form.case_type} onValueChange={(v) => setForm({ ...form, case_type: v })}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="trabalhista">Trabalhista</SelectItem>
              <SelectItem value="civel">Cível</SelectItem>
              <SelectItem value="previdenciario">Previdenciário</SelectItem>
              <SelectItem value="consumidor">Consumidor</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Descrição</Label>
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Breve descrição..." className="mt-1.5" />
        </div>
      </div>

      <div>
        <Label>Arquivo do Modelo (PDF, DOCX, TXT)</Label>
        <div
          onClick={() => fileRef.current?.click()}
          className="mt-1.5 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
        >
          {file ? (
            <div className="flex items-center justify-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">{file.name}</span>
              <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="p-1 hover:bg-muted rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : initialData?.file_name ? (
            <div className="text-sm text-muted-foreground">
              <FileText className="w-5 h-5 mx-auto mb-1 text-primary" />
              <span className="font-medium">{initialData.file_name}</span>
              <p className="text-xs mt-1">Clique para substituir</p>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Clique para enviar o modelo</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT — até 5MB</p>
            </>
          )}
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => setFile(e.target.files[0])} className="hidden" />
        </div>
      </div>

      <div>
        <Label>Tags</Label>
        <p className="text-xs text-muted-foreground mb-1.5">Digite uma tag e pressione Enter (ex: horas-extras, dano-moral, rescisão)</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {form.tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-primary/10 text-primary">
              <Tag className="w-3 h-3" />{tag}
              <button onClick={() => removeTag(tag)} className="hover:text-destructive ml-1"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
        <input
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={addTag}
          placeholder="Adicionar tag..."
          className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div>
        <Label>Conteúdo do Modelo (texto)</Label>
        <p className="text-xs text-muted-foreground mb-1.5">Cole ou edite o texto da petição diretamente aqui. Se enviar um arquivo, o conteúdo será extraído automaticamente.</p>
        <Textarea
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value.slice(0, 8000) })}
          placeholder="Cole aqui o texto do modelo de petição..."
          className="min-h-[200px] font-mono text-xs"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancelar</Button>
        <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {saving ? "Salvando..." : isEdit ? "Salvar Alterações" : "Criar Modelo"}
        </Button>
      </div>
    </div>
  );
}