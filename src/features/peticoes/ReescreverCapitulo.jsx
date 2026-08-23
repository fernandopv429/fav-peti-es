import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wand2, Loader2, Check, X } from 'lucide-react';
import { dividirCapitulos, reescreverCapitulo, substituirCapitulo } from '@/features/peticoes/capitulosPeca';

// Reescrita de UM capítulo da peça: escolher → comentar → revisar → aprovar.
export default function ReescreverCapitulo({ conteudo, petition, onAplicar, salvando }) {
  const capitulos = useMemo(() => dividirCapitulos(conteudo), [conteudo]);
  const [idx, setIdx] = useState('');
  const [comentario, setComentario] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [proposta, setProposta] = useState('');
  const [erro, setErro] = useState('');

  const capitulo = idx === '' ? null : capitulos[Number(idx)];

  const gerar = async () => {
    if (!capitulo || !comentario.trim()) return;
    setCarregando(true);
    setErro('');
    try {
      setProposta(await reescreverCapitulo({ capitulo, comentario: comentario.trim(), petition }));
    } catch (e) {
      setErro(e.message || 'Não foi possível reescrever o capítulo.');
    }
    setCarregando(false);
  };

  const aprovar = async () => {
    await onAplicar(substituirCapitulo(conteudo, capitulo, proposta));
    setProposta('');
    setComentario('');
    setIdx('');
  };

  if (!capitulos.length) return null;

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-primary-ink" /> Reescrever um capítulo com IA
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Escolha o capítulo, diga o que corrigir e revise a sugestão. Partes, datas e valores calculados não são alterados.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm space-y-1.5">
          <span className="font-medium">Capítulo</span>
          <select
            value={idx}
            onChange={(e) => { setIdx(e.target.value); setProposta(''); }}
            className="w-full h-10 px-3 rounded-md border border-input bg-transparent text-sm"
          >
            <option value="">Selecione o capítulo...</option>
            {capitulos.map((c, i) => (
              <option key={i} value={i}>{c.titulo}</option>
            ))}
          </select>
        </label>
        <label className="text-sm space-y-1.5">
          <span className="font-medium">O que corrigir neste capítulo</span>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={2}
            placeholder="Ex.: detalhar melhor o dano moral e citar o art. 223-B da CLT"
            className="w-full px-3 py-2 rounded-md border border-input bg-transparent text-sm resize-y"
          />
        </label>
      </div>

      {capitulo && !proposta && (
        <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{capitulo.texto}</p>
      )}
      {erro && <p className="text-sm text-destructive">{erro}</p>}

      {proposta ? (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Sugestão da IA para “{capitulo.titulo}”</p>
          <div className="max-h-72 overflow-y-auto p-3 rounded-lg border border-border bg-muted/40 text-sm whitespace-pre-wrap">
            {proposta}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={aprovar} disabled={salvando} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Aprovar e atualizar a petição
            </Button>
            <Button size="sm" variant="outline" onClick={() => setProposta('')} disabled={salvando} className="gap-1.5">
              <X className="w-3.5 h-3.5" /> Descartar
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" onClick={gerar} disabled={!capitulo || !comentario.trim() || carregando} className="gap-1.5">
          {carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
          {carregando ? 'Reescrevendo...' : 'Reescrever capítulo'}
        </Button>
      )}
    </Card>
  );
}