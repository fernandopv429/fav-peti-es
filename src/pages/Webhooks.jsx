import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Webhook, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';

const STATUS_CONFIG = {
  recebido: { label: 'Recebido', variant: 'secondary', icon: Clock, color: 'text-blue-600' },
  processado: { label: 'Processado', variant: 'default', icon: CheckCircle2, color: 'text-green-600' },
  erro: { label: 'Erro', variant: 'destructive', icon: XCircle, color: 'text-red-600' },
};

// Todo evento de entrevista chega com evento_tipo="entrevista.salva" — nome
// genérico igual pra todo mundo. Aqui puxamos o nome de quem gerou o evento
// (vem em payload.data em formatos diferentes dependendo da origem) pra usar
// como identificação principal na lista, em vez do evento_tipo repetido.
const nomeDoEvento = (ev) => {
  const d = ev?.payload?.data || {};
  return (
    d.RECL_NOME || d.recl_nome || d.claimant_name || d.nome || d.name ||
    d.titulo || d.title || ev?.payload?.created_by || ''
  ).toString().trim();
};

export default function Webhooks() {
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecionado, setSelecionado] = useState(null);

  const carregar = async () => {
    setLoading(true);
    try {
      const lista = await base44.entities.WebhookEvento.list('-created_date', 100);
      setEventos(lista || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const marcarProcessado = async (evento) => {
    try {
      await base44.entities.WebhookEvento.update(evento.id, {
        status: 'processado',
        processado_em: new Date().toISOString(),
      });
      carregar();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Webhook className="h-6 w-6 text-primary-ink" />
          <h1 className="text-2xl font-semibold">Webhooks recebidos</h1>
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="pt-4 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Como configurar o envio</p>
            <p className="mt-1">
              No sistema externo, aponte o POST para a URL do endpoint <code className="px-1 bg-amber-100 rounded">webhookReceber</code>
              (dashboard → code → functions → webhookReceber), incluindo o header
              <code className="px-1 bg-amber-100 rounded mx-1">X-Webhook-Secret</code> com o valor do segredo configurado.
            </p>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : eventos.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Webhook className="h-10 w-10 mx-auto mb-2 opacity-30" />
            Nenhum webhook recebido ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {eventos.map((ev) => {
            const cfg = STATUS_CONFIG[ev.status] || STATUS_CONFIG.recebido;
            const StatusIcon = cfg.icon;
            return (
              <Card key={ev.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelecionado(ev)}>
                <CardContent className="py-3 flex items-center gap-3">
                  <StatusIcon className={`h-5 w-5 ${cfg.color} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{nomeDoEvento(ev) || ev.evento_tipo}</span>
                      <Badge variant={cfg.variant} className="text-[10px]">{cfg.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {ev.evento_tipo} · {ev.origem} · {new Date(ev.created_date).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  {ev.status === 'recebido' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); marcarProcessado(ev); }}
                    >
                      Marcar processado
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selecionado} onOpenChange={(o) => !o && setSelecionado(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              {nomeDoEvento(selecionado) || selecionado?.evento_tipo}
            </DialogTitle>
          </DialogHeader>
          {selecionado && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Origem:</span> {selecionado.origem}</div>
                <div><span className="text-muted-foreground">Tipo:</span> {selecionado.evento_tipo}</div>
                <div><span className="text-muted-foreground">Status:</span> {STATUS_CONFIG[selecionado.status]?.label}</div>
                <div><span className="text-muted-foreground">ID do evento:</span> {selecionado.evento_id || '—'}</div>
                <div><span className="text-muted-foreground">IP:</span> {selecionado.ip_origem || '—'}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Recebido em:</span> {new Date(selecionado.created_date).toLocaleString('pt-BR')}</div>
              </div>
              <div>
                <p className="text-muted-foreground mb-1 font-medium">Payload:</p>
                <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(selecionado.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}