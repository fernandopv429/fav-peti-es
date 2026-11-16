import { useRef, useState } from "react";

const PRETO = "#141414";
const AMBAR = "#f2a900";

/** Cartão branco padrão do painel. */
export function Cartao({ titulo, subtitulo, extra, children, className = "" }) {
  return (
    <div className={`bg-card border border-border rounded-xl px-4 py-3.5 card-soft ${className}`}>
      {(titulo || extra) && (
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-foreground">{titulo}</h3>
            {subtitulo && <p className="text-[11.5px] text-muted-foreground mt-0.5">{subtitulo}</p>}
          </div>
          {extra && <div className="shrink-0">{extra}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/** Minilinha de tendência (sem eixos). */
export function Sparkline({ valores = [], cor = PRETO, largura = 80, altura = 24 }) {
  if (valores.length < 2) return <span style={{ width: largura, height: altura }} className="inline-block" />;
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const pts = valores
    .map((v, i) => `${(i * largura) / (valores.length - 1)},${altura - 2 - ((v - min) / (max - min || 1)) * (altura - 4)}`)
    .join(" ");
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} aria-hidden="true" className="shrink-0">
      <polyline points={pts} fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Duas linhas no mesmo eixo (recebidas × revisadas), com área suave sob a
 * principal e cruz de leitura no hover.
 */
export function LinhasFluxo({ dados = [] }) {
  const ref = useRef(null);
  const [foco, setFoco] = useState(null);
  const W = 600, H = 170, PX = 10, PY = 10;
  const n = dados.length;
  const max = Math.max(4, ...dados.flatMap((d) => [d.recebidas, d.revisadas]));
  const passo = n > 1 ? (W - PX * 2) / (n - 1) : 0;
  const x = (i) => PX + i * passo;
  const y = (v) => H - PY - (v / max) * (H - PY * 2);
  const pts = (k) => dados.map((d, i) => `${x(i)},${y(d[k])}`).join(" ");
  const meio = Math.round(max / 2);
  const total = dados.reduce((s, d) => s + d.recebidas, 0);

  const mover = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !n) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    setFoco(Math.max(0, Math.min(n - 1, Math.round((px - PX) / (passo || 1)))));
  };
  const ativo = foco != null ? dados[foco] : null;

  return (
    <div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-[170px] overflow-visible"
        preserveAspectRatio="none"
        onMouseMove={mover}
        onMouseLeave={() => setFoco(null)}
        role="img"
        aria-label={`Entrevistas recebidas e revisadas: ${total} recebidas no período`}
      >
        {[0, meio, max].map((g) => (
          <g key={g}>
            <line x1="0" x2={W} y1={y(g)} y2={y(g)} stroke="hsl(var(--border))" strokeDasharray={g ? "3 4" : ""} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {n > 1 && (
          <>
            <polygon points={`${x(0)},${y(0)} ${pts("recebidas")} ${x(n - 1)},${y(0)}`} fill={PRETO} opacity="0.05" />
            <polyline points={pts("recebidas")} fill="none" stroke={PRETO} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <polyline points={pts("revisadas")} fill="none" stroke={AMBAR} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </>
        )}
        {ativo && (
          <line x1={x(foco)} x2={x(foco)} y1={PY / 2} y2={y(0)} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* Pontos em HTML para não distorcerem com o preserveAspectRatio */}
      <div className="relative h-0">
        {ativo && ["recebidas", "revisadas"].map((k) => (
          <span
            key={k}
            className="absolute w-2.5 h-2.5 rounded-full border-2 border-card -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${(x(foco) / W) * 100}%`, top: `${(y(ativo[k]) / H) * 170 - 170}px`, background: k === "recebidas" ? PRETO : AMBAR }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1.5 px-0.5">
        {dados.map((d, i) => (
          <span key={i} className={`text-[10.5px] capitalize ${foco === i ? "text-foreground font-medium" : "text-muted-foreground"}`}>{d.rotulo}</span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-2 h-4">
        {ativo ? (
          <><span className="text-foreground font-medium">{ativo.titulo.charAt(0).toUpperCase() + ativo.titulo.slice(1)}</span> · {ativo.recebidas} recebidas · {ativo.revisadas} revisadas</>
        ) : total ? "Passe o mouse no gráfico para ver cada período" : "Nenhuma entrevista no período"}
      </p>
    </div>
  );
}

/** Legenda das duas linhas. */
export function LegendaFluxo() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] bg-foreground inline-block" />recebidas</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] bg-primary inline-block" />revisadas</span>
    </div>
  );
}

/** Funil horizontal com porcentagem sobre a primeira etapa. */
export function Funil({ etapas = [] }) {
  const base = etapas[0]?.valor || 0;
  return (
    <ul className="space-y-3">
      {etapas.map((e) => (
        <li key={e.rotulo}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-foreground/85">{e.rotulo}</span>
            <span>
              <span className="font-semibold text-foreground tabular-nums">{e.valor}</span>
              {base > 0 && <span className="text-muted-foreground ml-1.5 tabular-nums">{Math.round((e.valor / base) * 100)}%</span>}
            </span>
          </div>
          <div className="h-2 mt-1.5 bg-secondary rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${e.cor}`} style={{ width: base ? `${(e.valor / base) * 100}%` : 0 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Barra única dividida (parte do todo) + legenda com contagem. */
export function BarraSegmentada({ itens = [] }) {
  const total = itens.reduce((s, i) => s + i.valor, 0);
  if (!total) return <p className="text-xs text-muted-foreground py-2">Sem dados no período</p>;
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px]">
        {itens.map((i) => (
          <span key={i.rotulo} title={`${i.rotulo}: ${i.valor}`} style={{ flex: i.valor, background: i.cor }} />
        ))}
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
        {itens.map((i) => (
          <li key={i.rotulo} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: i.cor }} />
            <span className="text-foreground/85 truncate">{i.rotulo}</span>
            <span className="ml-auto font-semibold text-foreground tabular-nums">{i.valor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
