import { base44 } from '@/api/base44Client';
import { traceAiCall } from '@/features/entrevista/lib/sessionTrace';

// ============================================================
// REVISÃO ASSISTIDA DA MINUTA
// (1) localizarCampoDoTrecho: descobre a QUAL capítulo redigido pertence o
//     trecho que o advogado selecionou no preview.
// (2) corrigirTrechoIA: reescreve SÓ aquele capítulo, seguindo o comentário.
// Valores e dados das partes NÃO passam por aqui — continuam determinísticos.
// ============================================================

// Só texto redigido é reescrevível. Campos de dado/valor são corrigidos na
// origem (entrevista/cálculo), nunca na redação.
const REESCREVIVEL = /^(BLOCO_[A-Z0-9_]+|DANO_MORAL_FATO_ESPECIFICO)$/;

const normalizar = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^\wà-ÿ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function localizarCampoDoTrecho(dados = {}, trecho = '') {
  const alvo = normalizar(trecho);
  if (alvo.length < 12) return null;
  const candidatos = Object.entries(dados).filter(
    ([k, v]) => typeof v === 'string' && REESCREVIVEL.test(k) && v.trim().length > 40,
  );
  for (const [k, v] of candidatos) {
    if (normalizar(v).includes(alvo)) return k;
  }
  // O preview passa por correções de texto (travessões, duplicações), então o
  // trecho pode não casar inteiro — tenta pelo começo da seleção.
  const inicio = alvo.split(' ').slice(0, 8).join(' ');
  if (inicio.length >= 12) {
    for (const [k, v] of candidatos) {
      if (normalizar(v).includes(inicio)) return k;
    }
  }
  return null;
}

// Nome do capítulo como o advogado o conhece na peça.
export const ROTULO_CAPITULO = {
  BLOCO_JORNADA: 'Da jornada de trabalho',
  BLOCO_DANO_MORAL: 'Do dano moral',
  DANO_MORAL_FATO_ESPECIFICO: 'Do dano moral (fatos)',
  BLOCO_ENQUADRAMENTO: 'Do enquadramento funcional',
  BLOCO_MULTAS_CONVENCIONAIS: 'Das multas convencionais',
  BLOCO_INSALUBRIDADE: 'Da insalubridade',
  BLOCO_SUMULA_331: 'Da responsabilidade subsidiária',
  BLOCO_ESPINHA_RESCISAO: 'Da rescisão contratual',
};

// Capítulos redigidos presentes nesta peça — alimenta a escolha de tópico.
export function listarCapitulos(dados = {}) {
  return Object.entries(dados)
    .filter(([k, v]) => typeof v === 'string' && REESCREVIVEL.test(k) && v.trim().length > 40)
    .map(([campo, texto]) => ({
      campo,
      texto,
      rotulo: ROTULO_CAPITULO[campo] || campo.replace(/^BLOCO_/, '').replace(/_/g, ' ').toLowerCase(),
    }));
}

const CORRECAO_SCHEMA = {
  type: 'object',
  required: ['texto_corrigido'],
  properties: {
    texto_corrigido: { type: 'string' },
    resumo: { type: 'string' },
  },
};

export async function corrigirTrechoIA({ campo, textoAtual, trecho, comentario, caso }) {
  const prompt = `Você é advogado trabalhista sênior do escritório FAV e vai CORRIGIR um único capítulo de uma petição inicial já redigida.

CAPÍTULO ATUAL (campo ${campo}):
"""${textoAtual}"""

TRECHO SELECIONADO PELO ADVOGADO:
"""${trecho}"""

CORREÇÃO PEDIDA PELO ADVOGADO:
"""${comentario}"""

DADOS DO CASO (única fonte de fatos — nada pode ser inventado): ${JSON.stringify(caso || {})}

REGRAS:
- Reescreva o capítulo INTEIRO já corrigido, mantendo o que estava correto.
- Não invente fatos, datas, valores, cláusulas de CCT ou jurisprudência que não estejam nos dados do caso.
- Não inclua valores em reais: os valores são calculados pelo sistema em outros campos.
- Estilo direto e técnico, parágrafos corridos, sem títulos, sem listas numeradas vazias.
- Proibido usar travessão (— ou –): use vírgula.
- Não repita o título do capítulo.

Responda APENAS com o JSON { "texto_corrigido": "...", "resumo": "o que foi alterado em uma frase" }.`;

  const request = { prompt, model: 'claude_sonnet_4_6', response_json_schema: CORRECAO_SCHEMA };
  return traceAiCall('Correção de trecho selecionado', request, () =>
    base44.integrations.Core.InvokeLLM(request),
  );
}