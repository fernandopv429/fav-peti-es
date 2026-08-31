import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Inbox, Loader2, Search, BadgeCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import CasoWebhookItem from '@/features/entrevista/components/CasoWebhookItem';

// Fila de petições geradas automaticamente via webhook. Lista
// CasoTrabalhista com analise_json.origem === 'webhook':
// - 'em_analise' = geração em andamento (spinner)
// - 'gerado' = pronta para revisar (abre no painel)
export default function FilaWebhooks({ open, onOpenChange, onSelecionar, modo = 'pendentes' }) {
  const confirmadasView = modo === 'confirmadas';
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

  // Cada ícone abre uma lista: a fila de revisão ou as já confirmadas.
  const lista = casosFiltrados.filter((c) =>
    confirmadasView ? c.status === 'pronto' : c.status !== 'pronto',
  );

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
            {confirmadasView ? (
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
              : confirmadasView
                ? 'Nenhuma petição com revisão confirmada ainda.'
                : 'Nenhuma petição pendente de revisão.'}
          </p>
        ) : (
          <div className="space-y-2">
            {lista.map((c) => <CasoWebhookItem key={c.id} caso={c} onSelecionar={onSelecionar} />)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}