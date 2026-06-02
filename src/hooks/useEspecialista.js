import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Busca um Especialista pelo campo `numero` (string ou number).
 * Retorna { especialista, loading, error }
 */
export function useEspecialista(numero) {
  const [especialista, setEspecialista] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!numero) return;
    setLoading(true);
    base44.entities.Especialista.filter({ numero: String(numero), ativo: true })
      .then((data) => {
        setEspecialista(data[0] || null);
        if (!data[0]) setError(`Especialista #${numero} não encontrado ou inativo.`);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [numero]);

  return { especialista, loading, error };
}