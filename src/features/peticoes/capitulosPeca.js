import { base44 } from '@/api/base44Client';

// ============================================================
// Capítulos da peça já gerada (texto puro): divisão por títulos
// em CAIXA ALTA e reescrita LIMITADA a um capítulo. Dados das
// partes e valores calculados nunca são recalculados aqui — a IA
// recebe o capítulo e devolve o mesmo capítulo reescrito.
// ============================================================

const ehTitulo = (linha) => {
  const t = linha.trim();
  if (!t || t.length > 120) return false;
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letras.length < 4) return false;
  return t === t.toUpperCase();
};

// [{ titulo, texto, inicio, fim }] — inicio/fim são índices de linha.
export function dividirCapitulos(conteudo = '') {
  const linhas = String(conteudo).split('\n');
  const caps = [];
  linhas.forEach((linha, i) => {
    if (!ehTitulo(linha)) return;
    if (caps.length) caps[caps.length - 1].fim = i - 1;
    caps.push({ titulo: linha.trim(), inicio: i, fim: linhas.length - 1 });
  });
  return caps
    .map((c) => ({ ...c, texto: linhas.slice(c.inicio, c.fim + 1).join('\n').trim() }))
    .filter((c) => c.texto.length > c.titulo.length + 40);
}

export function substituirCapitulo(conteudo, capitulo, textoNovo) {
  const linhas = String(conteudo).split('\n');
  return [
    ...linhas.slice(0, capitulo.inicio),
    ...String(textoNovo).trim().split('\n'),
    ...linhas.slice(capitulo.fim + 1),
  ].join('\n');
}

// Reescrita restrita ao capítulo, guiada pelo comentário do advogado.
export async function reescreverCapitulo({ capitulo, comentario, petition }) {
  const prompt = `Você é redator de petições trabalhistas de um escritório brasileiro.

Reescreva APENAS o capítulo abaixo da petição, atendendo à observação do advogado.

REGRAS ABSOLUTAS:
- Devolva somente o capítulo reescrito, começando pelo MESMO título: ${capitulo.titulo}
- NÃO altere nomes das partes, CPF/CNPJ, datas, salários, valores em R$ ou qualquer número já presente.
- Não invente fatos novos; não crie itens de lista vazios; não use travessões.
- Linguagem técnica, direta, parágrafos justificados, português do Brasil.

CONTEXTO DO CASO: ${petition?.claimant_name || ''} × ${petition?.defendant_name || ''}.

OBSERVAÇÃO DO ADVOGADO:
${comentario}

CAPÍTULO ATUAL:
${capitulo.texto}`;

  const res = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: 'object',
      properties: { texto: { type: 'string' } },
      required: ['texto'],
    },
  });
  const texto = (res?.texto || '').trim();
  if (!texto) throw new Error('A IA não devolveu texto para este capítulo.');
  return texto;
}