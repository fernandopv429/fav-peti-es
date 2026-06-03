import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Download, Trash2, RotateCcw, Plus, Save, Upload,
  ShieldCheck, Loader2, AlertTriangle, CheckCircle2, Clock, Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const TIPO_LABEL = {
  manual: { label: "Manual", color: "bg-blue-100 text-blue-700" },
  automatico: { label: "Automático", color: "bg-green-100 text-green-700" },
  pre_restauracao: { label: "Pré-restauração", color: "bg-amber-100 text-amber-700" },
};

function formatBytes(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(str) {
  if (!str) return "—";
  return new Date(str).toLocaleString("pt-BR");
}

export default function BackupRestauracao() {
  const [backups, setBackups] = useState([]);
  const [config, setConfig] = useState({ ativo: false, frequencia: "diario", dia_semana: 1, hora: "02:00" });
  const [configId, setConfigId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [restaurando, setRestaurando] = useState(null); // backup id sendo restaurado
  const [confirmacao, setConfirmacao] = useState(""); // texto digitado
  const [backupParaRestaurar, setBackupParaRestaurar] = useState(null);
  const [importando, setImportando] = useState(false);
  const importRef = useRef(null);

  const carregar = async () => {
    try {
      const [bkps, cfgs] = await Promise.all([
        base44.entities.Backup.list("-created_date", 50),
        base44.entities.BackupConfig.list(),
      ]);
      setBackups(bkps || []);
      if (cfgs?.[0]) {
        setConfig(cfgs[0]);
        setConfigId(cfgs[0].id);
      }
    } catch (e) {
      toast.error("Erro ao carregar: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  // ── Criar backup manual ───────────────────────────────────────────────────
  const handleCriarBackup = async () => {
    setCriando(true);
    try {
      const res = await base44.functions.invoke("criarBackup", { tipo: "manual" });
      toast.success(`Backup criado! ${res.data.total_registros} registros salvos.`);
      await carregar();
    } catch (e) {
      toast.error("Erro ao criar backup: " + e.message);
    } finally {
      setCriando(false);
    }
  };

  // ── Salvar configuração ───────────────────────────────────────────────────
  const handleSalvarConfig = async () => {
    setSalvandoConfig(true);
    try {
      const payload = {
        ativo: config.ativo,
        frequencia: config.frequencia,
        dia_semana: config.frequencia === "semanal" ? config.dia_semana : undefined,
        hora: config.hora,
      };
      if (configId) {
        await base44.entities.BackupConfig.update(configId, payload);
      } else {
        const criado = await base44.entities.BackupConfig.create(payload);
        setConfigId(criado.id);
      }
      toast.success("Configuração salva!");
    } catch (e) {
      toast.error("Erro ao salvar configuração: " + e.message);
    } finally {
      setSalvandoConfig(false);
    }
  };

  // ── Baixar backup como .json ──────────────────────────────────────────────
  const handleBaixar = async (backup) => {
    try {
      let jsonStr;
      if (backup.file_url) {
        const resp = await fetch(backup.file_url);
        jsonStr = await resp.text();
      } else if (backup.conteudo_json) {
        jsonStr = backup.conteudo_json;
      } else {
        toast.error("Backup sem conteúdo para baixar."); return;
      }
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_fav_${new Date(backup.created_date).toISOString().slice(0, 16).replace("T", "_")}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Erro ao baixar: " + e.message);
    }
  };

  // ── Excluir backup ────────────────────────────────────────────────────────
  const handleExcluir = async (id) => {
    if (!window.confirm("Excluir este backup permanentemente?")) return;
    try {
      await base44.entities.Backup.delete(id);
      setBackups(prev => prev.filter(b => b.id !== id));
      toast.success("Backup excluído.");
    } catch (e) {
      toast.error("Erro ao excluir: " + e.message);
    }
  };

  // ── Restaurar backup ──────────────────────────────────────────────────────
  const handleRestaurar = async () => {
    if (!backupParaRestaurar) return;
    setRestaurando(backupParaRestaurar.id);
    try {
      // Cria backup de segurança antes de restaurar
      toast.info("Criando backup de segurança antes de restaurar...");
      await base44.functions.invoke("criarBackup", { tipo: "pre_restauracao", observacao: `Pré-restauração do backup de ${formatDate(backupParaRestaurar.created_date)}` });

      // Restaura
      const res = await base44.functions.invoke("restaurarBackup", { backup_id: backupParaRestaurar.id });
      if (res.data.erros?.length > 0) {
        toast.warning(`Restaurado com avisos: ${res.data.erros.join(", ")}`);
      } else {
        toast.success(`${res.data.total_restaurado} registros restaurados com sucesso!`);
      }
      setBackupParaRestaurar(null);
      setConfirmacao("");
      await carregar();
    } catch (e) {
      toast.error("Erro ao restaurar: " + e.message);
    } finally {
      setRestaurando(null);
    }
  };

  // ── Importar arquivo .json ────────────────────────────────────────────────
  const handleImportar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    try {
      const texto = await file.text();
      const snapshot = JSON.parse(texto);

      // Confirma e cria backup de segurança
      if (!window.confirm(`Restaurar a partir do arquivo "${file.name}"? Os dados atuais serão substituídos. Um backup de segurança será criado antes.`)) {
        setImportando(false);
        return;
      }

      toast.info("Criando backup de segurança...");
      await base44.functions.invoke("criarBackup", { tipo: "pre_restauracao", observacao: `Pré-importação do arquivo ${file.name}` });

      const res = await base44.functions.invoke("restaurarBackup", { snapshot_json: snapshot });
      if (res.data.erros?.length > 0) {
        toast.warning(`Importado com avisos: ${res.data.erros.join(", ")}`);
      } else {
        toast.success(`${res.data.total_restaurado} registros importados com sucesso!`);
      }
      await carregar();
    } catch (e) {
      toast.error("Erro ao importar: " + e.message);
    } finally {
      setImportando(false);
      if (importRef.current) importRef.current.value = "";
    }
  };

  const podeRestaurar = confirmacao.trim() === "RESTAURAR";

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background px-6 lg:px-10 py-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Backup e Restauração</h1>
          <p className="text-sm text-muted-foreground">Gerencie snapshots completos dos dados do app</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Coluna esquerda — Ações e Config */}
        <div className="space-y-6">
          {/* Backup manual */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-semibold text-foreground mb-1">Backup imediato</h2>
            <p className="text-xs text-muted-foreground mb-4">Cria um snapshot completo agora de todas as entidades.</p>
            <Button onClick={handleCriarBackup} disabled={criando} className="w-full gap-2">
              {criando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {criando ? "Criando backup..." : "Fazer backup agora"}
            </Button>
          </div>

          {/* Importar arquivo */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-semibold text-foreground mb-1">Importar arquivo</h2>
            <p className="text-xs text-muted-foreground mb-4">Restaure a partir de um arquivo .json de backup baixado anteriormente.</p>
            <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportar} />
            <Button variant="outline" onClick={() => importRef.current?.click()} disabled={importando} className="w-full gap-2">
              {importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importando ? "Importando..." : "Importar .json"}
            </Button>
          </div>

          {/* Configuração de agendamento */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-semibold text-foreground mb-1 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Backup automático
            </h2>
            <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 mb-4">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
              O backup automático requer uma automação agendada ativa no painel da plataforma (função <strong>backupAgendado</strong>).
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={config.ativo} onChange={e => setConfig(p => ({ ...p, ativo: e.target.checked }))}
                  className="rounded" />
                <span className="text-sm font-medium text-foreground">Backup automático ativo</span>
              </label>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Frequência</label>
                <select value={config.frequencia} onChange={e => setConfig(p => ({ ...p, frequencia: e.target.value }))}
                  className="w-full bg-input border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="diario">Diário</option>
                  <option value="semanal">Semanal</option>
                </select>
              </div>

              {config.frequencia === "semanal" && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Dia da semana</label>
                  <select value={config.dia_semana ?? 1} onChange={e => setConfig(p => ({ ...p, dia_semana: Number(e.target.value) }))}
                    className="w-full bg-input border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                    {DIAS_SEMANA.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Horário</label>
                <input type="time" value={config.hora || "02:00"} onChange={e => setConfig(p => ({ ...p, hora: e.target.value }))}
                  className="w-full bg-input border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>

              <Button onClick={handleSalvarConfig} disabled={salvandoConfig} className="w-full gap-2" variant="outline">
                {salvandoConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {salvandoConfig ? "Salvando..." : "Salvar configuração"}
              </Button>
            </div>
          </div>
        </div>

        {/* Coluna direita — Lista de backups */}
        <div className="lg:col-span-2">
          <h2 className="font-semibold text-foreground mb-4">
            Backups disponíveis <span className="text-muted-foreground font-normal text-sm">({backups.length})</span>
          </h2>

          {backups.length === 0 ? (
            <div className="border border-dashed border-border rounded-2xl p-12 text-center text-muted-foreground text-sm">
              Nenhum backup encontrado. Crie o primeiro agora.
            </div>
          ) : (
            <div className="space-y-3">
              {backups.map(b => {
                const tipo = TIPO_LABEL[b.tipo] || TIPO_LABEL.manual;
                const isRestaurando = restaurando === b.id;
                return (
                  <div key={b.id} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tipo.color}`}>{tipo.label}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {formatDate(b.created_date)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span><strong className="text-foreground">{b.total_registros ?? "—"}</strong> registros</span>
                          <span>{formatBytes(b.tamanho_bytes)}</span>
                          {b.observacao && <span className="truncate max-w-[200px]">{b.observacao}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => handleBaixar(b)} title="Baixar .json"
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <Download className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setBackupParaRestaurar(b); setConfirmacao(""); }} title="Restaurar"
                          className="p-1.5 rounded-lg hover:bg-amber-50 text-muted-foreground hover:text-amber-700 transition-colors" disabled={isRestaurando}>
                          {isRestaurando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                        </button>
                        <button onClick={() => handleExcluir(b.id)} title="Excluir"
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal de confirmação de restauração */}
      {backupParaRestaurar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">Restaurar backup</h3>
                <p className="text-xs text-muted-foreground">{formatDate(backupParaRestaurar.created_date)}</p>
              </div>
            </div>

            <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3 mb-4 text-sm text-foreground">
              <strong>Atenção:</strong> Esta operação <strong>substituirá todos os dados atuais</strong> pelo snapshot selecionado. Um backup de segurança será criado automaticamente antes.
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                Digite <strong>RESTAURAR</strong> para confirmar:
              </label>
              <input
                type="text"
                value={confirmacao}
                onChange={e => setConfirmacao(e.target.value)}
                placeholder="RESTAURAR"
                className="w-full bg-input border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setBackupParaRestaurar(null); setConfirmacao(""); }}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2"
                disabled={!podeRestaurar || !!restaurando}
                onClick={handleRestaurar}
              >
                {restaurando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {restaurando ? "Restaurando..." : "Confirmar restauração"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}