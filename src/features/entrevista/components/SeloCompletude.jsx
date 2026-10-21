import React from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

// Campos essenciais que o evento precisa trazer para a peça sair sem pendências.
const ESSENCIAIS = [
  ['recl_nome', 'nome'], ['recl_cpf', 'CPF'], ['recl_rg', 'RG'], ['recl_endereco', 'endereço'],
  ['recl1_nome', 'reclamada'], ['recl1_cnpj', 'CNPJ'], ['funcao', 'função'],
  ['data_admissao', 'admissão'], ['data_rescisao', 'rescisão'], ['jornada_horario', 'jornada'],
];

export default function SeloCompletude({ analise }) {
  const caso = analise?.caso;
  if (!caso) return null;
  const faltando = ESSENCIAIS.filter(([k]) => !caso[k]).map(([, r]) => r);
  if (caso.salario_origem && caso.salario_origem !== 'informado no evento') faltando.push('salário');
  if (analise.redacaoErro) faltando.push('redação IA');

  if (!faltando.length) {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-success/10 text-success text-[10px] font-semibold flex-shrink-0">
        <ShieldCheck className="h-3 w-3" /> Completa
      </span>
    );
  }
  return (
    <span
      title={`Faltando: ${faltando.join(', ')}`}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-warning/10 text-warning text-[10px] font-semibold flex-shrink-0"
    >
      <AlertTriangle className="h-3 w-3" /> Incompleta ({faltando.length})
    </span>
  );
}