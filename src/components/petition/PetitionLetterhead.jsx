/**
 * PetitionLetterhead — cabeçalho e rodapé do papel timbrado do escritório.
 * Usado na visualização e é injetado no HTML de impressão/PDF.
 */
export function LetterheadHeader({ config }) {
  if (!config) return null;
  return (
    <div className="letterhead-header text-center border-b border-border pb-4 mb-6 print:mb-8">
      {config.logo_url && (
        <img
          src={config.logo_url}
          alt={config.escritorio}
          className="mx-auto mb-3 max-h-20 object-contain"
          crossOrigin="anonymous"
        />
      )}
      {config.cabecalho_texto ? (
        <div className="text-sm text-muted-foreground whitespace-pre-line leading-snug">
          {config.cabecalho_texto}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">{config.escritorio}</p>
          {config.advogado_principal && <p>{config.advogado_principal} — OAB/{config.uf_oab} {config.oab}</p>}
        </div>
      )}
    </div>
  );
}

export function LetterheadFooter({ config }) {
  if (!config || !config.rodape_texto) return null;
  return (
    <div className="letterhead-footer border-t border-border pt-4 mt-6 print:mt-8 text-center text-xs text-muted-foreground whitespace-pre-line leading-snug">
      {config.rodape_texto}
    </div>
  );
}