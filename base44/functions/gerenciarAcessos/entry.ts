import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Acessos por grupo de função, no mesmo padrão do Grupo S&C:
 * o vínculo (AcessoUsuario) é gravado pelo e-mail no convite, antes de a pessoa existir,
 * e é aplicado no usuário assim que ele entra pela primeira vez.
 *
 * acao 'meus_acessos' (qualquer usuário logado): recalcula só os acessos de quem chamou.
 * acao 'salvar' | 'remover' (só admin): grava/remove o vínculo e recalcula.
 */
const ENDERECO = 'https://inicial.base44.app';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });
    const corpo = await req.json().catch(() => ({}));

    if (corpo.acao === 'meus_acessos') {
      return Response.json({ ok: true, acessos: await recalcular(base44, user.email) });
    }

    if (user.role !== 'admin') return Response.json({ error: 'Acesso restrito ao administrador' }, { status: 403 });

    const email = String(corpo.user_email || '').trim().toLowerCase();
    if (!email) return Response.json({ error: 'Informe o e-mail' }, { status: 400 });
    const existentes = await base44.asServiceRole.entities.AcessoUsuario.filter({ user_email: email });

    if (corpo.acao === 'remover') {
      for (const a of existentes) await base44.asServiceRole.entities.AcessoUsuario.update(a.id, { ativo: false, grupos: [], gerente: false });
      return Response.json({ ok: true, acessos: await recalcular(base44, email) });
    }

    if (corpo.acao === 'salvar') {
      const validos = (await base44.asServiceRole.entities.GrupoFuncao.list()).map((g) => g.nome);
      const grupos = (Array.isArray(corpo.grupos) ? corpo.grupos : []).filter((g) => validos.includes(g));
      const dados = { user_email: email, grupos, gerente: corpo.gerente === true, ativo: true, convidado_por: user.email };
      if (corpo.user_nome) dados.user_nome = String(corpo.user_nome).trim();
      if (existentes[0]) await base44.asServiceRole.entities.AcessoUsuario.update(existentes[0].id, dados);
      else await base44.asServiceRole.entities.AcessoUsuario.create(dados);
      const acessos = await recalcular(base44, email);

      let boas_vindas = 'nao_enviado';
      if (corpo.enviar_boas_vindas) {
        try {
          const nome = dados.user_nome || existentes[0]?.user_nome || '';
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: email,
            from_name: 'FAV Advogados',
            subject: assunto(nome),
            body: htmlBoasVindas(nome, email),
          });
          boas_vindas = 'enviado';
        } catch (e) {
          boas_vindas = 'falhou: ' + (e?.message || e);
        }
      }
      return Response.json({ ok: true, acessos, boas_vindas });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

/** Copia para o usuário os grupos do vínculo; sem vínculo ativo, o acesso fica fechado. */
async function recalcular(base44, emailBruto) {
  const email = String(emailBruto || '').toLowerCase();
  const vinculos = (await base44.asServiceRole.entities.AcessoUsuario.filter({ user_email: email }))
    .filter((v) => v.ativo !== false);
  const grupos = [...new Set(vinculos.flatMap((v) => v.grupos || []))];
  const gerente = vinculos.some((v) => v.gerente === true);
  const liberado = gerente || grupos.length > 0;
  const usuarios = await base44.asServiceRole.entities.User.filter({ email });
  if (!usuarios[0]) return { grupos, aviso: 'Usuário ainda não fez o primeiro acesso' };
  await base44.asServiceRole.entities.User.update(usuarios[0].id, {
    grupos_visiveis: grupos,
    ve_sem_categoria: gerente || grupos.includes('Sem categoria'),
    ve_todas: gerente,
    acesso_liberado: liberado,
  });
  return { grupos, gerente, acesso_liberado: liberado };
}

function esc(t) {
  return String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function assunto(nome) {
  const p = String(nome || '').trim().split(/\s+/)[0];
  return p ? `Bem-vindo(a) ao FAV Petições, ${p}` : 'Bem-vindo(a) ao FAV Petições';
}

function htmlBoasVindas(nome, email) {
  const p = String(nome || '').trim().split(/\s+/)[0];
  const link = `${ENDERECO}/primeiro-acesso?email=${encodeURIComponent(email)}`;
  return `<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f4f1ea;font-family:Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:#0f0f0f;padding:22px 32px;"><span style="color:#ffffff;font-size:20px;font-weight:bold;">FAV</span><span style="display:inline-block;width:6px;height:6px;border-radius:3px;background:#F0A500;margin:0 6px 2px;"></span><span style="color:#bdbdbd;font-size:14px;">Petições</span></td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 14px;font-size:22px;color:#111;">Boas-vindas${p ? `, ${esc(p)}` : ''}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#333;">Seu acesso ao <strong>FAV Petições</strong>, o sistema de iniciais trabalhistas da FAV Advogados, foi liberado.</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#333;">Para começar, crie sua senha com este e-mail (<strong>${esc(email)}</strong>). Vamos enviar um código de confirmação para você.</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:#F0A500;border-radius:8px;"><a href="${link}" style="display:inline-block;padding:14px 30px;color:#111;font-size:16px;font-weight:bold;text-decoration:none;">Criar minha senha</a></td></tr></table>
<p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#777;">Já tem senha? <a href="${ENDERECO}/entrar" style="color:#8a5d00;">Entre por aqui</a>.</p>
</td></tr>
<tr><td style="padding:16px 32px;background:#faf8f3;font-size:12px;color:#999;">FAV Advogados · Fernando Vieira Advogados</td></tr>
</table></td></tr></table></body></html>`;
}
