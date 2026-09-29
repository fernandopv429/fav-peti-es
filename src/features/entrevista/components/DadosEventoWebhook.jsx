import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';

const GRUPOS = [
  ['Reclamante', /^(RECL_|nome_cliente|cpf|rg|pis|ctps|email|estado_civil|nacionalidade|data_nascimento|endereco_cliente)/i],
  ['Reclamadas', /^RECL\d_|reclamadas/i],
  ['Contrato', /ADMISSAO|RESCISAO|SALARIO|FUNCAO|cargo|dispensa|escala|jornada|ULTIMO_DIA/i],
  ['Jornada e intervalo', /horas_extras|periodo_|intervalo|folgas|FT_|VAL_FT|ft_|finais_semana|noturno/i],
];

const formatar = (v) => {
  if (v === true) return 'Sim';
  if (v === false) return 'Não';
  if (v && typeof v === 'object') return JSON.stringify(v, null, 1);
  return String(v);
};

// Mostra o payload recebido no webhook, agrupado por assunto.
export default function DadosEventoWebhook({ eventoId }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    base44.entities.WebhookEvento.get(eventoId)
      .then((ev) => setDados(ev?.payload?.data || ev?.payload || {}))
      .catch(() => setErro('Evento de origem não encontrado.'));
  }, [eventoId]);

  if (erro) return <p className="text-xs text-muted-foreground mt-2">{erro}</p>;
  if (!dados) return <Loader2 className="h-4 w-4 animate-spin mt-2 text-muted-foreground" />;

  const entradas = Object.entries(dados).filter(([, v]) => v != null && String(v).trim() !== '');
  const usados = new Set();
  const secoes = GRUPOS.map(([titulo, rx]) => {
    const itens = entradas.filter(([k]) => !usados.has(k) && rx.test(k));
    itens.forEach(([k]) => usados.add(k));
    return [titulo, itens];
  });
  secoes.push(['Outros', entradas.filter(([k]) => !usados.has(k))]);

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {secoes.filter(([, i]) => i.length).map(([titulo, itens]) => (
        <div key={titulo}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-ink mb-1">{titulo}</p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            {itens.map(([k, v]) => (
              <div key={k} className="text-xs min-w-0">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium break-words whitespace-pre-wrap">{formatar(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}