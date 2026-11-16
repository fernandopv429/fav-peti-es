import { useState } from "react";

/** Cartão branco padrão do painel. */
export function Cartao({ titulo, extra, children, className = "" }) {
  return (
    <div className={`bg-card border border-border rounded-xl px-4 py-3.5 card-soft ${className}`}>
      {(titulo || extra) && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-[13px] font-semibold text-foreground">{titulo}</h3>
          {extra && <span className="label-caps">{extra}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Colunas verticais (uma série). A última coluna — o período atual — fica em
 * âmbar. Hover mostra o valor exato abaixo do gráfico.
 */
export function Colunas({ dados = [], vazio = "Sem dados no período" }) {
  const [foco, setFoco] = useState(null);
  const max = Math.max(1, ...dados.map((d) => d.valor));
  const total = dados.reduce((s, d) => s + d.valor, 0);
  const ativo = foco != null ? dados[foco] : null;

  return (
    <div>
      <div className="relative h-36 flex items-end gap-1.5 border-b border-border" onMouseLeave={() => setFoco(null)}>
        {[0.5, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-dashed border-border/70" style={{ bottom: `${f * 100}%` }} />
        ))}
        {dados.map((d, i) => {
          const atual = i === dados.length - 1;
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setFoco(i)}
              onFocus={() => setFoco(i)}
              aria-label={`${d.titulo}: ${d.valor}`}
              className="relative flex-1 h-full flex items-end justify-center group outline-none"
            >
              <span
                className={`w-[72%] max-w-[36px] rounded-t-[4px] transition-colors ${
                  atual ? "bg-primary" : foco === i ? "bg-foreground/60" : "bg-foreground"
                }`}
                style={{ height: `${d.valor ? Math.max(3, (d.valor / max) * 100) : 0}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {dados.map((d, i) => (
          <span key={i} className="flex-1 text-center text-[10.5px] text-muted-foreground capitalize truncate">{d.rotulo}</span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-2 h-4">
        {total === 0 ? vazio : ativo ? (
          <><span className="text-foreground font-medium">{ativo.titulo}:</span> {ativo.valor} {ativo.valor === 1 ? "entrevista" : "entrevistas"}</>
        ) : `${total} no período · passe o mouse numa barra`}
      </p>
    </div>
  );
}

/** Barras horizontais com rótulo e valor (uma série). */
export function Barras({ dados = [], vazio = "Sem dados no período" }) {
  if (!dados.length) return <p className="text-xs text-muted-foreground py-3">{vazio}</p>;
  const max = Math.max(1, ...dados.map((d) => d.valor));
  return (
    <ul className="space-y-2">
      {dados.map((d) => (
        <li key={d.rotulo} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_28px] items-center gap-2" title={`${d.rotulo}: ${d.valor}`}>
          <span className="text-xs text-foreground/80 truncate">{d.rotulo}</span>
          <span className="h-2 bg-secondary rounded-full overflow-hidden">
            <span className="block h-full bg-foreground rounded-r-[4px]" style={{ width: `${(d.valor / max) * 100}%` }} />
          </span>
          <span className="text-xs text-foreground/80 text-right tabular-nums">{d.valor}</span>
        </li>
      ))}
    </ul>
  );
}
