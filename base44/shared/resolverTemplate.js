// ============================================================
// Resolucao do PetitionTemplate a partir do que o formulario externo
// envia. O emissor pode mandar um id pronto (template_id) ou apenas o
// nome do modelo escolhido (modelo_peticao), que raramente bate letra
// a letra com o cadastro — dai o casamento por palavras-chave.
// ============================================================

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'cct', 'tokenizado', 'docx', 'e']);

const tokens = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));

/**
 * @param {string} nome  nome do modelo enviado no payload (ex: "Porteiro/Controlador - SINDEEPRES")
 * @param {Array}  lista PetitionTemplate[]
 * @returns {object|null} template com maior sobreposicao de palavras-chave
 */
export function resolverTemplatePorNome(nome, lista) {
  const alvo = tokens(nome);
  if (!alvo.length || !Array.isArray(lista)) return null;

  let melhor = null;
  let melhorScore = 0;
  for (const t of lista) {
    const cand = tokens(t.name);
    const score = alvo.filter((a) => cand.includes(a)).length;
    if (score > melhorScore) { melhorScore = score; melhor = t; }
  }
  // exige pelo menos duas palavras em comum para nao casar por acidente
  return melhorScore >= 2 ? melhor : null;
}