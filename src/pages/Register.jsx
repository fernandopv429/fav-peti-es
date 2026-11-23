import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2 } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import AuthLayout from "@/components/AuthLayout";
import { toast } from "@/components/ui/use-toast";
import { safeReturnTo } from "@/lib/authReturnTo";

/** Traduz os erros do cadastro de primeiro acesso. */
function mensagemCadastro(err) {
  const t = String(err?.message || err || "").toLowerCase();
  if (/exist|already|registered|cadastrad/.test(t)) return "Este e-mail já tem senha criada. Use “Entrar” ou, se não lembrar a senha, “Esqueci minha senha”.";
  if (/password|senha|8 char|least/.test(t)) return "A senha precisa ter pelo menos 8 caracteres.";
  if (/email|e-mail|invalid/.test(t)) return "Confira o e-mail digitado.";
  if (/network|fetch|failed/.test(t)) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  return "Não foi possível criar a senha agora. Tente de novo em instantes.";
}

export default function Register() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) return setError("As senhas não coincidem.");
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    setLoading(true);
    try {
      await base44.auth.register({ email: email.trim(), password });
      setShowOtp(true);
    } catch (err) {
      setError(mensagemCadastro(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await base44.auth.verifyOtp({ email: email.trim(), otpCode });
      if (result?.access_token) base44.auth.setToken(result.access_token);
      window.location.href = safeReturnTo();
    } catch {
      setError("Código inválido ou vencido. Confira o código mais recente que chegou no seu e-mail.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    try {
      await base44.auth.resendOtp(email.trim());
      toast({ title: "Código enviado", description: "Confira seu e-mail para ver o novo código." });
    } catch (err) {
      setError(err?.message || "Não foi possível reenviar o código.");
    }
  };

  if (showOtp) {
    return (
      <AuthLayout icon={Mail} title="Confirme seu e-mail" subtitle={`Enviamos um código para ${email}`}>
        {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <div className="mb-6 flex justify-center">
          <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} autoFocus autoComplete="one-time-code">
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button className="h-12 w-full bg-primary font-medium text-[#111] hover:bg-primary/90" onClick={handleVerify} disabled={loading || otpCode.length < 6}>
          {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verificando...</>) : "Confirmar código"}
        </Button>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Não recebeu o código? <button onClick={handleResend} className="font-medium text-primary-ink hover:underline">Reenviar</button>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={UserPlus}
      title="Primeiro acesso"
      subtitle="Crie sua senha com o e-mail em que você recebeu o convite."
      footer={<>Já tem senha? <Link to="/entrar">Entrar</Link></>}
    >
      {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
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
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="password" type="password" autoComplete="new-password" placeholder="Mínimo de 8 caracteres"
              value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 pl-10" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmar senha</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="confirm" type="password" autoComplete="new-password" placeholder="Repita a senha"
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-12 pl-10" required />
          </div>
        </div>
        <Button type="submit" className="h-12 w-full font-medium" disabled={loading}>
          {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando...</>) : "Criar minha senha"}
        </Button>
      </form>
    </AuthLayout>
  );
}
