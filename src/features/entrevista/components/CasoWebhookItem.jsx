import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, User, Building2, Clock, CheckCircle2, BadgeCheck, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import DadosEventoWebhook from '@/features/entrevista/components/DadosEventoWebhook';
import SeloCompletude from '@/features/entrevista/components/SeloCompletude';

// Um caso da fila de webhooks: identificação do reclamante, CPF, reclamada,
// data e a ação de revisar.
export default function CasoWebhookItem({ caso: c, onSelecionar }) {
  const gerando = c.status === 'em_analise';
  const confirmado = c.status === 'pronto';
  const [aberto, setAberto] = useState(false);
  const eventoId = c.analise_json?.evento_id;
  // Botão "Refazer peça" (somente administradores): gera a peça de novo com os
  // dados e as CCTs atuais. O arquivo do texto anterior continua guardado.
  const [isAdmin, setIsAdmin] = useState(false);
  const [refazendo, setRefazendo] = useState(false);
  useEffect(() => {
    base44.auth.me().then((u) => setIsAdmin(u?.role === 'admin')).catch(() => setIsAdmin(false));
  }, []);
  const refazer = async () => {
    if (!eventoId) { toast.error('Este caso não tem o evento de origem.'); return; }
    if (!window.confirm(`Refazer a peça de ${c.recl_nome || 'reclamante'}? O texto atual sai da tela, mas o arquivo anterior fica guardado.`)) return;
    setRefazendo(true);
    const t = toast.loading(`Refazendo a peça de ${c.recl_nome || 'reclamante'}…`);
    try {
      const r = await base44.functions.invoke('gerarPecaWebhook', { evento_id: eventoId, forcar: true });
      if (r?.data?.error) throw new Error(r.data.error);
      toast.success('Peça refeita.', { id: t });
    } catch (e) {
      toast.error(e?.message || 'Não foi possível refazer a peça.', { id: t });
    } finally {
      setRefazendo(false);
    }
  };
  return (
    <div className="border border-border rounded-lg p-3 hover:bg-muted/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="truncate">{c.recl_nome || c.titulo || '(sem nome)'}</span>
            {!gerando && <SeloCompletude analise={c.analise_json} />}
            {confirmado && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-success/10 text-success text-[10px] font-semibold flex-shrink-0">
                <BadgeCheck className="h-3 w-3" /> Revisão confirmada
              </span>
            )}
          </p>
          {c.recl_cpf && <p className="text-[11px] text-muted-foreground mt-0.5">CPF {c.recl_cpf}</p>}
          <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
            <Building2 className="h-3 w-3 flex-shrink-0" />
            {c.recl1_nome || '—'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(c.created_date).toLocaleString('pt-BR')}
          </p>
        </div>
        {gerando ? (
          <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-primary-ink flex-shrink-0">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando...
          </span>
        ) : (
          <Button
            size="sm"
            variant={confirmado ? 'outline' : 'default'}
            onClick={() => onSelecionar(c)}
            className="flex-shrink-0"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {confirmado ? 'Abrir' : 'Revisar'}
          </Button>
        )}
      </div>
      {eventoId && (
        <button onClick={() => setAberto(!aberto)} className="text-[11px] text-primary-ink mt-2 flex items-center gap-1 hover:underline">
          {aberto ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {aberto ? 'Ocultar dados recebidos' : 'Ver dados recebidos'}
        </button>
      )}
      {isAdmin && eventoId && !gerando && (
        <button onClick={refazer} disabled={refazendo} className="text-[11px] text-primary-ink mt-2 ml-3 inline-flex items-center gap-1 hover:underline disabled:opacity-50" title="Somente administradores: gera a peça de novo com as CCTs atuais">
          <RefreshCw className={`h-3 w-3 ${refazendo ? 'animate-spin' : ''}`} />
          {refazendo ? 'Refazendo…' : 'Refazer peça'}
        </button>
      )}
      {aberto && eventoId && <DadosEventoWebhook eventoId={eventoId} />}
    </div>
  );
}