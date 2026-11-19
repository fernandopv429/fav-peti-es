import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Inbox, Loader2, Search, BadgeCheck, Hourglass } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import CasoWebhookItem from '@/features/entrevista/components/CasoWebhookItem';

// Fila de petições geradas automaticamente via webhook. Lista
// CasoTrabalhista com analise_json.origem === 'webhook':
// - 'em_analise' = geração em andamento (spinner)
// - 'gerado' = pronta para revisar (abre no painel)
export default function FilaWebhooks({ open, onOpenChange, onSelecionar, modo = 'pendentes' }) {
  const confirmadasView = modo === 'confirmadas';
  // "Aguardando dados" (fase 1, 19/11/2026): entrevista chegou sem salário,
  // datas ou escala — a peça não foi gerada; o comercial completa no Fav Sales.
  const aguardandoView = modo === 'aguardando';
  const [casos, setCasos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [gerando, setGerando] = useState(null);

  // Busca por nome ou CPF: só os dígitos importam no CPF, para o termo casar
  // esteja ele digitado com ou sem pontuação.
  const termo = busca.trim().toLowerCase();
  const digitos = termo.replace(/\D/g, '');
  const casosFiltrados = !termo
    ? casos
    : casos.filter((c) => {
        const nome = `${c.recl_nome || ''} ${c.titulo || ''}`.toLowerCase();
        const cpf = (c.recl_cpf || '').replace(/\D/g, '');
        return nome.includes(termo) || (digitos && cpf.includes(digitos));
      });

  // Cada ícone abre uma lista: a fila de revisão ou as já confirmadas.
  const lista = casosFiltrados.filter((c) => {
    if (aguardandoView) return c.status === 'aguardando_dados';
    if (confirmadasView) return c.status === 'pronto';
    return c.status !== 'pronto' && c.status !== 'aguardando_dados';
  });

  const diasDesde = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null);

  // Urgência: gera a peça mesmo sem os dados mínimos (sai com as pendências
  // marcadas, como era antes) e o caso passa para a Fila.
  const gerarMesmoAssim = async (c) => {
    const eventoId = c.analise_json?.evento_id;
    if (!eventoId) { toast.error('Este caso não tem o evento de origem.'); return; }
    setGerando(c.id);
    const t = toast.loading(`Gerando a peça de ${c.recl_nome || 'reclamante'}…`);
    try {
      const r = await base44.functions.invoke('gerarPecaWebhook', { evento_id: eventoId, forcar: true, gerar_mesmo_assim: true });
      if (r?.data?.error) throw new Error(r.data.error);
      toast.success('Peça gerada com pendências. Ela está na Fila.', { id: t });
      await carregar();
    } catch (e) {
      toast.error(e?.message || 'Não foi possível gerar a peça.', { id: t });
    } finally {
      setGerando(null);
    }
  };

  const carregar = async () => {
    setLoading(true);
    try {
      const lista = await base44.entities.CasoTrabalhista.list('-created_date', 1000);
      setCasos((lista || []).filter((c) => c.analise_json?.origem === 'webhook'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) carregar();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {aguardandoView ? (
              <><Hourglass className="h-5 w-5 text-destructive" /> Aguardando dados do Fav Sales</>
            ) : confirmadasView ? (
              <><BadgeCheck className="h-5 w-5 text-success" /> Petições confirmadas</>
            ) : (
              <><Inbox className="h-5 w-5" /> Petições a revisar</>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar por nome ou CPF"
            className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : lista.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {termo
              ? 'Nenhuma petição encontrada para esta busca.'
              : aguardandoView
                ? 'Nenhum caso parado por falta de dados.'
                : confirmadasView
                  ? 'Nenhuma petição com revisão confirmada ainda.'
                  : 'Nenhuma petição pendente de revisão.'}
          </p>
        ) : aguardandoView ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              A peça destes casos não foi gerada porque a entrevista chegou sem dados essenciais. O comercial completa no Fav Sales (menu Pendências) e o caso volta sozinho para a Fila.
            </p>
            {lista.map((c) => {
              const dias = diasDesde(c.analise_json?.aguardando_desde || c.updated_date);
              const pend = c.analise_json?.pendencias_dados || [];
              return (
                <div key={c.id} className="border border-border rounded-lg p-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="text-sm font-medium truncate">{c.recl_nome || c.titulo}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.recl1_nome || c.funcao || '—'}{dias != null ? ` · com o comercial há ${dias} dia(s)` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 flex-1 basis-48">
                    {pend.map((p) => (
                      <span key={p} className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${p.startsWith('Salário') ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{p}</span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => gerarMesmoAssim(c)}
                    disabled={gerando === c.id}
                    className="text-xs px-2.5 py-1.5 border border-border rounded-md hover:bg-muted disabled:opacity-50"
                    title="Para urgências: gera a peça agora, com as pendências marcadas"
                  >
                    {gerando === c.id ? 'Gerando…' : 'Gerar mesmo assim'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {lista.map((c) => <CasoWebhookItem key={c.id} caso={c} onSelecionar={onSelecionar} />)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}