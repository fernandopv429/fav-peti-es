/**
 * PetitionRenderer — renderizador padrão FAV para todas as petições.
 *
 * Padrão obrigatório: Arial 12pt, entrelinhas 1,5, justificado, recuo 3cm,
 * títulos em CAIXA ALTA + negrito + sublinhado, pedidos em minúsculas + negrito,
 * ementas recuadas 4cm, fecho centralizado, sem itálico forçado.
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
 * Lógica de classificação — nunca altera o texto, apenas decide o estilo.
 */
function classifyLine(line) {
  const t = line.trim();
  if (!t) return { type: "empty" };

  // Ementa: linha que começa com ">"
  if (t.startsWith(">")) return { type: "ementa", text: t.slice(1).trim() };

  // Fecho: linha que começa com fórmulas de encerramento
  if (/^(nestes termos|pede deferimento|e\.e\.d\.|termos em que|a\.e\.d\.|nesses termos)/i.test(t))
    return { type: "fecho", text: t };

  // Remove marcações Markdown para análise
  const noMd = t.replace(/\*\*(.*?)\*\*/g, "$1").replace(/^#{1,6}\s+/, "");

  // Título: tudo maiúsculo (após remover numeração), mínimo 4 chars
  // Aceita: "I – DOS FATOS", "1. DO DIREITO", "DA RESCISÃO INDIRETA"
  const stripped = noMd.replace(/^[\d\.ivxlcIVXLC]+[\.\s\u2013\-]+\s*/, "").trim();
  if (stripped.length > 3 && stripped === stripped.toUpperCase()) {
    return { type: "heading", text: noMd };
  }

  // Pedido: linha que começa com letra/número/romano + ) ou letra/número + .
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

        if (cl.type === "pedido") {
          // Pedidos: minúsculas + negrito
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

        // Corpo padrão: recuo 3cm, justificado
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