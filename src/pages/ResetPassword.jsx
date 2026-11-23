import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get("token");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) return setError("As senhas não coincidem.");
    if (newPassword.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    setLoading(true);
    try {
      await base44.auth.resetPassword({ resetToken, newPassword });
      window.location.href = "/entrar";
    } catch {
      setError("Não foi possível redefinir a senha. O link pode ter vencido; peça um novo.");
    } finally {
      setLoading(false);
    }
  };

  if (!resetToken) {
    return (
      <AuthLayout icon={AlertTriangle} title="Link inválido" subtitle="Este link de redefinição está incompleto ou vencido."
        footer={<Link to="/forgot-password">Pedir um novo link</Link>}>
        <p className="text-center text-sm text-foreground">Peça um novo e-mail de redefinição de senha.</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={Lock} title="Nova senha" subtitle="Digite a nova senha abaixo.">
      {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Nova senha</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="password" type="password" autoComplete="new-password" autoFocus placeholder="Mínimo de 8 caracteres"
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-12 pl-10" required />
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
          {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</>) : "Redefinir senha"}
        </Button>
      </form>
    </AuthLayout>
  );
}
