import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FolderOpen, Plus, Upload, Loader2, FileText, Trash2, X, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);

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
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Novo Modelo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo Modelo de Petição</DialogTitle>
            </DialogHeader>
            <NewTemplateForm
              onSuccess={() => {
                setShowDialog(false);
                loadTemplates();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {templates.length === 0 ? (
        <Card className="p-12 text-center">
          <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold text-lg">Nenhum modelo cadastrado</h3>
          <p className="text-muted-foreground mt-1">Adicione modelos para usar como referência nas petições</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <Card key={t.id} className={`p-5 transition-all hover:shadow-md ${!t.is_active ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleToggle(t.id, t.is_active)}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    title={t.is_active ? "Desativar" : "Ativar"}
                  >
                    {t.is_active ? (
                      <ToggleRight className="w-5 h-5 text-green-600" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-foreground">{t.name}</h3>
              <p className="text-sm text-muted-foreground mt-1 capitalize">{t.case_type}</p>
              {t.description && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{t.description}</p>
              )}
              {t.file_name && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  <FileText className="w-3.5 h-3.5" />
                  <span className="truncate">{t.file_name}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                Criado em {new Date(t.created_date).toLocaleDateString("pt-BR")}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function NewTemplateForm({ onSuccess }) {
  const [form, setForm] = useState({
    name: "",
    case_type: "trabalhista",
    description: "",
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const handleSave = async () => {
    if (!form.name) {
      toast.error("Nome é obrigatório");
      return;
    }

    setSaving(true);
    let fileUrl = "";
    let fileName = "";
    let content = "";

    if (file) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        fileUrl = file_url;
        fileName = file.name;

        // Try to extract content from the file
        try {
          const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
            file_url: fileUrl,
            json_schema: {
              type: "object",
              properties: {
                content: { type: "string", description: "O conteúdo completo do documento" },
              },
            },
          });
          if (extracted.status === "success" && extracted.output?.content) {
            content = extracted.output.content;
          }
        } catch (e) {
          // Content extraction failed, not critical
        }
      } catch (err) {
        toast.error("Erro ao enviar arquivo");
        setSaving(false);
        return;
      }
    }

    await base44.entities.PetitionTemplate.create({
      ...form,
      file_url: fileUrl,
      file_name: fileName,
      content,
      is_active: true,
    });

    toast.success("Modelo criado com sucesso!");
    setSaving(false);
    onSuccess();
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Nome do Modelo *</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Ex: Petição Trabalhista Padrão"
          className="mt-1.5"
        />
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
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Descreva o modelo..."
          className="mt-1.5"
        />
      </div>

      <div>
        <Label>Arquivo do Modelo (opcional)</Label>
        <div
          onClick={() => fileRef.current?.click()}
          className="mt-1.5 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
        >
          {file ? (
            <div className="flex items-center justify-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">{file.name}</span>
              <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="p-1 hover:bg-muted rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Clique para enviar o modelo</p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            onChange={(e) => setFile(e.target.files[0])}
            className="hidden"
          />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        {saving ? "Salvando..." : "Criar Modelo"}
      </Button>
    </div>
  );
}