import React from 'react';
import { X } from 'lucide-react';
import { listarCapitulos } from '@/features/entrevista/lib/revisaoIA';

// ============================================================
// Escolha do capítulo a refazer, para quem prefere apontar o
// tópico em lista em vez de selecionar o trecho no documento.
// ============================================================
export default function EscolherTopico({ dados, onEscolher, onFechar }) {
  const capitulos = listarCapitulos(dados);

  return (
    <div className="absolute right-3 top-12 z-30 w-[min(300px,calc(100vw-2rem))] bg-card border border-border rounded-xl shadow-lg">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-foreground flex-1">Qual tópico refazer?</span>
        <button onClick={onFechar} className="p-1 text-muted-foreground hover:text-foreground" title="Fechar">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {capitulos.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">
          Esta peça não tem capítulos redigidos pela IA — o texto vem todo do modelo e dos dados do caso.
        </p>
      ) : (
        <div className="max-h-72 overflow-y-auto p-1.5">
          {capitulos.map((c) => (
            <button
              key={c.campo}
              onClick={() => onEscolher(c)}
              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-muted transition-colors"
            >
              <span className="block text-xs font-medium text-foreground capitalize">{c.rotulo}</span>
              <span className="block text-[11px] text-muted-foreground line-clamp-2">{c.texto}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}