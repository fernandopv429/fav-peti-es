import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

// Textos que o mapeamento do webhook (mapearTipoDispensa) já reconhece.
const DISPENSAS = [
  ['sem_justa_causa', 'Sem justa causa'],
  ['rescisao_indireta', 'Rescisão indireta'],
  ['nulidade_pedido_demissao', 'Pedido de demissão (coação / nulidade)'],
  ['reversao_justa_causa', 'Justa causa (reversão)'],
  ['acordo', 'Acordo'],
];

// Identificação: [chave do form, campo do caso mapeado, rótulo, chaves do
// payload a gravar (a 1ª recebe o valor; as demais são limpas para o
// mapeamento não somar CEP/complemento antigos), largura total?]
const IDENT = [
  ['nome', 'recl_nome', 'Nome do reclamante', ['RECL_NOME'], true],
  ['cpf', 'recl_cpf', 'CPF', ['RECL_CPF']],
  ['rg', 'recl_rg', 'RG', ['RECL_RG']],
  ['pis', 'recl_pis', 'PIS', ['RECL_PIS']],
  ['ctps', 'recl_ctps', 'CTPS', ['RECL_CTPS']],
  ['endereco', 'recl_endereco', 'Endereço do reclamante (com CEP)', ['RECL_ENDERECO', 'RECL_CEP'], true],
  ['funcao', 'funcao', 'Função', ['FUNCAO'], true],
  ['r1nome', 'recl1_nome', '1ª reclamada', ['RECL1_NOME'], true],
  ['r1cnpj', 'recl1_cnpj', 'CNPJ da 1ª reclamada', ['RECL1_CNPJ']],
  ['r1end', 'recl1_logradouro', 'Endereço da 1ª reclamada', ['RECL1_LOGRADOURO', 'RECL1_ENDCOMPL', 'RECL1_CEP'], true],
  ['r2nome', 'recl2_nome', '2ª reclamada (tomadora)', ['RECL2_NOME'], true],
  ['r2cnpj', 'recl2_cnpj', 'CNPJ da 2ª reclamada', ['RECL2_CNPJ']],
];

const iso = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || '')) ? String(s).slice(0, 10) : '');
const campo = 'w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:border-primary';

