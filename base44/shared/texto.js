// ============================================================
// Limpeza de texto que vai para a peça, compartilhada pelos dois caminhos.
//
// O travessão (—) chegava à peça por TRÊS portas, e o sanitizador dos blocos de
// IA só cobria uma:
//   1. prosa redigida pela IA          -> sanitizarValoresIA (já cobria)
//   2. relato da entrevista            -> narrativaDanoMoral devolve
//      `caso.dano_fatos` LITERALMENTE quando tem 80+ caracteres, e o relato do
//      formulário costuma vir com travessão
//   3. campos do formulário            -> DESVIO_ATIVIDADES, ACUMULO_ATIVIDADES
//      e afins são copiados direto para os tokens do modelo
//
// Por isso os capítulos de dano moral e de desvio continuavam com travessão
// mesmo depois de a regra entrar no prompt e no sanitizador da IA: aquele texto
// nunca foi da IA, é do cliente.
// ============================================================

// Só o travessão (U+2014/U+2015). O traço médio (–, U+2013) FICA: o modelo .docx
// o usa em títulos ("DOS HONORÁRIOS ADVOCATÍCIOS – SUCUMBÊNCIA").
export function removerTravessoes(texto) {
  if (!texto || typeof texto !== 'string') return texto;
  if (!/[—―]/.test(texto)) return texto;
  return texto
    // Antes de conjunção não entra vírgula ("aviso prévio — e demais verbas"
    // viraria "aviso prévio, e demais verbas"): ali o travessão só desaparece.
    .replace(/\s*[—―]\s*(?=(?:e|ou)\s)/g, ' ')
    .replace(/\s*[—―]\s*/g, ', ')
    // Travessão usado como marcador no início da linha não deixa vírgula órfã.
    .replace(/^\s*,\s*/gm, '')
    .replace(/,\s*([.;:)])/g, '$1')
    .replace(/([,;])\s*\1+/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;:])/g, '$1');
}

// Passa removerTravessoes em TODO valor de texto de um mapa de tokens. É a rede
// final: qualquer token alimentado pela entrevista sai limpo, sem depender de
// lembrar de tratar cada campo novo.
export function limparTravessoesDosDados(dados) {
  if (!dados || typeof dados !== 'object') return dados;
  for (const [k, v] of Object.entries(dados)) {
    if (typeof v === 'string') dados[k] = removerTravessoes(v);
    else if (Array.isArray(v)) dados[k] = v.map((x) => (typeof x === 'string' ? removerTravessoes(x) : x));
  }
  return dados;
}
