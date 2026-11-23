import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

export default function UsuariosAcessos() {
  const [me, setMe] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [edicao, setEdicao] = useState({});
  const [email, setEmail] = useState('');
  const [salvando, setSalvando] = useState(null);
  const { toast } = useToast();

  useEffect(() => { carregar(); }, []);

  const carregar = async () => {
    const eu = await base44.auth.me();
    setMe(eu);
    if (eu?.role !== 'admin') return;
    const [us, gs] = await Promise.all([base44.entities.User.list(), base44.entities.GrupoFuncao.list()]);
    setUsuarios(us);
    setGrupos(gs.filter((g) => g.ativo !== false).map((g) => g.nome));
    setEdicao(Object.fromEntries(us.map((u) => [u.id, u.grupos_visiveis || []])));
  };

  const alternar = (uid, g) => {
    setEdicao((e) => {
      const atual = e[uid] || [];
      return { ...e, [uid]: atual.includes(g) ? atual.filter((x) => x !== g) : [...atual, g] };
    });
  };

  const salvar = async (uid) => {
    setSalvando(uid);
    try {
      await base44.functions.invoke('salvarAcessoUsuario', { user_id: uid, grupos: edicao[uid] || [] });
      toast({ title: 'Acessos salvos' });
      carregar();
    } catch (e) {
      toast({ title: 'Erro ao salvar acessos', variant: 'destructive' });
    } finally {
      setSalvando(null);
    }
  };

  const convidar = async () => {
    if (!email) return;
    try {
      await base44.users.inviteUser(email, 'user');
      toast({ title: 'Convite enviado', description: 'Depois que a pessoa entrar, marque os grupos dela aqui.' });
      setEmail('');
      carregar();
    } catch (e) {
      toast({ title: 'Erro ao convidar', variant: 'destructive' });
    }
  };

  if (me && me.role !== 'admin') {
    return <div className="p-8 text-slate-600">Apenas administradores acessam esta tela.</div>;
  }

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-semibold text-slate-900">Usuários e acessos</h1>
      <p className="text-sm text-slate-500 mt-1">
        Marque os grupos de função que cada usuário enxerga. Administradores veem tudo; usuário sem grupo vê só o que ele mesmo criou.
      </p>

      <div className="flex gap-2 mt-6">
        <Input placeholder="E-mail para convidar" value={email} onChange={(e) => setEmail(e.target.value)} className="max-w-sm" />
        <Button onClick={convidar}>Convidar</Button>
      </div>

      <div className="mt-6 space-y-3">
        {usuarios.map((u) => (
          <div key={u.id} className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900">{u.full_name || u.email}</div>
                <div className="text-xs text-slate-500">{u.email}</div>
              </div>
              {u.role === 'admin' ? (
                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded">Administrador — vê tudo</span>
              ) : (
                <Button size="sm" onClick={() => salvar(u.id)} disabled={salvando === u.id}>
                  {salvando === u.id ? 'Salvando...' : 'Salvar'}
                </Button>
              )}
            </div>
            {u.role !== 'admin' && (
              <div className="flex flex-wrap gap-2 mt-3">
                {grupos.map((g) => {
                  const ativo = (edicao[u.id] || []).includes(g);
                  return (
                    <button
                      key={g}
                      onClick={() => alternar(u.id, g)}
                      className={`text-sm px-3 py-1 rounded-full border ${ativo ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300'}`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
