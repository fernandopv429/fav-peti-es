import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookMarked, Search, Link2, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { textoBusca } from '@/features/peticoes/ListaModelosReferencia';

// Referências da petição: busca na biblioteca de precedentes, vincula com
// anotações e lista os precedentes já vinculados a esta peça.
export default function ReferenciasPeticao({ petitionId }) {
  const [modelos, setModelos] = useState([]);
  const [links, setLinks] = useState([]);
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState(null);
  const [notas, setNotas] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    base44.entities.ModeloReferencia.filter({ ativo: true }).then(setModelos).catch(() => {});
    base44.entities.PeticaoReferencia.filter({ petition_id: petitionId }).then(setLinks).catch(() => {});
  }, [petitionId]);

  const termo = busca.trim().toLowerCase();
  const resultados = useMemo(
    () => (termo ? modelos.filter((m) => textoBusca(m).includes(termo)) : modelos).slice(0, 8),
    [modelos, termo],
  );

  const vincular = async () => {
    if (!selecionado) return;
    setSalvando(true);
    try {
      const novo = await base44.entities.PeticaoReferencia.create({
        petition_id: petitionId,
        modelo_id: selecionado.id,
        titulo: selecionado.titulo,
        notas: notas.trim(),
      });
      setLinks((l) => [...l, novo]);
      setSelecionado(null);
      setNotas('');
      setBusca('');
      toast.success('Precedente vinculado à petição!');
    } catch (e) {
      toast.error('Erro ao vincular: ' + e.message);
    }
    setSalvando(false);
  };

  const remover = async (link) => {
    await base44.entities.PeticaoReferencia.delete(link.id).catch(() => {});
    setLinks((l) => l.filter((x) => x.id !== link.id));
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <BookMarked className="w-4 h-4 text-primary-ink" /> Referências e precedentes
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Busque na biblioteca de modelos de referência e vincule um precedente a esta petição, com suas anotações.
        </p>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setSelecionado(null); }}
          placeholder="Buscar precedente por título, função ou tese..."
          className="w-full pl-9 pr-3 py-2.5 rounded-md border border-input bg-transparent text-sm focus:outline-none focus:border-primary"
        />
      </div>

      {resultados.length > 0 && !selecionado && (
        <div className="border border-border rounded-lg divide-y divide-border">
          {resultados.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelecionado(m)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
            >
              <span className="block font-medium">{m.titulo}</span>
              <span className="block text-xs text-muted-foreground">
                {[m.funcao, m.sindicato, m.comarca_uf].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      )}
      {termo && !resultados.length && !selecionado && (
        <p className="text-sm text-muted-foreground">Nenhum precedente encontrado para “{busca}”.</p>
      )}

      {selecionado && (
        <div className="space-y-3 p-3 rounded-lg border border-primary/40 bg-primary/5">
          <p className="text-sm font-medium">{selecionado.titulo}</p>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Anotações: por que este precedente se aplica a esta petição..."
            className="w-full px-3 py-2 rounded-md border border-input bg-white text-sm resize-y"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={vincular} disabled={salvando} className="gap-1.5">
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Vincular precedente
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelecionado(null)} disabled={salvando}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Precedentes vinculados ({links.length})
        </p>
        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum precedente vinculado a esta petição ainda.</p>
        ) : (
          links.map((l) => (
            <div key={l.id} className="flex items-start gap-3 p-3 rounded-lg border border-border">
              <BookMarked className="w-4 h-4 text-primary-ink mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{l.titulo}</p>
                {l.notas && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{l.notas}</p>}
              </div>
              <button onClick={() => remover(l)} className="text-muted-foreground hover:text-destructive" title="Remover vínculo">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}