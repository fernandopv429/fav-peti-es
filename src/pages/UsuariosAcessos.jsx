import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mail } from 'lucide-react';

/**
 * Usuários e acessos — mesmo padrão do Grupo S&C: o convite já grava os grupos
 * pelo e-mail (AcessoUsuario), a pessoa aparece na lista na hora e os grupos
 * são aplicados no primeiro acesso.
 */
export default function UsuariosAcessos() {
  const [me, setMe] = useState(null);
  const [linhas, setLinhas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [edicao, setEdicao] = useState({});
  const [convite, setConvite] = useState({ email: '', nome: '', grupos: [] });
  const [mensagem, setMensagem] = useState('');
  const [ocupado, setOcupado] = useState(null);

  useEffect(() => { carregar(); }, []);

  const carregar = async () => {
    const eu = await base44.auth.me();
    setMe(eu);
    if (eu?.role !== 'admin') return;
    const [us, acessos, gs] = await Promise.all([
      base44.entities.User.list(),
      base44.entities.AcessoUsuario.list(),
      base44.entities.GrupoFuncao.list(),
    ]);
    setGrupos(gs.filter((g) => g.ativo !== false).map((g) => g.nome));
    const porEmail = {};
    for (const a of acessos) porEmail[String(a.user_email).toLowerCase()] = a;
    const lista = us.map((u) => {
      const a = porEmail[String(u.email).toLowerCase()];
      return { email: u.email, nome: u.full_name || a?.user_nome || '', admin: u.role === 'admin', entrou: true, acesso: a };
    });
    const emails = new Set(lista.map((l) => String(l.email).toLowerCase()));
    for (const a of acessos) {
      if (a.ativo === false || emails.has(String(a.user_email).toLowerCase())) continue;
      lista.push({ email: a.user_email, nome: a.user_nome || '', admin: false, entrou: false, acesso: a });
    }
    setLinhas(lista);
    setEdicao(Object.fromEntries(lista.map((l) => [l.email, l.acesso?.ativo !== false ? (l.acesso?.grupos || []) : []])));
  };

  const alternar = (lista, g) => (lista.includes(g) ? lista.filter((x) => x !== g) : [...lista, g]);

  const gerenciar = (dados) => base44.functions.invoke('gerenciarAcessos', dados).then((r) => r?.data || r);

  const convidar = async () => {
    const email = convite.email.trim().toLowerCase();
    if (!email) return;
    if (!convite.grupos.length) {
      setMensagem('Marque pelo menos um grupo para a pessoa.');
      return;
    }
    setMensagem('');
    setOcupado('convite');
    try {
      await base44.users.inviteUser(email, 'user');
      const r = await gerenciar({ acao: 'salvar', user_email: email, user_nome: convite.nome, grupos: convite.grupos, enviar_boas_vindas: true });
      const bv = r?.boas_vindas === 'enviado' ? ' E-mail de boas-vindas enviado.' : ' O e-mail de boas-vindas não saiu agora; use "Reenviar boas-vindas" depois.';
      setMensagem(r?.error ? `Convite enviado, mas os grupos não foram salvos: ${r.error}` : `Convite enviado para ${email} com os grupos: ${convite.grupos.join(', ')}.${bv}`);
      setConvite({ email: '', nome: '', grupos: [] });
      carregar();
    } catch (e) {
      setMensagem(`Não foi possível convidar: ${e?.message || e}`);
    } finally {
      setOcupado(null);
    }
  };

  const salvar = async (l, enviar = false) => {
    setOcupado(l.email);
    try {
      const r = await gerenciar({ acao: 'salvar', user_email: l.email, user_nome: l.nome, grupos: edicao[l.email] || [], enviar_boas_vindas: enviar });
      if (r?.error) setMensagem(`Erro: ${r.error}`);
      else setMensagem(enviar
        ? (r?.boas_vindas === 'enviado' ? `Boas-vindas reenviado para ${l.email}.` : `Não foi possível reenviar agora para ${l.email}.`)
        : `Acessos de ${l.email} salvos.`);
      carregar();
    } finally {
      setOcupado(null);
    }
  };

  const remover = async (l) => {
    if (!window.confirm(`Remover o acesso de ${l.email}? A pessoa deixa de ver qualquer caso.`)) return;
    setOcupado(l.email);
    try {
      await gerenciar({ acao: 'remover', user_email: l.email });
      setMensagem(`Acesso de ${l.email} removido.`);
      carregar();
    } finally {
      setOcupado(null);
    }
  };

  const Chips = ({ selecionados, onToggle }) => (
    <div className="flex flex-wrap gap-2">
      {grupos.map((g) => {
        const ativo = selecionados.includes(g);
        return (
          <button key={g} type="button" onClick={() => onToggle(g)}
            className={`text-sm px-3 py-1 rounded-full border ${ativo ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300'}`}>
            {g}
          </button>
        );
      })}
    </div>
  );

  if (me && me.role !== 'admin') {
    return <div className="p-8 text-slate-600">Apenas administradores acessam esta tela.</div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <h1 className="text-2xl font-semibold text-slate-900">Usuários e acessos</h1>
      <p className="text-sm text-slate-500 mt-1">
        Convide a pessoa já com os grupos que ela vai enxergar. Os grupos valem a partir do primeiro acesso. Administradores veem tudo.
      </p>

      <section className="mt-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h2 className="font-medium text-slate-900">Novo convite</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input placeholder="E-mail" type="email" value={convite.email} onChange={(e) => setConvite({ ...convite, email: e.target.value })} />
          <Input placeholder="Nome (opcional)" value={convite.nome} onChange={(e) => setConvite({ ...convite, nome: e.target.value })} />
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-2">Grupos que a pessoa vai enxergar</div>
          <Chips selecionados={convite.grupos} onToggle={(g) => setConvite({ ...convite, grupos: alternar(convite.grupos, g) })} />
        </div>
        <Button onClick={convidar} disabled={ocupado === 'convite'}>
          {ocupado === 'convite' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
          Enviar convite
        </Button>
      </section>

      {mensagem && <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{mensagem}</p>}

      <section className="mt-6 space-y-3">
        {linhas.map((l) => (
          <article key={l.email} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium text-slate-900">{l.nome || l.email}</div>
                <div className="text-xs text-slate-500">{l.email}</div>
              </div>
              {l.admin ? (
                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded">Administrador — vê tudo</span>
              ) : l.entrou ? (
                <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded">Ativo</span>
              ) : (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">Aguardando primeiro acesso</span>
              )}
            </div>
            {!l.admin && (
              <>
                <div className="mt-3">
                  <Chips selecionados={edicao[l.email] || []} onToggle={(g) => setEdicao({ ...edicao, [l.email]: alternar(edicao[l.email] || [], g) })} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => salvar(l)} disabled={ocupado === l.email}>Salvar</Button>
                  {!l.entrou && (
                    <Button size="sm" variant="outline" onClick={() => salvar(l, true)} disabled={ocupado === l.email}>Reenviar boas-vindas</Button>
                  )}
                  {l.acesso && l.acesso.ativo !== false && (
                    <Button size="sm" variant="ghost" onClick={() => remover(l)} disabled={ocupado === l.email}>Remover acesso</Button>
                  )}
                </div>
              </>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
