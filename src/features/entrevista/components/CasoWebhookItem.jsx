import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, User, Building2, Clock, CheckCircle2, BadgeCheck } from 'lucide-react';

// Um caso da fila de webhooks: identificação do reclamante, CPF, reclamada,
// data e a ação de revisar.
export default function CasoWebhookItem({ caso: c, onSelecionar }) {
  const gerando = c.status === 'em_analise';
  const confirmado = c.status === 'pronto';
  return (
    <div className="border border-border rounded-lg p-3 hover:bg-muted/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="truncate">{c.recl_nome || c.titulo || '(sem nome)'}</span>
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
    </div>
  );
}