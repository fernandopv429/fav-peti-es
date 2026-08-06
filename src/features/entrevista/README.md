# Entrevista — geração de peça a partir de evento recebido

Portado do app **DocFlow AI** (`6a6526d39fede1a2a7a8c5a4`). 50 arquivos, ~7.900 linhas.

## O ponto mais importante

**Este app não tem formulário de entrevista.** O formulário vive no sistema de
origem. Aqui só chegam eventos por webhook, e é o webhook que diz qual modelo
preencher — não há escolha por IA nem tela de seleção.

```
[formulário externo]
        │  POST  /webhookReceber   (header X-Webhook-Secret)
        ▼
  WebhookEvento  ──► guarda payload + template_id
        │
        │  gerarPecaWebhook
        ▼
  PetitionTemplate[template_id]  ──► o DOCX tokenizado que será preenchido
        │
        ▼
  CasoTrabalhista (status: gerado)
```

### Contrato do payload

```json
{
  "data": {
    "template_id": "6a1f3ba52323c30eedd985d2",
    "nome_cliente": "...",
    "cpf": "...",
    "reclamadas": [{ "razao_social": "...", "cnpj": "...", "endereco": "..." }],
    "admissao": "2020-01-15",
    "demissao": "2024-03-30",
    "salario": "R$ 2.148,22",
    "tipo_dispensa": "sem justa causa",
    "fatos_narrados": "..."
  }
}
```

`template_id` aponta para um **`PetitionTemplate`** (os modelos DOCX que o FAV já
tinha: Vigilante 12x36, SINDEEPRES, SIEMACO, Limpeza, Contestação). Por tolerância,
`modelo_id`, `templateId` e `modeloId` também são aceitos, no nível `data` ou na
raiz do payload.

Se o `template_id` não resolver para nenhum `PetitionTemplate`, o evento é marcado
como `erro` e **nada é gerado** — melhor falhar do que redigir sobre o modelo errado.

## Organização

| Pasta | O que tem |
|---|---|
| `lib/` | 32 arquivos de regra de domínio. Os grandes: `entrevista.js` (orquestra o agente), `parserEntrevista.js` (interpreta o texto), `dadosTemplate.js` (monta os tokens do DOCX), `mathUtils.js` (verbas), `redacaoTeses.js` (redação por tese), `geracao.js` (pipeline final) |
| `components/` | `EntrevistaSession` (a sessão), `SessionTabs` (abas paralelas), `FilaWebhooks` (fila de eventos recebidos), `SessionLogsModal`, `ConfirmacaoGeracao` |
| `useSessions.js` | Multi-sessão: cada aba é uma instância isolada do agente |

## Entidades

Criadas automaticamente pelo Base44 a partir de `base44/entities/*.jsonc`:
`CasoTrabalhista`, `ModeloReferencia`, `EspecialistaConfig`, `IntegracaoConfig`,
`GeneratedDocument`, `WebhookEvento`, `ChatMessage`, `Template`.

Cuidado com dois nomes parecidos:

- **`PetitionTemplate`** (já era do FAV) — DOCX tokenizado que é *preenchido*. É o
  que o `template_id` do webhook aponta.
- **`ModeloReferencia`** — peça-exemplo que a IA lê como referência de *redação*.
  Não é preenchida. 9 registros copiados do DocFlow.

## Precisa configurar no Base44

Dois secrets, senão a parte correspondente fica degradada:

- `WEBHOOK_SECRET` — sem ele o `webhookReceber` responde 500 e **nenhum evento entra**.
- `CCT_API_KEY` — só a consulta de CCT; o resto (CNPJ, CEP, DataJud) funciona sem chave.
