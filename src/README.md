# Estrutura do código

A regra é uma só: **cada arquivo mora onde seu assunto mora.** Se você sabe o que
quer mexer, sabe onde procurar.

```
src/
├── App.jsx              Raiz. 14 linhas: só junta os contextos com as rotas.
├── main.jsx             Ponto de entrada do Vite.
├── index.css            Tailwind + variáveis de tema.
│
├── app/                 O CHASSI. Nada aqui é regra de negócio.
│   ├── AppProviders.jsx   Contextos: erro → auth → cache → roteador.
│   ├── AppRoutes.jsx      MAPA DE ROTAS + porteiro de autenticação.
│   ├── ErrorBoundary.jsx  Rede de segurança para erros de render.
│   ├── query-client.js    Configuração do React Query.
│   ├── auth/              Sessão do usuário e a tela de "não cadastrado".
│   └── layout/            Moldura visual: AppLayout (casca) + Sidebar (menu).
│
├── pages/               UMA TELA POR ROTA. É o índice do sistema.
│                        Cada arquivo aqui aparece em app/AppRoutes.jsx.
│
├── features/            OS DOMÍNIOS. Componentes e regras de cada assunto.
│   ├── peticoes/          Gerar, revisar, exportar e corrigir petições.
│   ├── defesa/            Contestação do empregador.
│   ├── backup/            Regras aprendidas com as correções.
│   └── especialistas/     Acesso aos 57 especialistas jurídicos.
│
├── components/ui/       DESIGN SYSTEM (shadcn). Botão, card, input, select…
│                        Componentes genéricos, sem nada do FAV. Não editar à mão:
│                        é o que o `shadcn add` gera.
│
├── lib/                 HELPERS TRANSVERSAIS — usados por 2+ domínios.
│                        Se só um domínio usa, o lugar é dentro da feature dele.
│
└── api/                 Cliente do Base44 (base44Client.js).
```

## Onde eu mexo para…

| Quero… | Vou em… |
|---|---|
| trocar o texto/campos de uma tela | `pages/<NomeDaTela>.jsx` |
| adicionar uma tela nova | crio em `pages/`, registro em `app/AppRoutes.jsx` e, se precisar de menu, em `app/layout/Sidebar.jsx` |
| mudar o menu lateral | `app/layout/Sidebar.jsx` |
| mudar como a petição é montada | `features/peticoes/petitionBuilder.js` |
| mudar o DOCX/PDF exportado | `features/peticoes/buildDocxFAV.js` e `ExportButtons.jsx` |
| mudar a margem/fonte do documento | `features/peticoes/petitionFormat.js` |
| mexer no fluxo de defesa | `features/defesa/` |
| chamar uma função de backend | `api/base44Client.js` → `base44.functions.invoke("nome")`; o código da função fica em `base44/functions/<nome>/entry.ts` |

## Duas convenções que valem manter

1. **Todo import interno começa com `@/`.** Nunca `../../lib/coisa`. `@/` aponta
   para `src/`, então o caminho não quebra quando o arquivo muda de lugar.
2. **Uma feature não importa outra feature.** Se `peticoes` e `defesa` precisam da
   mesma coisa, ela sobe para `lib/`. Isso é o que impede o emaranhado de voltar.
