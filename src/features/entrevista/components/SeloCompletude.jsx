import React, { useMemo } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { montarDadosTemplate } from '@/features/entrevista/lib/dadosTemplate';

// Monta os mesmos dados que preenchem a peça e conta os trechos que sairiam
// como pendência no documento ("[RG]", "[SALÁRIO]", "[VARA / CIDADE / REGIÃO]"...).
function pendenciasDaPeca(analise) {
  const dados = montarDadosTemplate({
    caso: analise.caso,
    calculos: analise.calculos || [],
    dadosReceita: analise.dadosReceita || [],
    dadosCep: analise.dadosCep || [],
  });
  const lista = Object.entries(dados)
    .filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && /^\[.*\]$/.test(v.trim()))
    .map(([, v]) => v.replace(/[[\]]/g, '').toLowerCase());
  if (analise.redacaoErro) lista.push('capítulos da IA com falha');
  return lista;
}

export default function SeloCompletude({ analise }) {
  const faltando = useMemo(() => (analise?.caso ? pendenciasDaPeca(analise) : null), [analise]);
  if (!faltando) return null;

  if (!faltando.length) {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-success/10 text-success text-[10px] font-semibold flex-shrink-0">
        <ShieldCheck className="h-3 w-3" /> Peça completa
      </span>
    );
  }
  return (
    <span
      title={`Pendências na peça: ${faltando.join(', ')}`}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-warning/10 text-warning text-[10px] font-semibold flex-shrink-0"
    >
      <AlertTriangle className="h-3 w-3" /> Peça com pendências ({faltando.length})
    </span>
  );
}