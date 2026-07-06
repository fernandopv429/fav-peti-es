/**
 * extrairDadosDocumentos — Extração estruturada de dados de PDFs/documentos usando OCR nativo.
 * Combina TODOS os documentos, normaliza dados e classifica sucesso/falha corretamente.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CAMPOS = [
  "RECL_NOME","RECL_NACIONALIDADE","RECL_ESTADOCIVIL","RECL_RG","RECL_PIS",
  "RECL_SERIE","RECL_CTPS","RECL_CPF","RECL_NASC","RECL_FILIACAO",
  "RECL_ENDERECO","RECL_CEP",
  "RECL1_NOME","RECL1_CNPJ","RECL1_LOGRADOURO","RECL1_ENDCOMPL",
  "RECL2_NOME","RECL2_CNPJ","RECL2_LOGRADOURO","RECL2_ENDCOMPL",
  "COMARCA_UF","REGIAO_TRT","FORO_COMPETENCIA","LOCAL_PRESTACAO","LOCAL_PRESTACAO_COMPL",
  "DATA_ADMISSAO","FUNCAO","DATA_RESCISAO","SALARIO",
  "JORNADA_HORARIO","JORNADA_EXTRAPOLA","JORNADA_FREQ_EXTRA","INTERVALO_GOZADO",
  "CCT_VIGENCIA","ADIC_CONV","VAL_FT","VAL_CONDUCAO","VAL_ALIMENTACAO",
  "DANO_SUPERVISOR","DANO_FATOS",
];

// Tabela determinística UF → TRT
const UF_REGIAO_TRT = {
  SP: "SEGUNDA REGIÃO", RJ: "PRIMEIRA REGIÃO", MG: "TERCEIRA REGIÃO",
  RS: "QUARTA REGIÃO",  BA: "QUINTA REGIÃO",   PE: "SEXTA REGIÃO",
  CE: "SÉTIMA REGIÃO",  PA: "OITAVA REGIÃO",   AM: "OITAVA REGIÃO",
  PR: "NONA REGIÃO",    DF: "DÉCIMA REGIÃO",   SC: "DÉCIMA SEGUNDA REGIÃO",
  PB: "DÉCIMA TERCEIRA REGIÃO", RO: "DÉCIMA QUARTA REGIÃO", AC: "DÉCIMA QUARTA REGIÃO",
  MA: "DÉCIMA SEXTA REGIÃO",    ES: "DÉCIMA SÉTIMA REGIÃO", GO: "DÉCIMA OITAVA REGIÃO",
  AL: "DÉCIMA NONA REGIÃO",     SE: "VIGÉSIMA REGIÃO",      RN: "VIGÉSIMA PRIMEIRA REGIÃO",
  PI: "VIGÉSIMA SEGUNDA REGIÃO",MT: "VIGÉSIMA TERCEIRA REGIÃO", MS: "VIGÉSIMA QUARTA REGIÃO",
  TO: "VIGÉSIMA SÉTIMA REGIÃO", AP: "OITAVA REGIÃO",         RR: "DÉCIMA PRIMEIRA REGIÃO",
};

// Municípios SP capital/grande SP → TRT-2
const MUNICIPIOS_TRT2 = new Set([
  "SÃO PAULO","SAO PAULO","GUARULHOS","OSASCO","SANTO ANDRÉ","SÃO BERNARDO DO CAMPO",
  "SAO BERNARDO DO CAMPO","SÃO CAETANO DO SUL","DIADEMA","MAUÁ","MAUA","CARAPICUÍBA",
  "CARAPICUIBA","BARUERI","COTIA","EMBU DAS ARTES","ITAPECERICA DA SERRA",
  "MOGI DAS CRUZES","SUZANO","ARUJÁ","ARUJA","JANDIRA","ITAPEVI","TABOÃO DA SERRA",
  "CAIEIRAS","CAJAMAR","FRANCO DA ROCHA","FRANCISCO MORATO","MAIRIPORÃ","MAIRIPORA",
  "SANTANA DE PARNAÍBA","SANTANA DE PARNAIBA","RIBEIRÃO PIRES","RIBEIRAO PIRES",
]);

// Municípios SP interior → TRT-15
const MUNICIPIOS_TRT15 = new Set([
  "CAMPINAS","SOROCABA","RIBEIRÃO PRETO","RIBEIRAO PRETO","SÃO JOSÉ DOS CAMPOS",
  "SAO JOSE DOS CAMPOS","TAUBATÉ","TAUBATE","PIRACICABA","AMERICANA","LIMEIRA",
  "ARARAQUARA","SÃO CARLOS","SAO CARLOS","SÃO JOSÉ DO RIO PRETO","SAO JOSE DO RIO PRETO",
  "BAURU","MARÍLIA","MARILIA","PRESIDENTE PRUDENTE","ARAÇATUBA","ARACATUBA",
  "BOTUCATU","FRANCA","OURINHOS","INDAIATUBA","SUMARÉ","SUMARE","JUNDIAÍ","JUNDIAI",
]);

const CAMPOS_ENTREVISTA = ["tipo_dispensa","acumulo_funcao","tem_insalubridade","tem_periculosidade","tem_adic_noturno","escala","dano_sem_estrutura"];
const CAMPOS_BOOL = new Set(["acumulo_funcao","tem_insalubridade","tem_periculosidade","tem_adic_noturno","dano_sem_estrutura"]);
const DEFAULTS = { RECL_NACIONALIDADE: "brasileiro" };
const CAMPOS_COM_DEFAULT = new Set(["RECL_NACIONALIDADE"]);

// CRITÉRIO DE SUCESSO: ao menos 1 destes campos extraído = sucesso
const CAMPOS_MINIMOS = new Set(["RECL_NOME","RECL_CPF","RECL1_NOME","RECL1_CNPJ"]);

const SCHEMA = {
  type: "object",
  properties: {
    ...Object.fromEntries(CAMPOS.map(c => [c, { type: "string" }])),
    RECL_NOME: { type: "string", description: "Nome completo do trabalhador/reclamante. Buscar em CTPS, RG, contrato, entrevista." },
    RECL_CPF: { type: "string", description: "CPF do reclamante no formato XXX.XXX.XXX-XX. Não extrair valores mascarados ou parciais." },
    RECL_RG: { type: "string", description: "RG do reclamante. Buscar em CTPS, RG, entrevista." },
    RECL_PIS: { type: "string", description: "PIS/PASEP no formato XXX.XXXXX.XX-X. Buscar na CTPS ou documentos previdenciários." },
    RECL1_CNPJ: { type: "string", description: "CNPJ da empresa empregadora (1ª reclamada) no formato XX.XXX.XXX/XXXX-XX. Buscar no contrato, holerite, CTPS ou ficha de empregado." },
    RECL1_NOME: { type: "string", description: "Razão social da empresa empregadora (1ª reclamada). Buscar no contrato ou holerite." },
    RECL_ENDERECO: { type: "string", description: "Endereço completo do reclamante: Rua, número e bairro. NÃO incluir CEP nem cidade neste campo." },
    RECL_CEP: { type: "string", description: "CEP do endereço do reclamante, apenas os 8 dígitos no formato XXXXX-XXX." },
    LOCAL_PRESTACAO: { type: "string", description: "Cidade e UF onde o empregado trabalhava (local de prestação de serviços), formato 'Cidade/UF'. Essencial para determinar a competência territorial." },
    COMARCA_UF: { type: "string", description: "Comarca/UF da Vara do Trabalho competente, formato 'CIDADE/UF' em maiúsculas. Geralmente igual ao LOCAL_PRESTACAO." },
    SALARIO: { type: "string", description: "Último salário do empregado no formato 'R$ X.XXX,XX'. Usar salário da 1ª reclamada." },
    DATA_ADMISSAO: { type: "string", description: "Data de admissão por extenso, ex: '04 de junho de 2012'." },
    DATA_RESCISAO: { type: "string", description: "Data de rescisão por extenso, ex: '15 de julho de 2025'." },
    FUNCAO: { type: "string", description: "Cargo/função do empregado na 1ª reclamada." },
    JORNADA_HORARIO: { type: "string", description: "Horário habitual de trabalho completo, ex: '18:30 às 07:30'. Descreva o horário de início e fim, NUNCA apenas 'Sim' ou 'Não'." },
    JORNADA_EXTRAPOLA: { type: "string", description: "Horário até o qual a jornada se estendia além do previsto (APENAS HH:MM, ex: '09:00'). NUNCA retorne 'Sim', 'Não' ou texto descritivo — apenas o horário." },
    JORNADA_FREQ_EXTRA: { type: "string", description: "Frequência de horas extras por mês no formato 'X a Y vezes por mês' (ex: '4 a 6 vezes por mês'). NUNCA retorne 'Sim', 'Não', 'Habitual' ou 'Frequente' — descreva a quantidade." },
    INTERVALO_GOZADO: { type: "string", description: "Tempo de intervalo intrajornada efetivamente gozado, descritivo (ex: '10 a 15 minutos'). NUNCA retorne 'Sim' ou 'Não' — descreva o tempo." },
    VAL_FT: { type: "string", description: "Valor pago por folga trabalhada/FT no formato 'R$ X,XX' (ex: 'R$ 180,00'). Se o trabalhador relatar folgas trabalhadas mas sem valor monetário, retorne 'folgas trabalhadas sem valor informado'." },
    DANO_SUPERVISOR: { type: "string", description: "Nome do superior hierárquico mencionado na entrevista/relato em caso de dano moral ou assédio. Deixe vazio se não houver." },
    DANO_FATOS: { type: "string", description: "Resumo objetivo dos fatos de dano moral/assédio relatados pelo trabalhador (texto descritivo). Deixe vazio se não houver relato de dano moral." },
    tipo_dispensa: { type: "string", enum: ["sem_justa_causa","rescisao_indireta","nulidade_pedido_demissao","reversao_justa_causa"], description: "Tipo de dispensa da entrevista: (X) Sem justa causa → sem_justa_causa | (X) Rescisão indireta → rescisao_indireta | (X) Pedido de demissão → nulidade_pedido_demissao | (X) Justa causa → reversao_justa_causa" },
    acumulo_funcao: { type: "boolean", description: "true se houver acúmulo ou desvio de função (seção 8 da entrevista)" },
    tem_insalubridade: { type: "boolean", description: "true se houver insalubridade (seção 13 da entrevista)" },
    tem_periculosidade: { type: "boolean", description: "true se houver periculosidade (seção 13 da entrevista)" },
    tem_adic_noturno: { type: "boolean", description: "true se JORNADA_HORARIO incluir horas entre 22h e 05h" },
    escala: { type: "string", description: "Regime de escala: '12x36', '5x2', '4x2', etc." },
    dano_sem_estrutura: { type: "boolean", description: "true se o posto não tinha banheiro/bebedouro (fundamenta dano moral)" },
    pendencias_sugeridas: { type: "array", items: { type: "string" }, description: "Pendências sugeridas para confirmação do advogado. Se detectar empresa adicional além da 1ª e 2ª reclamada nos documentos, liste aqui como 'Possível 3ª reclamada: [NOME] — confirmar com o cliente'. NUNCA preencha RECL3 automaticamente." },
  },
};

// ── Normalizadores ──────────────────────────────────────────────────────────

/** Remove formatação inválida de documentos mascarados/truncados */
function limparCPF(v) {
  if (!v) return "";
  const digits = v.replace(/\D/g, "");
  if (digits.length < 11) return ""; // incompleto — descartar
  const d = digits.slice(0, 11);
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`;
}

function limparCNPJ(v) {
  if (!v) return "";
  const digits = v.replace(/\D/g, "");
  if (digits.length < 14) return "";
  const d = digits.slice(0, 14);
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`;
}

