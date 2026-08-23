import { useMemo, useState } from 'react';
import { FileText, Library, Search } from 'lucide-react';
import { TIPO_DISPENSA_LABELS } from '@/features/entrevista/lib/tokens';

const RITO_LABEL = { ordinario: 'Ordinário', sumarissimo: 'Sumaríssimo' };

function Badge({ children, tone = 'blue' }) {
  const cls = {
    blue: 'bg-primary/10 text-primary-ink',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
  }[tone];
  return <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${cls}`}>{children}</span>;
}

// Texto pesquisável de um modelo de referência.
export const textoBusca = (m) =>
  [m.titulo, m.funcao, m.sindicato, m.comarca_uf, m.diferencial, m.resumo, ...(m.teses || [])]
    .filter(Boolean).join(' ').toLowerCase();

// Lista da biblioteca de referências, com busca por palavra-chave.
export default function ListaModelosReferencia({ modelos = [] }) {
  const [busca, setBusca] = useState('');
  const termo = busca.trim().toLowerCase();
  const filtrados = useMemo(
    () => (termo ? modelos.filter((m) => textoBusca(m).includes(termo)) : modelos),
    [modelos, termo],
  );

  if (!modelos.length) {
    return (
      <div className="text-center py-16 bg-white border border-border rounded-xl">
        <Library className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground">Nenhum modelo de referência ainda</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Importe arquivos .docx para começar</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar precedente por título, função, tese ou comarca..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-white text-sm focus:border-primary focus:outline-none"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {filtrados.length} de {modelos.length} modelo(s)
      </p>

      {filtrados.length === 0 ? (
        <div className="text-center py-10 bg-white border border-border rounded-xl text-sm text-muted-foreground">
          Nenhum modelo encontrado para “{busca}”.
        </div>
      ) : (
        filtrados.map((m) => (
          <div key={m.id} className="bg-white border border-border rounded-xl p-4">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-primary-ink flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{m.titulo}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {m.funcao && <Badge>{m.funcao}</Badge>}
                  {m.rito && <Badge>{RITO_LABEL[m.rito] || m.rito}</Badge>}
                  {m.tipo_dispensa && <Badge>{TIPO_DISPENSA_LABELS[m.tipo_dispensa]?.split('(')[0]?.trim() || m.tipo_dispensa}</Badge>}
                  {m.tem_tomadora && <Badge>Tomadora (Súm. 331)</Badge>}
                  {m.diferencial ? <Badge tone="green">Diferencial extraído</Badge> : <Badge tone="amber">Sem diferencial</Badge>}
                </div>
                {(m.teses || []).length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {(m.teses || []).slice(0, 8).join(' · ')}{(m.teses || []).length > 8 ? ' …' : ''}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}