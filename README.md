# Leve

App (PWA, mobile-first) de acompanhamento de emagrecimento, em português do Brasil. Implementação do design exportado do Claude Design (pasta `design/`).

## Telas

- **Hoje** — anel de calorias animado, barras de macros, água, passos, refeições do plano e dica do agente.
- **Registrar** (botão +) — câmera/galeria, descrição por texto, busca (amostra TACO / Open Food Facts), bandeja de itens, "Do plano" e "Repetir de ontem".
- **Análise da foto** — skeleton de carregamento, alimentos com porção editável (slider/campo), confiança, "Corrigir", perguntas rápidas e comparação com o plano. Só soma no dia depois de "Comi isso".
- **Diário** — linha do tempo por dia, faixa da semana, visão semanal, editar porção e excluir com "Desfazer".
- **Progresso** — peso com média móvel de 7 dias, nova pesagem, medidas, fotos, calorias vs meta, aderência e consistência.
- **Agente** — chat com IA (Gemini gratuito na conversa, Claude para montar a dieta) que conhece seu perfil, metas e registros: monta a dieta, registra refeições, peso e água (sempre com um toque para confirmar) e analisa a semana.
- **Meu plano** — "Tenho dieta" (metas e refeições do nutrólogo) ou "Não tenho dieta" (metas calculadas por Mifflin-St Jeor + déficit, com mínimo seguro).

Tema claro/escuro segue o sistema. Tamanhos de texto em `rem` para respeitar o tamanho de fonte do usuário (Dynamic Type no iOS).

## Dados (Supabase)

Login com email e senha (Supabase Auth). Cada conta começa vazia. Refeições, água, pesagens, conversa com o agente e o plano ficam no Postgres do projeto Supabase **Fitz**, nas tabelas `profiles`, `entries`, `water`, `weights` e `messages`. Todas têm RLS: cada pessoa só lê e grava as próprias linhas. O perfil é criado por um trigger quando a conta é criada.

A URL do projeto e a chave publicável ficam em `.env`. Essa chave foi feita para ir no navegador; quem protege os dados é o RLS. Nunca coloque a chave `service_role` no app.

## Ainda simulado

Simulado por enquanto: leitura da dieta importada, leitor de código de barras e microfone. A foto tirada aparece de verdade na análise e como miniatura no Diário.

## Desenvolvimento

```sh
npm install
npm run dev      # servidor local
npm run build    # typecheck + build em dist/
npm run preview  # serve o build
```

React 19 + Vite + TypeScript, `vite-plugin-pwa` (manifest + service worker, funciona offline). Navegação por hash (`#/hoje`, `#/diario`…), então o build funciona em qualquer caminho.

## Publicação (Streamlit Community Cloud)

O Leve é um app React; o `streamlit_app.py` só hospeda o build que está em `leve_build/` (servido como componente estático em tela cheia).

No formulário "Deploy an app": repositório `cadueduu/Fritz`, branch `main`, arquivo `streamlit_app.py`.

Ao mudar o código, gere de novo e faça commit do build:

```sh
npm run build:streamlit
git add leve_build && git commit -m "Atualiza build"
```

Dentro do Streamlit o app não registra o service worker, então não funciona offline nem é instalável.

## IA: quem faz o quê

| Parte | Modelo | Reserva |
|---|---|---|
| Conversa do agente (anamnese, dúvidas, registrar refeição/peso/água, análise da semana) | Google Gemini (`gemini-flash-latest`, plano gratuito) | Claude Haiku 5.5 |
| Montar a dieta (ferramenta `montar_dieta` chamada pela conversa) | Claude Sonnet 5.5 | — (`fallbacks: "default"` da Anthropic) |
| Análise da foto, da descrição e de um alimento digitado | Claude Haiku 5.5 | Gemini |

Chaves em **Supabase → Edge Functions → Secrets**: `ANTHROPIC_API_KEY` e `GEMINI_API_KEY` (de um projeto **sem cobrança** no Google AI Studio, para usar o plano gratuito). Opcional: `GEMINI_MODEL`. No plano gratuito o Google pode usar as conversas para melhorar os produtos dele; fotos e dietas vão para a Anthropic.

O agente faz uma anamnese antes da dieta (objetivo, saúde, sono, intestino, álcool, fome, treino, rotina de cozinha…) e anota as respostas no perfil (`profiles.onboarding.anamnese`). Dieta, refeição, peso e água aparecem como cartões com botão de confirmar.

Para publicar mudanças: `supabase functions deploy agente` e `supabase functions deploy analisar`.

## Cadastro e questionário

O cadastro pede nome, data de nascimento, sexo, altura e peso (o peso vira a primeira pesagem). Depois, um questionário define o objetivo (emagrecer, cutting, bulking, recomposição ou manter) e o peso desejado, a atividade e os treinos, os horários do dia — de onde saem os horários das refeições — e restrições alimentares. Dá para refazer em Meu plano.

Chaves em **Supabase → Edge Functions → Secrets**: `GEMINI_API_KEY` (crie grátis em aistudio.google.com) e, opcional, `GEMINI_MODEL` (padrão `gemini-flash-latest`). No plano gratuito o Google pode usar as conversas para melhorar os produtos dele.

Para publicar mudanças na função: `supabase functions deploy agente`.

## Análise da foto (TACO)

`supabase/functions/analisar` recebe a foto (reduzida para 1024 px), uma descrição em texto ou o nome de um alimento. A IA identifica cada alimento, estima a porção em gramas e escreve o nome no formato da tabela TACO; o servidor procura esse nome na tabela (mesmo alimento e mesmo preparo) e as calorias e os macros vêm da própria tabela (quando não há item na TACO, fica a estimativa da IA, marcada como "estimativa IA"). No app, cada item precisa ser conferido ("Está certo" ou "Não é isso") e a pessoa informa a refeição e o horário antes de somar ao dia.

A tabela é carregada de `src/data/taco.json` no GitHub (variável `TACO_URL` para trocar). Para publicar mudanças: `supabase functions deploy analisar`.

## Dados da tabela TACO

`src/data/taco.json` (597 alimentos, valores por 100 g) é gerado por `scripts/build-taco.mjs` a partir dos CSVs de [raulfdm/taco-api](https://github.com/raulfdm/taco-api) (MIT). Fonte original: **Tabela Brasileira de Composição de Alimentos – TACO, 4ª edição, NEPA/UNICAMP (2011)**, cuja reprodução é permitida com citação da fonte. A busca do Registrar usa a tabela inteira.
