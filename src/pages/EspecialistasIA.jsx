import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { ESPECIALISTAS } from "@/features/entrevista/lib/redacaoTeses";

// ============================================================
// Tela de configuração dos capítulos redigidos por IA.
//
// Edita só o "papel"/instrução de estilo de cada capítulo
// (EspecialistaConfig.prompt_sistema) — nunca a condição de quando
// o capítulo liga (isso continua determinístico, em código, em
// ESPECIALISTAS[].ativo) nem os dados do caso, que o sistema já
// injeta automaticamente antes deste texto a cada geração.
//
// CONDICAO_TEXTO é só descritivo (mostrado como referência) — não
// é lido pelo motor de geração; a fonte real da condição é o campo
// `ativo` de cada item de ESPECIALISTAS (redacaoTeses.js).
// ============================================================

const CONDICAO_TEXTO = {
  espinha: "Sempre entra na peça, em toda categoria.",
  jornada: "Entra quando há escala 12x36/4x2, horário de trabalho informado ou folgas trabalhadas.",
  dano_moral: "Entra quando há fatos concretos de dano moral relatados no caso.",
  enquadramento: "Entra quando há desvio, acúmulo ou gratificação de função (nome/percentual corretos por categoria são resolvidos automaticamente).",
  sumula331: "Entra quando há 2ª reclamada (tomadora dos serviços).",
  insalubridade: "Entra quando a entrevista confirma exposição a agente insalubre.",
  multas_convencionais: "Entra quando há CCT/sindicato informado, ou periculosidade, assiduidade, folgas trabalhadas, desvio/acúmulo ou os 10 minutos de descanso ativos.",
};

export default function EspecialistasIA() {
  const [configsPorNumero, setConfigsPorNumero] = useState({});
  const [textos, setTextos] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const lista = await base44.entities.EspecialistaConfig.list("-updated_date", 100);
        const porNumero = {};
        for (const c of lista || []) porNumero[c.numero] = c;
        setConfigsPorNumero(porNumero);
        const inicial = {};
        for (const e of ESPECIALISTAS) inicial[e.numero] = porNumero[e.numero]?.prompt_sistema || "";
        setTextos(inicial);
      } catch (err) {
        setErro("Erro ao carregar as configurações: " + (err?.message || err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const salvar = async (especialista) => {
    const { numero, nome } = especialista;
    setSavingId(numero);
    setErro(null);
    try {
      const existente = configsPorNumero[numero];
      const novoPrompt = (textos[numero] || "").trim();
      if (existente?.id) {
        await base44.entities.EspecialistaConfig.update(existente.id, {
          prompt_sistema: novoPrompt,
          ativo: true,
        });
        setConfigsPorNumero((prev) => ({
          ...prev,
          [numero]: { ...existente, prompt_sistema: novoPrompt, ativo: true },
        }));
      } else {
        const criado = await base44.entities.EspecialistaConfig.create({
          numero,
          nome,
          prompt_sistema: novoPrompt,
          ativo: true,
        });
        setConfigsPorNumero((prev) => ({ ...prev, [numero]: criado }));
      }
      toast.success(
        novoPrompt
          ? `Instrução de "${nome}" salva.`
          : `"${nome}" voltou a usar a instrução padrão do sistema.`
      );
    } catch (err) {
      toast.error("Erro ao salvar: " + (err?.message || err));
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-playfair font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6" /> Redação por IA — Capítulos
        </h1>
        <p className="text-muted-foreground mt-1">
          Ajuste aqui <strong>como</strong> a IA escreve cada capítulo da petição. Isto não muda{" "}
          <strong>quando</strong> o capítulo entra na peça (isso continua automático, decidido pelos
          dados do caso) — só o estilo/instrução de redação daquele trecho.
        </p>
      </div>

      {erro && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-sm px-4 py-3">
          {erro}
        </div>
      )}

      {ESPECIALISTAS.map((especialista) => {
        const { numero, nome, promptPadrao } = especialista;
        const textoAtual = textos[numero] ?? "";
        const salvo = configsPorNumero[numero]?.prompt_sistema || "";
        const alterado = textoAtual.trim() !== salvo.trim();
        const usandoPadrao = !textoAtual.trim();

        return (
          <Card key={numero} className="p-5 space-y-3">
            <div>
              <h3 className="font-semibold">{nome}</h3>
              {CONDICAO_TEXTO[numero] && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Quando entra: {CONDICAO_TEXTO[numero]}
                </p>
              )}
            </div>

            <Textarea
              value={textoAtual}
              onChange={(ev) => setTextos((prev) => ({ ...prev, [numero]: ev.target.value }))}
              placeholder={promptPadrao}
              rows={4}
              className="text-sm"
            />

            {usandoPadrao && (
              <p className="text-xs text-muted-foreground italic">
                Em branco = usa a instrução padrão do sistema (mostrada acima, em cinza, dentro da caixa).
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTextos((prev) => ({ ...prev, [numero]: "" }))}
                disabled={!textoAtual}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restaurar padrão
              </Button>
              <Button size="sm" onClick={() => salvar(especialista)} disabled={!alterado || savingId === numero}>
                {savingId === numero ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                )}
                Salvar
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
