/**
 * PetitionLetterhead — cabeçalho e rodapé do papel timbrado.
 *
 * CABEÇALHO: apenas o logo_url (imagem composta que já contém o nome do escritório).
 *   - cabecalho_texto NÃO é renderizado (evita duplicar o nome que já está na imagem).
 *
 * RODAPÉ: imagem papel_timbrado_url como faixa de largura total.
 *   - Fallback: rodape_texto como texto simples.
 */
export function LetterheadHeader({ config }) {
  if (!config) return null;
  if (!config.logo_url) return null;

  return (
    <div className="letterhead-header text-center border-b border-border pb-4 mb-6">
      <img
        src={config.logo_url}
        alt={config.escritorio || "Logo"}
        className="mx-auto object-contain"
        style={{ maxHeight: "90px" }}
        crossOrigin="anonymous"
      />
    </div>
  );
}

export function LetterheadFooter({ config }) {
  if (!config) return null;

  // Preferência: imagem de rodapé (papel_timbrado_url)
  if (config.papel_timbrado_url) {
    return (
      <div className="letterhead-footer mt-8">
        <img
          src={config.papel_timbrado_url}
          alt="Rodapé"
          className="w-full object-contain block"
          crossOrigin="anonymous"
        />
      </div>
    );
  }

  // Fallback: texto
  if (config.rodape_texto) {
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

  return null;
}