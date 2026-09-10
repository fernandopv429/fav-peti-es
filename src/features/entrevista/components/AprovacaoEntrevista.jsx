import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Envia ao sistema externo (formulário FAV) a aprovação ou reprovação da
// entrevista revisada. Reprovar exige motivo — pedido aqui mesmo.
export default function AprovacaoEntrevista({ casoId }) {
  const [enviando, setEnviando] = useState('');
  const [resultado, setResultado] = useState('');

  const enviar = async (status) => {
    if (enviando) return;
    let motivo = '';
    if (status === 'reprovado') {
      motivo = window.prompt('Motivo da reprovação:') || '';
      if (!motivo.trim()) return;
    }
    setEnviando(status);
    try {
      const res = await base44.functions.invoke('enviarAprovacaoEntrevista', {
        caso_id: casoId,
        status,
        motivo: motivo || undefined,
      });
      if (res?.data?.ok) {
        setResultado(status === 'aprovado' ? 'Aprovação enviada' : 'Reprovação enviada');
      } else {
        window.alert(`Não foi possível enviar: ${res?.data?.erro || 'erro desconhecido'}`);
      }
    } catch (e) {
      // O erro real vem no corpo da resposta (400 sem id da entrevista, 502 do
      // sistema externo). Sem isto o advogado só via "falha ao enviar".
      const d = e?.response?.data || e?.data;
      const motivoErro = d?.erro
        ? `${d.erro}${d.detalhe ? ` — ${JSON.stringify(d.detalhe)}` : ''}`
        : e?.message || 'falha na comunicação';
      window.alert(`Não foi possível enviar: ${motivoErro}`);
    } finally {
      setEnviando('');
    }
  };

  if (resultado) {
    return <span className="text-[11px] font-medium text-success whitespace-nowrap">{resultado}</span>;
  }

  return (
    <>
      <button
        onClick={() => enviar('aprovado')}
        disabled={!!enviando}
        title="Aprovar a entrevista no sistema externo"
        className="flex items-center gap-1.5 px-3 py-1.5 border border-success text-success rounded-lg text-xs font-medium hover:bg-success/10 transition-colors disabled:opacity-40"
      >
        {enviando === 'aprovado' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">Aprovar</span>
      </button>
      <button
        onClick={() => enviar('reprovado')}
        disabled={!!enviando}
        title="Reprovar a entrevista no sistema externo (informe o motivo)"
        className="flex items-center gap-1.5 px-3 py-1.5 border border-destructive text-destructive rounded-lg text-xs font-medium hover:bg-destructive/10 transition-colors disabled:opacity-40"
      >
        {enviando === 'reprovado' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsDown className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">Reprovar</span>
      </button>
    </>
  );
}