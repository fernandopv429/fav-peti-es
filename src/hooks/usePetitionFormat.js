export function getPetitionFormat(config) {
  return {
    font: config?.fonte || "Times New Roman",
    fontSize: config?.tamanho_fonte || 12,
    lineHeight: config?.espacamento_linhas || 1.5,
    marginTop: config?.margem_superior ?? 3,
    marginBottom: config?.margem_inferior ?? 2,
    marginLeft: config?.margem_esquerda ?? 3,
    marginRight: config?.margem_direita ?? 2,
  };
}

export function getPetitionViewStyle(config) {
  const f = getPetitionFormat(config);
  return {
    fontFamily: `"${f.font}", "Times New Roman", serif`,
    fontSize: `${f.fontSize}pt`,
    lineHeight: f.lineHeight,
    textAlign: "justify",
  };
}