function limparPIS(v) {
  if (!v) return "";
  const digits = v.replace(/\D/g, "");
  if (digits.length < 11) return "";
  const d = digits.slice(0, 11);
  return `${d.slice(0,3)}.${d.slice(3,8)}.${d.slice(8,10)}-${d.slice(10,11)}`;
}

/** Detecta valor mascarado (asteriscos, pontos de máscara, etc.) */
function isMascarado(v) {
  if (!v) return false;
  return /\*{2,}|x{3,}/i.test(v);
}

/** Garante "CIDADE/UF" em maiúsculas */
function normalizarComarcaUF(v) {
  if (!v) return "";
  const up = v.toUpperCase().trim();
  // Já no formato CIDADE/UF
  if (up.includes("/") && up.length > 3) return up;
  // "CIDADE - UF"
  const m = up.match(/^(.+?)\s*[-–]\s*([A-Z]{2})$/);
  if (m) return `${m[1].trim()}/${m[2]}`;
  return up;
}

/** Deriva REGIAO_TRT da UF, distinguindo TRT-2 vs TRT-15 para SP */
function derivarRegiaoTRT(comarcaUF) {
  if (!comarcaUF) return "SEGUNDA REGIÃO";
  const up = comarcaUF.toUpperCase();
  const ufMatch = up.match(/\/([A-Z]{2})$/);
  const uf = ufMatch?.[1];
  if (uf === "SP") {
    const cidade = up.split("/")[0].trim();
    if (MUNICIPIOS_TRT15.has(cidade)) return "DÉCIMA QUINTA REGIÃO";
    return "SEGUNDA REGIÃO"; // capital, grande SP ou indeterminado
  }
  if (uf && UF_REGIAO_TRT[uf]) return UF_REGIAO_TRT[uf];
  return "SEGUNDA REGIÃO";
}

