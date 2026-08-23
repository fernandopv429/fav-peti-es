import React, { useState } from 'react';
import { Loader2, ShieldCheck, AlertTriangle, Info, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { verificarCoerencia } from '@/features/entrevista/lib/auditoria';

// ============================================================
// Painel de checagem de erros da minuta: roda a auditoria de
// coerência (que APONTA problemas, não reescreve) e lista os
// alertas por severidade. A correção é feita selecionando o
// trecho no documento e comentando.
// ============================================================
const ESTILO = {
  BLOQUEANTE: { icon: XCircle, cls: 'text-destructive', bg: 'bg-destructive/10' },
  ATENCAO: { icon: AlertTriangle, cls: 'text-warning', bg: 'bg-warning/10' },
  INFO: { icon: Info, cls: 'text-muted-foreground', bg: 'bg-muted' },
};

export default function AuditoriaMinuta({ caso, dados, textoEntrevista, documentoTexto }) {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(true);

  const analisar = async () => {
    setLoading(true);
    setErro('');
    try {
      const res = await verificarCoerencia({
        texto: textoEntrevista,
        caso,
        dados,
        documentoTexto,
      });
      setResultado(res);
      setAberto(true);
    } catch (e) {
      console.error(e);
      setErro(e?.message || 'Não foi possível concluir a análise.');
    }
    setLoading(false);
  };

  const alertas = resultado?.alertas || [];

  return (
    <div className="mb-4 bg-card border border-border rounded-xl">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <ShieldCheck className="w-4 h-4 text-primary-ink" />
        <span className="text-sm font-medium text-foreground flex-1">Checagem de erros</span>
        {resultado && (
          <button
            onClick={() => setAberto((v) => !v)}
            className="p-1 text-muted-foreground hover:text-foreground"
            title={aberto ? 'Recolher' : 'Expandir'}
          >
            {aberto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
        <button
          onClick={analisar}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-primary text-primary-ink rounded-lg text-xs font-medium hover:bg-primary/10 transition-colors disabled:opacity-40"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          {loading ? 'Analisando...' : resultado ? 'Analisar de novo' : 'Analisar a peça'}
        </button>
      </div>

      {erro && <p className="px-3 pb-3 text-xs text-destructive">{erro}</p>}

      {resultado && aberto && (
        <div className="px-3 pb-3 space-y-1.5">
          <p className="text-[11px] text-muted-foreground">
            {alertas.length === 0
              ? 'Nenhum problema apontado.'
              : `${alertas.length} ponto(s) apontado(s) — status: ${resultado.status}.`}
          </p>
          {alertas.map((a, i) => {
            const e = ESTILO[a.severidade] || ESTILO.INFO;
            return (
              <div key={i} className={`flex gap-2 p-2.5 rounded-lg ${e.bg}`}>
                <e.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${e.cls}`} />
                <div className="min-w-0">
                  <p className="text-xs text-foreground">{a.descricao}</p>
                  {a.sugestao && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">Sugestão: {a.sugestao}</p>
                  )}
                </div>
              </div>
            );
          })}
          {alertas.length > 0 && (
            <p className="text-[11px] text-muted-foreground/80 pt-1">
              Para corrigir um capítulo, selecione o trecho no documento abaixo e escreva o comentário.
            </p>
          )}
        </div>
      )}
    </div>
  );
}