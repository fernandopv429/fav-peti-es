import { base44 } from "@/api/base44Client";

export const SECTION_HEADER = "## Regras aprendidas com correções";

/**
 * Anexa uma regra (bullet) à seção "## Regras aprendidas com correções"
 * de um prompt_sistema, criando a seção se inexistente e evitando duplicação.
 */
export function appendRuleToPrompt(currentPrompt, rule) {
  const r = (rule || "").trim();
  const base = (currentPrompt || "").trimEnd();
  if (!r) return { newPrompt: currentPrompt || "", alreadyExists: false };

  let newPrompt;
  let alreadyExists = false;

  if (base.includes(SECTION_HEADER)) {
    const parts = base.split(SECTION_HEADER);
    const before = parts[0];
    let rulesSection = parts.slice(1).join(SECTION_HEADER) || "";
    const normalizedRules = rulesSection.replace(/\s+/g, " ").toLowerCase();
    const normalizedRule = r.replace(/\s+/g, " ").toLowerCase();
    if (normalizedRules.includes(normalizedRule)) {
      alreadyExists = true;
      newPrompt = currentPrompt;
    } else {
      rulesSection = rulesSection.trimEnd();
      rulesSection = rulesSection + (rulesSection ? "\n" : "") + `- ${r}`;
      newPrompt = before.trimEnd() + "\n\n" + SECTION_HEADER + "\n" + rulesSection;
    }
  } else {
    newPrompt = base + (base ? "\n\n" : "") + SECTION_HEADER + "\n" + `- ${r}`;
  }

  return { newPrompt, alreadyExists };
}

/**
 * Faz o parse das regras (linhas "- ...") da seção de regras aprendidas.
 */
export function parseRegras(prompt) {
  if (!prompt || !prompt.includes(SECTION_HEADER)) return [];
  const afterHeader = prompt.split(SECTION_HEADER)[1] || "";
  const lines = afterHeader.split("\n");
  const regras = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (regras.length > 0) break;
      continue;
    }
    if (t.startsWith("## ")) break; // próxima seção
    if (t.startsWith("- ")) regras.push(t.slice(2).trim());
    else if (regras.length > 0) break;
  }
  return regras;
}

/**
 * Remove a regra de índice `idx` da seção de regras aprendidas.
 * Se não sobrar nenhuma regra, remove a seção inteira.
 */
export function removeRuleFromPrompt(prompt, idx) {
  if (!prompt || !prompt.includes(SECTION_HEADER)) return prompt || "";
  const parts = prompt.split(SECTION_HEADER);
  const before = parts[0];
  let rulesSection = parts.slice(1).join(SECTION_HEADER) || "";
  const ruleLines = rulesSection.split("\n");
  let removed = 0;
  const newLines = ruleLines.filter((line) => {
    if (line.trim().startsWith("- ")) {
      if (removed === idx) {
        removed++;
        return false;
      }
      removed++;
    }
    return true;
  });
  const newRulesSection = newLines.join("\n").trimEnd();
  if (newRulesSection) {
    return before.trimEnd() + "\n\n" + SECTION_HEADER + "\n" + newRulesSection;
  }
  return before.trimEnd();
}

/**
 * Salva uma regra aprendida no prompt_sistema do alvo informado
 * (ex.: Especialista que realmente gera a peça). Busca o prompt mais
 * recente no banco para evitar duplicação/stale.
 */
export async function salvarRegraAprendida(learningTarget, rule) {
  if (!learningTarget || !learningTarget.entityName || !learningTarget.id) {
    throw new Error("Alvo de aprendizado inválido");
  }
  const list = await base44.entities[learningTarget.entityName].filter({ id: learningTarget.id });
  const record = list?.[0];
  if (!record) throw new Error("Registro de aprendizado não encontrado");
  const currentPrompt = record.prompt_sistema || "";
  const { newPrompt, alreadyExists } = appendRuleToPrompt(currentPrompt, rule);
  if (alreadyExists) return { alreadyExists: true };
  await base44.entities[learningTarget.entityName].update(learningTarget.id, { prompt_sistema: newPrompt });
  return { alreadyExists: false };
}