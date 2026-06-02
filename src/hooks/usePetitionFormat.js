/**
 * Lê os valores de formatação diretamente do PetitionConfig.
 * Sem fallbacks fixos — os padrões aqui devem corresponder aos defaults da entidade.
 */
export function getPetitionFormat(config) {
  const c = config || {};
  return {
    font:         c.fonte              ?? "Arial",
    fontSize:     c.tamanho_fonte      ?? 12,
    lineHeight:   c.espacamento_linhas ?? 1.5,
    marginTop:    c.margem_superior    ?? 4,
    marginBottom: c.margem_inferior    ?? 2.5,
    marginLeft:   c.margem_esquerda    ?? 3,
    marginRight:  c.margem_direita     ?? 3,
    logoUrl:      c.logo_url           || "",
    headerText:   c.cabecalho_texto    || "",
    footerText:   c.rodape_texto       || "",
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