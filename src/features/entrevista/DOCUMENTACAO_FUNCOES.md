# Documentação — funções (categorias) atendidas pelo modelo-mestre

Modelo: **MODELO PRINCIPAL — Entrevista/IA (blocos dinâmicos)**
Arquivo: `MODELO_PRINCIPAL_v20_rol_sem_repeticao.docx`
Motor de preenchimento: `src/features/entrevista/lib/dadosTemplate.js` (dados + flags) →
`preencherDocxTemplate.js` (docxtemplater).

O modelo é **único** e independente da função do reclamante. A função entra como
dado (`{{RECL_FUNCAO}}`) e o que muda de categoria para categoria são as **flags**
que acendem capítulos e os **percentuais** aplicados.

---

## 1. Como a função influencia a peça

| Elemento | Origem | Observação |
|---|---|---|
| `RECL_FUNCAO` | `caso.funcao` (entrevista) | impresso na qualificação e nos capítulos |
| `ESCALA` / `JORNADA_HORARIOS` | entrevista | acende `escala_12x36`, `escala_4x2` |
| `PERC_ART71` | função | Vigilante: **60%** (cláusula 12ª da CCT); demais: **50%** (art. 71, §4º, CLT) |
| `PERC_MULTA_CONV` | função | Vigilante: **3%** sobre o salário normativo; demais: **20%** por cláusula descumprida |
| `periculosidade` | entrevista **ou** função Vigilante | ligado por padrão para Vigilante |
| `dez_minutos_cct` | entrevista **ou** função Vigilante | 10 minutos de descanso (cláusula 33ª) |
| `insalubridade` | entrevista | típico de limpeza/higienização, coleta, saúde |
| Cláusulas citadas | função `cct` (backend) | buscadas pela categoria/sindicato do caso |

Regra prática: **só a Vigilância tem tratamento diferenciado por código.** As
demais funções (porteiro, controlador de acesso, agente de limpeza, recepcionista,
zelador, ASG etc.) usam o caminho padrão e se diferenciam pelas respostas da
entrevista e pela CCT consultada.

---

## 2. Perfis mais frequentes

### 2.1 Vigilante (CCT Vigilância)
- Escala 12x36 → capítulo próprio (`escala_12x36`).
- Periculosidade **sempre** ligada, inclusive o reflexo sobre horas extras
  (`VALOR_PERICULOSIDADE_HE`).
- 10 minutos de descanso por hora (cláusula 33ª) → `VALOR_DEZ_MINUTOS`.
- Adicional convencional de 60% nas HE e no intervalo do art. 71.
- Multa convencional de 3% sobre o salário normativo.
- Adicional noturno deduzido do horário (18h30–07h30 etc.).

### 2.2 Porteiro / Controlador de acesso (SINDEEPRES e afins)
- Escala 12x36 ou 5x2, conforme a entrevista.
- Intervalo suprimido é o pedido mais comum (`tem_intervalo_suprimido`, art. 71
  a 50%).
- Desvio de função frequente (portaria ↔ vigilância patrimonial, prevenção de
  perdas) → `desvio_funcao` + `BLOCO_ENQUADRAMENTO`.
- Periculosidade **não** entra automaticamente: só se a entrevista apontar.

### 2.3 Agente de higienização / limpeza (SIEMACO e afins)
- Insalubridade (20% ou 40%) → `insalubridade` + `BLOCO_INSALUBRIDADE`.
- Acúmulo/desvio de função (limpeza ↔ pisista, copa, coleta).
- Descontos indevidos (faltas com atestado) → `desconto_indevido`.
- Multa convencional de 20% por cláusula descumprida.

### 2.4 Demais funções
Qualquer outra função é redigida pelo mesmo caminho: a função é impressa, as
teses vêm das respostas da entrevista e a CCT da categoria é consultada para
citar as cláusulas corretas.

---

## 3. Teses disponíveis (independentes da função)

Rescisão: sem justa causa · rescisão indireta · reversão de justa causa ·
nulidade/coação em pedido de demissão · acordo (art. 484-A).

Capítulos: jornada e prorrogação · intervalo intrajornada (art. 71) ·
adicional noturno · 10 minutos da CCT · folgas/feriados trabalhados (100% + DSR
e reflexos) · pagamento "por fora" (integração) · bonificação de assiduidade ·
vale-transporte e auxílio-alimentação nas folgas · insalubridade ·
periculosidade · acúmulo, desvio e gratificação de função · descontos indevidos ·
salários em aberto · doença ocupacional, estabilidade e pensão vitalícia ·
dano moral · multas convencionais · responsabilidade subsidiária (Súmula 331) com
até 4 reclamadas.

Verbas rescisórias e valores do rol são calculados por código
(`mathUtils.js`) e só são impressos quando existe valor — sem valor, o pedido sai
como "a apurar em liquidação".

---

## 4. Limites

- Cobre apenas a **petição inicial trabalhista**. Contestação/defesa, cível e
  previdenciário exigiriam modelo próprio.
- Tese que não esteja na lista acima não tem bloco no .docx: precisa ser
  tokenizada no modelo antes de aparecer na peça.
- Percentuais por categoria hoje codificados: Vigilância vs. demais. Outra
  categoria com percentual diferente precisa de ajuste em `dadosTemplate.js`.