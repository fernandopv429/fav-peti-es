import React, { useState } from 'react';
import { Loader2, X, Wand2, Check } from 'lucide-react';
import { localizarCampoDoTrecho, corrigirTrechoIA } from '@/features/entrevista/lib/revisaoIA';

// ============================================================
// Comentário sobre o trecho selecionado no documento.
// O trecho é casado com o capítulo redigido a que pertence e a IA
// reescreve SÓ aquele capítulo; a proposta é exibida para aprovação
// antes de entrar no documento.
// ============================================================
export default function ComentarioTrecho({ trecho, dados, caso, onAplicar, onFechar }) {
  const [comentario, setComentario] = useState('');
  const [loading, setLoading] = useState(false);
  const [proposta, setProposta] = useState(null);
  const [erro, setErro] = useState('');

  const campo = localizarCampoDoTrecho(dados, trecho);

  const pedirCorrecao = async () => {
    if (!comentario.trim() || !campo) return;
    setLoading(true);
    setErro('');
    try {
      const res = await corrigirTrechoIA({
        campo,
        textoAtual: dados[campo],
        trecho,
        comentario: comentario.trim(),
        caso,
      });
      const texto = res?.texto_corrigido?.trim();
      if (!texto) throw new Error('A IA não devolveu o texto corrigido.');
      setProposta({ texto, resumo: res?.resumo || '' });
    } catch (e) {
      console.error(e);
      setErro(e?.message || 'Não foi possível gerar a correção.');
    }
    setLoading(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(420px,calc(100vw-2rem))] bg-card border border-border rounded-xl shadow-lg">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Wand2 className="w-4 h-4 text-primary-ink" />
        <span className="text-sm font-medium text-foreground flex-1">Corrigir trecho</span>
        <button onClick={onFechar} className="p-1 text-muted-foreground hover:text-foreground" title="Fechar">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 space-y-2.5 max-h-[60vh] overflow-y-auto">
        <p className="text-[11px] text-muted-foreground">Trecho selecionado</p>
        <p className="text-xs text-foreground bg-muted rounded-lg p-2 line-clamp-4">{trecho}</p>

        {!campo ? (
          <p className="text-xs text-warning">
            Este trecho não faz parte de um capítulo redigido pela IA — é texto fixo do modelo, um dado
            da parte ou um valor calculado. Corrija na entrevista (dados) ou no modelo .docx.
          </p>
        ) : proposta ? (
          <>
            <p className="text-[11px] text-muted-foreground">Proposta da IA {proposta.resumo && `— ${proposta.resumo}`}</p>
            <p className="text-xs text-foreground whitespace-pre-wrap bg-success/10 rounded-lg p-2">{proposta.texto}</p>
            <div className="flex gap-2">
              <button
                onClick={() => onAplicar(campo, proposta.texto)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-success text-white rounded-lg text-xs font-medium hover:bg-success/90"
              >
                <Check className="w-3.5 h-3.5" /> Aplicar no documento
              </button>
              <button
                onClick={() => setProposta(null)}
                className="px-3 py-2 border border-border rounded-lg text-xs font-medium text-foreground hover:bg-muted"
              >
                Descartar
              </button>
            </div>
          </>
        ) : (
          <>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={3}
              placeholder="O que deve ser corrigido neste trecho?"
              className="w-full px-2.5 py-2 text-sm border border-border rounded-lg resize-none focus:outline-none focus:border-primary"
            />
            {erro && <p className="text-xs text-destructive">{erro}</p>}
            <button
              onClick={pedirCorrecao}
              disabled={loading || !comentario.trim()}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-40"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              {loading ? 'Reescrevendo o capítulo...' : 'Refazer este tópico'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}