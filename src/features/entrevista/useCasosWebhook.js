import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Leitura (somente) dos casos recebidos por webhook, para os contadores da
 * barra superior e do painel Início. Mesma consulta da FilaWebhooks; não altera
 * nada no banco.
 */
export function useCasosWebhook({ intervaloMs = 60000 } = {}) {
  const [casos, setCasos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    const carregar = () =>
      base44.entities.CasoTrabalhista.list("-created_date", 1000)
        .then((lista) => {
          if (vivo) setCasos((lista || []).filter((c) => c.analise_json?.origem === "webhook"));
        })
        .catch(() => {})
        .finally(() => vivo && setLoading(false));
    carregar();
    const t = intervaloMs ? setInterval(carregar, intervaloMs) : null;
    return () => { vivo = false; if (t) clearInterval(t); };
  }, [intervaloMs]);

  const naFila = casos.filter((c) => c.status !== "pronto" && c.status !== "em_analise");
  const gerando = casos.filter((c) => c.status === "em_analise");
  const revisadas = casos.filter((c) => c.status === "pronto");
  const agora = new Date();
  const noMes = casos.filter((c) => {
    const d = new Date(c.created_date);
    return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
  });

  return { casos, loading, naFila, gerando, revisadas, noMes };
}
