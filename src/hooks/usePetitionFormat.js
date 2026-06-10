/**
 * Lê os valores de formatação diretamente do PetitionConfig.
 * Padrão fixo FAV: Arial 12, espaçamento 1,5, margens 3,5/1,8/3,0/3,0 cm.
 */
export function getPetitionFormat(config) {
  const c = config || {};
  return {
    font:           "Arial",
    fontSize:       12,
    lineHeight:     1.5,
    marginTop:      3.5,
    marginBottom:   1.8,
    marginLeft:     3.0,
    marginRight:    3.0,
    firstIndent:    3.0,   // recuo de 1ª linha em cm
    logoUrl:        c.logo_url           || "",
    headerText:     c.cabecalho_texto   || "",
    footerText:     c.rodape_texto      || "",
    footerImageUrl: c.papel_timbrado_url || "",
  };
}

/** CSS inline para visualização na tela */
export function getPetitionViewStyle(config) {
  return {
    fontFamily: "Arial, sans-serif",
    fontSize:   "12pt",
    lineHeight: 1.5,
    textAlign:  "justify",
  };
}