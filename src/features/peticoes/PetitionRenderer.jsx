/**
 * PetitionRenderer — renderizador padrão FAV para todas as petições.
 *
 * Padrão obrigatório: Arial 12pt, entrelinhas 1,5, justificado, recuo 3cm,
 * títulos em CAIXA ALTA + negrito + sublinhado, pedidos em minúsculas + negrito,
 * ementas recuadas 4cm, fecho centralizado, sem itálico forçado.
 *
 * Marcadores especiais emitidos pelo generatePetition:
 *   __LOGO__:<url>       → renderiza como imagem de logo centrada (cabeçalho)
 *   __RODAPE_IMG__:<url> → renderiza como imagem de rodapé (largura total)
 *
 * Aplica-se a TODA peça gerada, qualquer que seja o modelo/template.
 * NÃO altera conteúdo — apenas formata visualmente.
 */

const FAV_BODY_STYLE = {
  fontFamily: "Arial, sans-serif",
  fontSize: "12pt",
  lineHeight: 1.5,
  textAlign: "justify",
};

/**
 * Classifica uma linha de texto para aplicar o estilo correto.
 */
function classifyLine(line) {
  const t = line.trim();
  if (!t) return { type: "empty" };

  // Marcadores especiais de imagem
  if (t.startsWith("__LOGO__:")) return { type: "logo", url: t.slice(9).trim() };
  if (t.startsWith("__RODAPE_IMG__:")) return { type: "rodape_img", url: t.slice(15).trim() };

  // Separadores de seção (linha de traços)
  if (/^[─\-]{10,}$/.test(t)) return { type: "separator" };

  // Ementa: linha que começa com ">"
  if (t.startsWith(">")) return { type: "ementa", text: t.slice(1).trim() };

  // Fecho: linha que começa com fórmulas de encerramento
  if (/^(nestes termos|pede deferimento|e\.e\.d\.|termos em que|a\.e\.d\.|nesses termos)/i.test(t))
    return { type: "fecho", text: t };

  // Remove marcações Markdown para análise
  const noMd = t.replace(/\*\*(.*?)\*\*/g, "$1").replace(/^#{1,6}\s+/, "");

  // Título: tudo maiúsculo (após remover numeração), mínimo 4 chars
  const stripped = noMd.replace(/^[\d\.ivxlcIVXLC]+[\.\s\u2013\-]+\s*/, "").trim();
  if (stripped.length > 3 && stripped === stripped.toUpperCase()) {
    return { type: "heading", text: noMd };
  }

  // Pedido: linha que começa com letra/número/romano + )
  if (/^([a-z]\)|[ivxlc]+\)|\d+\.\s)/i.test(noMd.replace(/^\*\*/, "")))
    return { type: "pedido", text: noMd };

  return { type: "body", raw: line.trim(), text: noMd };
}

/**
 * Renderiza trechos **negrito** dentro de uma string.
 */
function renderInline(raw) {
  const parts = (raw || "").split(/(\*\*.*?\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p.replace(/^#{1,6}\s+/, "")}</span>
  );
}

export default function PetitionRenderer({ content }) {
  if (!content) return null;

  const lines = content.split("\n");

  return (
    <div style={FAV_BODY_STYLE} className="petition-content">
      {lines.map((line, idx) => {
        const cl = classifyLine(line);

        if (cl.type === "empty") return <br key={idx} />;

        // ── Marcadores de imagem ──────────────────────────────────────────
        if (cl.type === "logo") {
          return (
            <div key={idx} style={{ textAlign: "center", marginBottom: "12px" }}>
              <img
                src={cl.url}
                alt="Logo do escritório"
                style={{ maxHeight: "90px", maxWidth: "100%", display: "inline-block" }}
                crossOrigin="anonymous"
              />
            </div>
          );
        }

        if (cl.type === "rodape_img") {
          return (
            <div key={idx} style={{ marginTop: "16px" }}>
              <img
                src={cl.url}
                alt="Rodapé do escritório"
                style={{ width: "100%", display: "block" }}
                crossOrigin="anonymous"
              />
            </div>
          );
        }

        // ── Separador ─────────────────────────────────────────────────────
        if (cl.type === "separator") {
          return <hr key={idx} style={{ border: "none", borderTop: "1px solid #ccc", margin: "0.8em 0" }} />;
        }

        // ── Títulos ───────────────────────────────────────────────────────
        if (cl.type === "heading") {
          return (
            <p
              key={idx}
              style={{
                textAlign: "center",
                fontWeight: "bold",
                textTransform: "uppercase",
                textDecoration: "underline",
                margin: "1em 0 0.4em",
                fontFamily: "Arial, sans-serif",
                fontSize: "12pt",
                lineHeight: 1.5,
              }}
            >
              {cl.text.replace(/\*\*/g, "")}
            </p>
          );
        }

        // ── Ementas ───────────────────────────────────────────────────────
        if (cl.type === "ementa") {
          return (
            <p
              key={idx}
              style={{
                marginLeft: "4cm",
                textAlign: "justify",
                marginBottom: "0.4em",
                fontStyle: "normal",
                fontFamily: "Arial, sans-serif",
                fontSize: "12pt",
                lineHeight: 1.5,
              }}
            >
              {renderInline(cl.text)}
            </p>
          );
        }

        // ── Fecho ─────────────────────────────────────────────────────────
        if (cl.type === "fecho") {
          return (
            <p
              key={idx}
              style={{
                textAlign: "center",
                marginTop: "1em",
                marginBottom: "0.4em",
                fontFamily: "Arial, sans-serif",
                fontSize: "12pt",
                lineHeight: 1.5,
              }}
            >
              {renderInline(cl.text.replace(/\*\*/g, ""))}
            </p>
          );
        }

        // ── Pedidos ───────────────────────────────────────────────────────
        if (cl.type === "pedido") {
          const pedidoText = cl.text.replace(/\*\*/g, "").toLowerCase();
          return (
            <p
              key={idx}
              style={{
                textAlign: "justify",
                textIndent: "3cm",
                fontWeight: "bold",
                marginBottom: "0.3em",
                fontFamily: "Arial, sans-serif",
                fontSize: "12pt",
                lineHeight: 1.5,
              }}
            >
              {pedidoText}
            </p>
          );
        }

        // ── Corpo padrão ──────────────────────────────────────────────────
        return (
          <p
            key={idx}
            style={{
              textAlign: "justify",
              textIndent: "3cm",
              marginBottom: "0.3em",
              fontFamily: "Arial, sans-serif",
              fontSize: "12pt",
              lineHeight: 1.5,
            }}
          >
            {renderInline(cl.raw || cl.text)}
          </p>
        );
      })}
    </div>
  );
}