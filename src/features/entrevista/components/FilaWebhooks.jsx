import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Inbox, Loader2, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import CasoWebhookItem from '@/features/entrevista/components/CasoWebhookItem';

// Fila de petições geradas automaticamente via webhook. Lista
// CasoTrabalhista com analise_json.origem === 'webhook':
// - 'em_analise' = geração em andamento (spinner)
// - 'gerado' = pronta para revisar (abre no painel)
export default function FilaWebhooks({ open, onOpenChange, onSelecionar }) {
  const [casos, setCasos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');

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

  // Confirmadas ficam num grupo separado, abaixo das que ainda vão ser revisadas.
  const confirmadas = casosFiltrados.filter((c) => c.status === 'pronto');
  const pendentes = casosFiltrados.filter((c) => c.status !== 'pronto');

  const carregar = async () => {
    setLoading(true);
    try {
      const lista = await base44.entities.CasoTrabalhista.list('-created_date', 50);
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
            <Inbox className="h-5 w-5" /> Petições via webhook
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
        ) : casosFiltrados.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {casos.length === 0
              ? 'Nenhuma petição recebida via webhook ainda.'
              : 'Nenhuma petição encontrada para esta busca.'}
          </p>
        ) : (
          <div className="space-y-5">
            <section className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                A revisar ({pendentes.length})
              </p>
              {pendentes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma petição pendente de revisão.</p>
              ) : (
                pendentes.map((c) => <CasoWebhookItem key={c.id} caso={c} onSelecionar={onSelecionar} />)
              )}
            </section>

            {confirmadas.length > 0 && (
              <section className="space-y-2 pt-1 border-t border-border">
                <p className="text-xs font-semibold text-success uppercase tracking-wide pt-3">
                  Revisão confirmada ({confirmadas.length})
                </p>
                {confirmadas.map((c) => <CasoWebhookItem key={c.id} caso={c} onSelecionar={onSelecionar} />)}
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}