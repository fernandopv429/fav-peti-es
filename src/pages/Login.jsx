import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Loader2, Eye, EyeOff } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";

/** Traduz os erros de acesso para uma mensagem clara em português. */
function mensagemDeErro(err) {
  const texto = String(err?.message || err || "").toLowerCase();
  if (/invalid|incorrect|wrong|credential|unauthori|401|password|senha/.test(texto)) return "E-mail ou senha incorretos. Confira e tente de novo.";
  if (/not found|no user|404|exist/.test(texto)) return "Não encontramos um acesso com este e-mail. Peça ao administrador para liberar.";
  if (/network|fetch|failed to|timeout/.test(texto)) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  if (/too many|rate|429/.test(texto)) return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
  return "Não foi possível entrar agora. Tente de novo em instantes.";
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(email.trim(), password);
      window.location.href = returnTo;
    } catch (err) {
      setError(mensagemDeErro(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Bem-vindo de volta"
      subtitle="Entre com o e-mail cadastrado pelo administrador."
      footer={
        <>
          Primeiro acesso? <Link to="/primeiro-acesso">Crie sua senha</Link>
          <span className="mt-2 block text-xs text-slate-400">Sem convite? Peça ao administrador.</span>
        </>
      }
    >
      {error && (
        <div role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="email" type="email" autoComplete="email" autoFocus placeholder="voce@favadvogados.com.br"
              value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 pl-10" required />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <Link to="/forgot-password" className="text-xs font-medium hover:underline">Esqueci minha senha</Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="password" type={verSenha ? "text" : "password"} autoComplete="current-password" placeholder="Sua senha"
              value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 pl-10 pr-11" required />
            <button type="button" onClick={() => setVerSenha((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}>
              {verSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button type="submit" className="h-12 w-full text-base font-medium" disabled={loading}>
          {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Entrando...</>) : "Entrar"}
        </Button>
      </form>
    </AuthLayout>
  );
}