// Completa ou corrige no app os dados da entrevista recebida. Grava no próprio
// evento do webhook (mesmos nomes de campo do Fav Sales) e reprocessa: a peça
// sai pelo mesmo caminho de sempre, sem lógica paralela.
export default function PreencherDadosCaso({ caso: c, onClose, onSalvo }) {
  const base = c?.analise_json?.caso || {};
  const pend = c?.analise_json?.pendencias_dados || [];
  const [f, setF] = useState({});
  const [inicial, setInicial] = useState({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!c) return;
    const v = {
      salario: base.salario ? String(base.salario).replace('.', ',') : '',
      admissao: iso(base.data_admissao),
      rescisao: base.data_rescisao_presumida ? '' : iso(base.data_rescisao),
      continua: Boolean(base.continua_trabalhando),
      escala: base.escala || '',
      horario: base.jornada_horario || '',
      dispensa: base.tipo_dispensa || '',
    };
    for (const [k, origem] of IDENT) v[k] = String(base[origem] ?? c[origem] ?? '');
    setF(v);
    setInicial(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id]);

  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const marca = (nome) => (pend.some((p) => p.startsWith(nome)) ? 'text-destructive' : 'text-muted-foreground');
  const mudou = (k) => String(f[k] ?? '') !== String(inicial[k] ?? '');

  const salvar = async () => {
    const eventoId = c?.analise_json?.evento_id;
    if (!eventoId) { toast.error('Este caso não tem o evento de origem.'); return; }
    if (c.status === 'pronto' && !window.confirm('Esta petição já foi confirmada. Salvar refaz a peça com os dados novos e ela volta para revisão. Continuar?')) return;
    setSalvando(true);
    try {
      const evento = await base44.entities.WebhookEvento.get(eventoId);
      const payload = evento?.payload || {};
      const novos = {};
      if (mudou('salario')) novos.SALARIO = f.salario.trim();
      if (mudou('admissao')) novos.DATA_ADMISSAO = f.admissao;
      if (f.continua) novos.DATA_RESCISAO = 'CONTINUA_TRABALHANDO';
      else if (mudou('rescisao') || mudou('continua')) novos.DATA_RESCISAO = f.rescisao;
      if (mudou('escala')) novos.escala = f.escala.trim();
      if (mudou('horario')) novos.JORNADA_HORARIO = f.horario.trim();
      if (mudou('dispensa')) novos.tipo_dispensa = DISPENSAS.find(([k]) => k === f.dispensa)?.[1] || '';
      for (const [k, , , chaves] of IDENT) {
        if (!mudou(k)) continue;
        chaves.forEach((ch, i) => { novos[ch] = i === 0 ? String(f[k]).trim() : ''; });
      }
      if (!Object.keys(novos).length) { toast.info('Nenhum dado foi alterado.'); setSalvando(false); return; }
      await base44.entities.WebhookEvento.update(eventoId, { payload: { ...payload, data: { ...(payload.data || {}), ...novos } } });
      const r = await base44.functions.invoke('gerarPecaWebhook', { evento_id: eventoId, forcar: true });
      if (r?.data?.error) throw new Error(r.data.error);
      if (r?.data?.aguardando_dados) toast.warning(`Ainda faltam: ${(r.data.pendencias || []).join(', ')}`);
      else toast.success('Dados salvos e peça gerada. Ela está na Fila.');
      onSalvo?.();
      onClose();
    } catch (e) {
      toast.error(e?.message || 'Não foi possível salvar os dados.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!c} onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Dados da entrevista · {c?.recl_nome || c?.titulo}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">Preencha ou corrija o que for preciso. Campos em vermelho chegaram vazios da entrevista. Ao salvar, a peça é gerada de novo.</p>
        <p className="label-caps">Contrato</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs space-y-1"><span className={marca('Salário')}>Salário-base (R$)</span>
            <input className={campo} value={f.salario || ''} onChange={set('salario')} placeholder="1.912,07" /></label>
          <label className="text-xs space-y-1"><span className={marca('Data de admissão')}>Admissão</span>
            <input type="date" className={campo} value={f.admissao || ''} onChange={set('admissao')} /></label>
          <label className="text-xs space-y-1"><span className={marca('Último dia')}>Último dia trabalhado</span>
            <input type="date" className={campo} value={f.rescisao || ''} onChange={set('rescisao')} disabled={f.continua} /></label>
          <label className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={!!f.continua} onChange={set('continua')} /> Continua trabalhando</label>
          <label className="text-xs space-y-1"><span className={marca('Escala')}>Escala</span>
            <input className={campo} value={f.escala || ''} onChange={set('escala')} placeholder="12x36" /></label>
          <label className="text-xs space-y-1"><span className={marca('Escala')}>Horário</span>
            <input className={campo} value={f.horario || ''} onChange={set('horario')} placeholder="19:00 às 07:00" /></label>
          <label className="col-span-2 text-xs space-y-1"><span className={marca('Tipo de dispensa')}>Tipo de dispensa</span>
            <select className={campo} value={f.dispensa || ''} onChange={set('dispensa')}>
              <option value="">Selecione</option>
              {DISPENSAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></label>
        </div>
        <p className="label-caps pt-1">Identificação das partes</p>
        <div className="grid grid-cols-2 gap-3">
          {IDENT.map(([k, , rotulo, , largo]) => (
            <label key={k} className={`text-xs space-y-1 ${largo ? 'col-span-2' : ''}`}><span className="text-muted-foreground">{rotulo}</span>
              <input className={campo} value={f[k] || ''} onChange={set(k)} /></label>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={salvando} className="text-xs px-3 py-1.5 border border-border rounded-md hover:bg-muted">Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground font-semibold rounded-md hover:brightness-95 disabled:opacity-50">
            {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {salvando ? 'Gerando a peça…' : 'Salvar e gerar peça'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}