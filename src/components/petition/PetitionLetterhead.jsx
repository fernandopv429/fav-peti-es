/**
 * PetitionLetterhead — cabeçalho (logo + texto) e rodapé do papel timbrado.
 * Todos os valores lidos do PetitionConfig.
 */
export function LetterheadHeader({ config }) {
  if (!config) return null;
  const headerText = config.cabecalho_texto || [
    config.escritorio,
    config.advogado_principal
      ? `${config.advogado_principal} — OAB/${config.uf_oab || ""} ${config.oab || ""}`
      : "",
  ].filter(Boolean).join("\n");

  return (
    <div className="letterhead-header text-center border-b border-border pb-4 mb-6">
      {config.logo_url && (
        <img
          src={config.logo_url}
          alt={config.escritorio || "Logo"}
          className="mx-auto mb-3 max-h-20 object-contain"
          crossOrigin="anonymous"
        />
      )}
      {headerText && (
        <div
          className="text-sm text-muted-foreground whitespace-pre-line leading-snug"
          style={{ fontFamily: `"${config.fonte || "Arial"}", Arial, sans-serif` }}
        >
          {headerText}
        </div>
      )}
    </div>
  );
}

export function LetterheadFooter({ config }) {
  if (!config || !config.rodape_texto) return null;
  return (
    <div
      className="letterhead-footer border-t border-border pt-4 mt-8 text-center whitespace-pre-line leading-snug"
      style={{
        fontFamily: `"${config.fonte || "Arial"}", Arial, sans-serif`,
        fontSize: `${Math.max((config.tamanho_fonte || 12) - 2, 8)}pt`,
        color: "#555",
      }}
    >
      {config.rodape_texto}
    </div>
  );
}