/** Normaliza e valida um campo pelo tipo */
function normalizarCampo(key, value) {
  if (!value || typeof value !== "string") return "";
  const v = value.trim();
  if (!v || isMascarado(v)) return "";
  if (key === "RECL_CPF") return limparCPF(v);
  if (key === "RECL1_CNPJ" || key === "RECL2_CNPJ" || key === "RECL3_CNPJ") return limparCNPJ(v);
  if (key === "RECL_PIS") return limparPIS(v);
  if (key === "COMARCA_UF") return normalizarComarcaUF(v);
  if (key === "LOCAL_PRESTACAO") return normalizarComarcaUF(v);
  return v;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { casoVigilanteId, documentUrls } = await req.json();
    if (!documentUrls || documentUrls.length === 0) {
      return Response.json({ error: "Sem documentos", campos: {}, totalExtraidos: 0 });
    }

    // Lê campos já salvos na ficha para merge acumulativo
    let camposExistentes = {};
    if (casoVigilanteId) {
      try {
        const fichas = await base44.asServiceRole.entities.CasoVigilante.filter({ id: casoVigilanteId });
        if (fichas?.[0]) {
          for (const c of CAMPOS) {
            if (fichas[0][c]) camposExistentes[c] = fichas[0][c];
          }
          for (const c of CAMPOS_ENTREVISTA) {
            if (fichas[0][c] !== undefined && fichas[0][c] !== null) {
              camposExistentes[c] = fichas[0][c];
            }
          }
        }
      } catch (_) {}
    }

    const merged = { ...camposExistentes };
    const docsFalharam = [];

    // Processa CADA documento individualmente e consolida
    for (let i = 0; i < documentUrls.length; i++) {
      const url = documentUrls[i];
      const nomeDoc = `Documento ${i + 1}`;

      try {
        const resultado = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
          file_url: url,
          json_schema: SCHEMA,
        });

        if (resultado.status !== "success" || !resultado.output) {
          docsFalharam.push({ url, nome: nomeDoc, erro: resultado.details || "status != success" });
          continue;
        }

        const output = resultado.output;
        let camposNovos = 0;

        for (const [key, value] of Object.entries(output)) {
          // Skip defaults
          if (CAMPOS_COM_DEFAULT.has(key) && value === DEFAULTS[key]) continue;

          // Booleanos: só marca true, nunca apaga
          if (CAMPOS_BOOL.has(key)) {
            if (value === true && !merged[key]) {
              merged[key] = true;
              camposNovos++;
            }
            continue;
          }

          // Enum tipo_dispensa
          if (key === "tipo_dispensa") {
            const VALID = ["sem_justa_causa","rescisao_indireta","nulidade_pedido_demissao","reversao_justa_causa"];
            if (value && VALID.includes(value) && !merged[key]) {
              merged[key] = value;
              camposNovos++;
            }
            continue;
          }

          // Array de pendências sugeridas (ex: possível 3ª reclamada) — não salvo na ficha
          if (key === "pendencias_sugeridas" && Array.isArray(value)) {
            if (!merged.pendencias_sugeridas) merged.pendencias_sugeridas = [];
            for (const p of value) {
              if (typeof p === "string" && p.trim() && !merged.pendencias_sugeridas.includes(p.trim())) {
                merged.pendencias_sugeridas.push(p.trim());
                camposNovos++;
              }
            }
            continue;
          }

          // Campos string — normaliza e valida antes de mesclar
          if (value && typeof value === "string") {
            const normalizado = normalizarCampo(key, value);
            if (normalizado && !merged[key]) {
              merged[key] = normalizado;
              camposNovos++;
            }
          }
        }

        // CRITÉRIO DE SUCESSO: ao menos 1 campo mínimo preenchido = sucesso parcial
        const temCampoMinimo = Object.entries(output).some(
          ([k, v]) => CAMPOS_MINIMOS.has(k) && v && String(v).trim() && !isMascarado(String(v))
        );

        if (camposNovos === 0) {
          // Realmente sem dados novos — pode ser documento redundante ou ilegível
          docsFalharam.push({
            url, nome: nomeDoc,
            aviso: "Nenhum campo novo extraído (documento já coberto ou ilegível)",
          });
        } else if (!temCampoMinimo) {
          // Dados extraídos mas sem campo essencial — aviso de revisão (não é falha)
          console.log(`[revisao_necessaria] ${nomeDoc}: ${camposNovos} campo(s) — sem nome/CPF/CNPJ. Dados aproveitados.`);
          docsFalharam.push({
            url, nome: nomeDoc,
            aviso: `${camposNovos} campo(s) extraído(s) sem nome ou CNPJ — confira manualmente`,
          });
        }
        // else: sucesso normal — sem aviso
      } catch (err) {
        docsFalharam.push({ url, nome: nomeDoc, erro: err.message });
        await base44.asServiceRole.entities.ErrorLog.create({
          context: "extracao_documentos",
          error_type: "api",
          message: `Erro ao processar ${nomeDoc}: ${err.message}`,
          resolved: false,
          occurred_at: new Date().toISOString(),
        }).catch(() => {});
      }
    }

    // ── Derivação determinística de COMARCA_UF e REGIAO_TRT ─────────────────
    // Se LOCAL_PRESTACAO veio preenchido e COMARCA_UF está vazio → copiar
    if (merged.LOCAL_PRESTACAO && !merged.COMARCA_UF) {
      merged.COMARCA_UF = normalizarComarcaUF(merged.LOCAL_PRESTACAO);
    }
    // Normaliza COMARCA_UF existente
    if (merged.COMARCA_UF) {
      merged.COMARCA_UF = normalizarComarcaUF(merged.COMARCA_UF);
    }
    // Deriva REGIAO_TRT se vazio
    if (merged.COMARCA_UF && !merged.REGIAO_TRT) {
      merged.REGIAO_TRT = derivarRegiaoTRT(merged.COMARCA_UF);
    }
    // Se ainda sem COMARCA_UF mas temos endereço do reclamante, tenta extrair UF
    if (!merged.COMARCA_UF && merged.RECL_ENDERECO) {
      const ufEnd = merged.RECL_ENDERECO.toUpperCase().match(/\b([A-Z]{2})\b/g);
      const siglas = ["SP","RJ","MG","RS","PR","SC","BA","CE","PE","GO","DF","PA","AM","ES","MS","MT","AL","RN","PI","MA","RO","AC","PB","SE","AP","RR","TO"];
      if (ufEnd) {
        const uf = ufEnd.find(u => siglas.includes(u));
        if (uf) {
          merged.COMARCA_UF = `SÃO PAULO/${uf}`; // cidade a completar manualmente
          if (!merged.REGIAO_TRT) merged.REGIAO_TRT = derivarRegiaoTRT(`/${uf}`);
        }
      }
    }

    // Separa pendências sugeridas (não salvas na ficha, apenas retornadas ao frontend)
    const pendenciasSugeridas = Array.isArray(merged.pendencias_sugeridas) ? merged.pendencias_sugeridas : [];
    delete merged.pendencias_sugeridas;

    // Filtra campos válidos
    const extraidos = Object.fromEntries(
      Object.entries(merged).filter(([, v]) =>
        v !== null && v !== undefined && String(v).trim() !== ""
      )
    );

    const totalExtraidos = Object.keys(extraidos).length;

    // Salva na ficha
    if (casoVigilanteId && totalExtraidos > 0) {
      try {
        await base44.asServiceRole.entities.CasoVigilante.update(casoVigilanteId, {
          ...extraidos,
          status: "preenchido",
        });
      } catch (saveErr) {
        console.error("Erro ao salvar ficha:", saveErr.message);
      }
    }

    // Prepara alertas — sem tratar extração parcial como erro
    let alerta = null;
    if (totalExtraidos === 0 && documentUrls.length > 0) {
      alerta = "Nenhum dado foi extraído. Verifique se os documentos estão legíveis e contêm CTPS, holerites ou entrevista.";
    } else if (docsFalharam.some(d => d.erro)) {
      const falhas = docsFalharam.filter(d => d.erro).length;
      alerta = `${falhas} documento(s) não puderam ser lidos. Verifique se estão legíveis ou corrompidos.`;
    }

    return Response.json({
      campos: extraidos,
      totalExtraidos,
      alerta,
      docsFalharam: docsFalharam.length > 0 ? docsFalharam : undefined,
      pendenciasSugeridas: pendenciasSugeridas.length > 0 ? pendenciasSugeridas : undefined,
    });
  } catch (error) {
    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.ErrorLog.create({
        context: "extracao_documentos — erro_fatal",
        error_type: "api",
        message: `Erro 500: ${error.message}`,
        resolved: false,
        occurred_at: new Date().toISOString(),
      }).catch(() => {});
    } catch (_) {}
    return Response.json({ error: error.message }, { status: 500 });
  }
});