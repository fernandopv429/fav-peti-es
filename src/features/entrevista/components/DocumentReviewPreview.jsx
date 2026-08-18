import React, { useEffect, useRef, useState } from 'react';

// ============================================================
// Preview paginado do .docx preenchido: o HTML (mammoth + dados) é
// medido num contêiner oculto com a MESMA largura/tipografia da folha
// e quebrado em páginas A4 (margens 3/2cm, Arial 12pt, 1,5, justificado)
// — a revisão fica visualmente igual ao documento exportado.
// ============================================================

// A4 a 96dpi
const PAGE_W = 794;   // 21,0cm
const PAGE_H = 1123;  // 29,7cm
const M_TOP = 113;    // 3cm
const M_BOTTOM = 76;  // 2cm
const M_LEFT = 113;   // 3cm
const M_RIGHT = 76;   // 2cm
const CONTENT_W = PAGE_W - M_LEFT - M_RIGHT;
const CONTENT_H = PAGE_H - M_TOP - M_BOTTOM;
const GAP = 24; // espaço entre folhas (era a classe gap-6)

const SHEET_CSS = `
.docx-content {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12pt;
  line-height: 1.5;
  text-align: justify;
  color: #1f2328;
  word-wrap: break-word;
}
.docx-content p { margin: 0 0 8pt 0; }
.docx-content h1, .docx-content h2, .docx-content h3, .docx-content h4 {
  font-size: 12pt; font-weight: 700; text-align: left; margin: 12pt 0 8pt 0;
}
.docx-content table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
.docx-content td, .docx-content th { border: 1px solid #c9ccd1; padding: 4pt 6pt; font-size: 11pt; }
.docx-content ul, .docx-content ol { margin: 0 0 8pt 0; padding-left: 24pt; }
.docx-content img { max-width: 100%; }
.docx-content mark.tpl-filled { background: #d3f2df; color: #0b5a30; padding: 0 2px; border-radius: 2px; }
.docx-content mark.tpl-pending { background: #fdeeba; color: #7a5a00; padding: 0 2px; border-radius: 2px; font-weight: 600; }
`;

export default function DocumentReviewPreview({ html, dimmed }) {
  const measurerRef = useRef(null);
  const wrapRef = useRef(null);
  const [pages, setPages] = useState([]);
  // ESCALA DA FOLHA. A paginação é medida a 605px de largura de conteúdo (a
  // largura real de uma A4 com margens de 3/2cm). Antes a folha era desenhada com
  // `width: 794px; maxWidth: 100%`: em qualquer painel mais estreito que isso ela
  // ENCOLHIA, o texto reflowava numa largura menor, passava a ocupar mais altura
  // do que a medida — e o miolo, com `maxHeight: PAGE_H` e `overflow: hidden`,
  // CORTAVA o excedente. Daí os capítulos aparecerem incompletos na revisão e
  // completos no .docx exportado, que não passa por este componente.
  //
  // Agora a folha mantém os 794px reais e é reduzida por transform: scale(), como
  // fazem os visualizadores de PDF. A proporção e a paginação continuam válidas;
  // só o tamanho aparente muda, e nada é cortado.
  const [escala, setEscala] = useState(1);
  const [larguraDisponivel, setLarguraDisponivel] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const medir = () => {
      const w = el.clientWidth;
      if (!w) return;
      setLarguraDisponivel(w);
      setEscala(Math.min(1, w / PAGE_W));
    };
    medir();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', medir);
      return () => window.removeEventListener('resize', medir);
    }
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = measurerRef.current;
    if (!el) return;
    el.innerHTML = html || '';
    const kids = Array.from(el.children);
    if (!kids.length) {
      setPages(html ? [html] : []);
      return;
    }
    const result = [];
    let cur = [];
    let start = 0;
    for (const k of kids) {
      const top = k.offsetTop;
      const bottom = top + k.offsetHeight;
      // Bloco não cabe no restante da página atual → nova página
      if (cur.length && bottom - start > CONTENT_H) {
        result.push(cur.join(''));
        cur = [];
        start = top;
      }
      cur.push(k.outerHTML);
    }
    if (cur.length) result.push(cur.join(''));
    setPages(result);
    el.innerHTML = '';
  }, [html]);

  return (
    <div className={`transition-opacity ${dimmed ? 'opacity-40' : 'opacity-100'}`}>
      <style>{SHEET_CSS}</style>

      {/* Medidor oculto: mesma largura e tipografia da folha */}
      <div
        ref={measurerRef}
        className="docx-content"
        style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', width: CONTENT_W, left: -99999, top: 0 }}
        aria-hidden="true"
      />

      {/* A altura do contêiner é a altura escalada: um elemento com transform
          continua ocupando o tamanho ORIGINAL no layout, o que deixaria um vão
          em branco embaixo e faria a folha de 794px estourar a largura do painel
          (voltando a barra de rolagem horizontal). */}
      <div
        ref={wrapRef}
        className="w-full"
        style={{ height: pages.length ? Math.round((pages.length * PAGE_H + (pages.length - 1) * GAP) * escala) : 0, overflow: 'hidden' }}
      >
      <div
        className="flex flex-col items-center"
        style={{
          width: PAGE_W,
          gap: GAP,
          transform: `scale(${escala})`,
          transformOrigin: 'top left',
          marginLeft: Math.max(0, Math.round((larguraDisponivel - PAGE_W * escala) / 2)),
        }}
      >
        {pages.map((pageHtml, i) => (
          <div
            key={i}
            className="relative bg-white shadow-[0_2px_12px_rgba(32,33,36,0.18)] rounded-[2px] flex-shrink-0"
            style={{ width: PAGE_W, minHeight: PAGE_H, maxWidth: '100%' }}
          >
            <div
              className="docx-content overflow-hidden"
              style={{
                padding: `${M_TOP}px ${M_RIGHT}px ${M_BOTTOM}px ${M_LEFT}px`,
                minHeight: PAGE_H - 1,
                maxHeight: PAGE_H,
              }}
              dangerouslySetInnerHTML={{ __html: pageHtml }}
            />
            <span className="absolute bottom-7 right-[76px] text-[10px] text-[#9aa0a6] select-none">
              {i + 1} / {pages.length}
            </span>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}