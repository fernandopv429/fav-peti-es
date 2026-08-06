# Entrevista — geração de peça a partir de evento recebido

Portado do app **DocFlow AI** (`6a6526d39fede1a2a7a8c5a4`), que é a referência
correta deste fluxo. O diferencial dele é o **redigimento por IA**: capítulos
inteiros da peça são escritos pela IA e injetados no modelo.

## Este app não tem formulário

O formulário vive no sistema de origem. Aqui só chegam eventos por webhook, e é
o webhook que diz qual modelo preencher.

```
[formulário externo]
        │  POST /webhookReceber   (header X-Webhook-Secret)
        ▼
  WebhookEvento ── guarda payload + template_id
        │
        │  gerarPecaWebhook  (backend)
        ├─ mapearWebhook.js ....... payload → objeto `caso`
        ├─ consultas.js ........... enriquece CNPJ / CEP / CCT
        ├─ mathUtils.js ........... calcula as verbas
        ├─ redacao.js ............. IA escreve os BLOCO_* (os capítulos)
        ▼
  CasoTrabalhista.analise_json  ── caso + calculos + blocos + modelo_docx_url
  Petition ...................... espelho para "Minhas Petições" e revisão
        │
        │  operador abre /entrevista → FilaWebhooks lista os eventos
        ▼
  dadosTemplate.js ..... monta os ~68 tokens (BLOCO_* da IA, com fallback
                         determinístico quando a IA falha ou está desligada)
  preencherDocxTemplate.js ..... preenche o .docx (docxtemplater)
```

**O webhook não gera o .docx** — ele prepara dados e redação. O documento é
montado quando o operador abre o caso na tela da entrevista. É assim no DocFlow
e foi mantido igual.

## ⚠️ Dois dialetos de template convivem — e não são compatíveis

Esta é a armadilha mais fácil de cair, porque o docxtemplater **não reclama**:
ele só deixa o token cru no documento.

| | Entrevista / IA | Legado (NewPetition) |
|---|---|---|
| Tokens | `{{BLOCO_*}}`, `{{VALOR_*}}`, `{{RECL_NOME}}` | `{{P01}}`…`{{P87}}`, `{{COMARCA_UF}}`, `{{FUNCAO}}` |
| Texto jurídico | escrito pela IA | fixo dentro do .docx |
| Quantidade | 68 tokens | 133 tokens |
| Preenchido por | `dadosTemplate.js` + `preencherDocxTemplate.js` | função `generatePetitionDocx` |
| Modelo | *MODELO PRINCIPAL — Entrevista/IA* | Vigilante, SINDEEPRES, SIEMACO, Limpeza, Contestação |

Só `DATA_ADMISSAO` e `DATA_RESCISAO` existem nos dois. Há quase-colisões que
falhariam caladas: `JORNADA_HORARIO` (legado) × `JORNADA_HORARIOS` (entrevista),
`FUNCAO` × `RECL_FUNCAO`, `LOCAL_PRESTACAO` × `LOCAL_PRESTACAO_ENDERECO`.

### Como o código se protege

Um `PetitionTemplate` do fluxo de entrevista **precisa da tag `blocos`**. O
`gerarPecaWebhook` verifica isso: se o modelo resolvido não tem a tag, a peça
não é marcada como pronta — vai para `revisao_necessaria` e o aviso fica em
`WebhookEvento.erro_mensagem` e em `Petition.additional_facts`.

Hoje só um modelo tem a tag:

- `6a74da7d5ef628c7be616088` — **MODELO PRINCIPAL — Entrevista/IA** ✅ tag `blocos`

Ao tokenizar um dos modelos legados com os `{{BLOCO_*}}`, **marque a tag `blocos`
nele**, senão o pipeline vai continuar tratando como suspeito.

## Contrato do payload

```json
{
  "data": {
    "template_id": "6a74da7d5ef628c7be616088",
    "modelo_peticao": "MODELO PRINCIPAL",
    "nome_cliente": "...", "cpf": "...", "rg": "...", "pis": "...",
    "reclamadas": [{ "razao_social": "...", "cnpj": "...", "endereco": "..." }],
    "admissao": "2020-01-15", "demissao": "2024-03-30",
    "salario": "R$ 2.148,22",
    "tipo_dispensa": "sem justa causa",
    "fatos_narrados": "..."
  }
}
```

`template_id` é o caminho preferido. Sem ele, `resolverTemplate.js` casa
`modelo_peticao` por palavras-chave (com aliases e exigindo ≥2 palavras em
comum, para não acertar por acidente). Se nenhum dos dois resolver, o evento vira
`erro` e **nada é gerado** — melhor falhar que redigir sobre o modelo errado.

## Precisa configurar no Base44

- `WEBHOOK_SECRET` — **sem ele nenhum evento entra** (o `webhookReceber` responde 500).
- `CCT_API_KEY` — só a consulta de CCT; CNPJ, CEP e DataJud funcionam sem chave.
