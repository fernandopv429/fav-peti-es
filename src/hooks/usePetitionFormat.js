/**
 * Lê os valores de formatação diretamente do PetitionConfig.
 */
export function getPetitionFormat(config) {
  const c = config || {};
  return {
    font:            c.fonte              ?? "Arial",
    fontSize:        c.tamanho_fonte      ?? 12,
    lineHeight:      c.espacamento_linhas ?? 1.5,
    marginTop:       c.margem_superior    ?? 3,
    marginBottom:    c.margem_inferior    ?? 1.8,
    marginLeft:      c.margem_esquerda    ?? 3,
    marginRight:     c.margem_direita     ?? 3,
    logoUrl:         c.logo_url           || "",
    // cabecalho_texto NÃO é usado no cabeçalho visual (o logo já contém o nome)
    headerText:      "",
    footerText:      c.rodape_texto       || "",
    footerImageUrl:  c.papel_timbrado_url || "",
  };
}

/** CSS inline para visualização na tela */
export function getPetitionViewStyle(config) {
  const f = getPetitionFormat(config);
  return {
    fontFamily: `"${f.font}", Arial, sans-serif`,
    fontSize:   `${f.fontSize}pt`,
    lineHeight: f.lineHeight,
    textAlign:  "justify",
  };
}