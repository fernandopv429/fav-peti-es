import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wand2, ArrowRight, FileText, AlertTriangle, PackageCheck,
  FolderOpen, Webhook,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/app/auth/AuthContext";
import PainelPeticoesRecentes from "@/features/peticoes/PainelPeticoesRecentes";

const TOOLS = [
  { label: "Entrevistas recebidas", icon: Wand2, path: "/entrevista", desc: "Processar eventos e gerar a peça" },
  { label: "Modelos", icon: FolderOpen, path: "/modelos", desc: "Modelo-mestre e referências" },
  { label: "Webhooks", icon: Webhook, path: "/webhooks", desc: "Eventos recebidos do formulário" },
];

function saudacao(nome) {
  const h = new Date().getHours();
  const parte = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const primeiro = nome?.trim().split(" ")[0];
  return primeiro ? `${parte}, ${primeiro}!` : `${parte}!`;
}

function iniciais(nome) {
  if (!nome) return "?";
  const p = nome.trim().split(" ").filter(Boolean);
  return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [petitions, setPetitions] = useState([]);
  const [loadingPet, setLoadingPet] = useState(true);

  useEffect(() => {
    base44.entities.Petition.list("-created_date", 200)
      .then(setPetitions)
      .catch(() => {})
      .finally(() => setLoadingPet(false));
  }, []);

  const resumo = [
    { label: "Petições", value: petitions.length, icon: FileText, tone: "text-primary-ink", bg: "bg-primary/10" },
    { label: "Em revisão", value: petitions.filter((p) => p.status === "revisao_necessaria").length, icon: AlertTriangle, tone: "text-destructive", bg: "bg-destructive/10" },
    { label: "Prontas", value: petitions.filter((p) => p.status === "pronto_para_protocolo").length, icon: PackageCheck, tone: "text-success", bg: "bg-success/10" },
  ];

  return (
    <div className="flex gap-6 p-4 lg:p-6">
      {/* ── Coluna principal ───────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-8">
        {/* Saudação */}
        <div className="flex items-start justify-between gap-4 pt-2">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{saudacao(user?.full_name)}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              As entrevistas chegam por webhook e viram peça aqui — o formulário fica no sistema de origem.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate("/entrevista")}
              className="hidden sm:inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold card-soft hover:opacity-90 transition-opacity"
            >
              <Wand2 className="w-4 h-4" strokeWidth={2.25} />
              Entrevistas recebidas
            </button>
            <div
              title={user?.full_name || ""}
              className="w-11 h-11 rounded-2xl bg-card card-soft flex items-center justify-center text-sm font-bold text-primary-ink"
            >
              {iniciais(user?.full_name)}
            </div>
          </div>
        </div>

        {/* Resumo rápido */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {resumo.map((s) => (
            <div
              key={s.label}
              className="bg-card rounded-3xl p-5 card-soft"
            >
              <div className={`w-10 h-10 rounded-2xl ${s.bg} flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.tone}`} strokeWidth={2.25} />
              </div>
              <p className="text-2xl font-bold text-foreground mt-4 leading-none">
                {loadingPet ? "—" : s.value}
              </p>
              <p className="text-xs text-muted-foreground mt-1.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Atalhos */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
            Atalhos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {TOOLS.map((t) => (
              <button
                key={t.path}
                onClick={() => navigate(t.path)}
                className="group relative text-left bg-card rounded-3xl p-5 card-soft hover:card-soft-lg hover:-translate-y-0.5 transition-all"
              >
                <div className="w-11 h-11 rounded-2xl bg-primary flex items-center justify-center mb-4">
                  <t.icon className="w-5 h-5 text-primary-foreground" strokeWidth={2.25} />
                </div>
                <p className="font-semibold text-sm text-foreground">{t.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 pr-6">{t.desc}</p>
                <ArrowRight className="absolute bottom-5 right-5 w-4 h-4 text-muted-foreground/40 group-hover:text-primary-ink transition-colors" strokeWidth={2.25} />
              </button>
            ))}
          </div>
        </div>

        {/* Chamada para a entrevista */}
        <div className="rounded-3xl hero-rays p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="font-bold text-primary-foreground">Tem entrevista na fila?</p>
            <p className="text-primary-foreground/85 text-sm mt-0.5">
              Abra a tela de geração e transforme o evento recebido em petição.
            </p>
          </div>
          <button
            onClick={() => navigate("/entrevista")}
            className="shrink-0 inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-foreground text-primary text-sm font-bold hover:opacity-90 transition-opacity"
          >
            <Wand2 className="w-4 h-4" strokeWidth={2.25} />
            Gerar por entrevista
          </button>
        </div>
      </div>

      {/* ── Trilha lateral (só em telas largas) ────────────────────────── */}
      <aside className="hidden xl:block w-[340px] shrink-0">
        <div className="sticky top-6 h-[calc(100vh-3rem)] bg-secondary rounded-3xl p-5">
          <PainelPeticoesRecentes petitions={petitions} loading={loadingPet} />
        </div>
      </aside>
    </div>
  );
}