# Leve

App (PWA, mobile-first) de acompanhamento de emagrecimento, em português do Brasil. Implementação do design exportado do Claude Design (pasta `design/`).

## Telas

- **Hoje** — anel de calorias animado, barras de macros, água, passos, refeições do plano e dica do agente.
- **Registrar** (botão +) — câmera/galeria, descrição por texto, busca (amostra TACO / Open Food Facts), bandeja de itens, "Do plano" e "Repetir de ontem".
- **Análise da foto** — skeleton de carregamento, alimentos com porção editável (slider/campo), confiança, "Corrigir", perguntas rápidas e comparação com o plano. Só soma no dia depois de "Comi isso".
- **Diário** — linha do tempo por dia, faixa da semana, visão semanal, editar porção e excluir com "Desfazer".
- **Progresso** — peso com média móvel de 7 dias, nova pesagem, medidas, fotos, calorias vs meta, aderência e consistência.
- **Agente** — chat com IA (Gemini, gratuito) que conhece seu perfil, metas e registros: monta a dieta, registra refeições, peso e água (sempre com um toque para confirmar) e analisa a semana.
- **Meu plano** — "Tenho dieta" (metas e refeições do nutrólogo) ou "Não tenho dieta" (metas calculadas por Mifflin-St Jeor + déficit, com mínimo seguro).

Tema claro/escuro segue o sistema. Tamanhos de texto em `rem` para respeitar o tamanho de fonte do usuário (Dynamic Type no iOS).

## Dados (Supabase)

Login com email e senha (Supabase Auth). Cada conta começa vazia. Refeições, água, pesagens, conversa com o agente e o plano ficam no Postgres do projeto Supabase **Fitz**, nas tabelas `profiles`, `entries`, `water`, `weights` e `messages`. Todas têm RLS: cada pessoa só lê e grava as próprias linhas. O perfil é criado por um trigger quando a conta é criada.

A URL do projeto e a chave publicável ficam em `.env`. Essa chave foi feita para ir no navegador; quem protege os dados é o RLS. Nunca coloque a chave `service_role` no app.

## Ainda simulado

Simulado por enquanto: reconhecimento da foto (sempre o mesmo prato de exemplo), leitura da dieta importada, leitor de código de barras e microfone. A foto tirada aparece de verdade na análise e como miniatura no Diário.

## Desenvolvimento

```sh
npm install
npm run dev      # servidor local
npm run build    # typecheck + build em dist/
npm run preview  # serve o build
```

React 19 + Vite + TypeScript, `vite-plugin-pwa` (manifest + service worker, funciona offline). Navegação por hash (`#/hoje`, `#/diario`…), então o build funciona em qualquer caminho.

## Publicação (GitHub Pages)

O workflow `.github/workflows/deploy.yml` publica a cada push na `main`. Uma vez só: em **Settings → Pages**, escolha **Source: GitHub Actions**. O site fica em `https://<usuário>.github.io/<repositório>/`.

## Publicação (Streamlit Community Cloud)

O Leve é um app React; o `streamlit_app.py` só hospeda o build que está em `leve_build/` (servido como componente estático em tela cheia).

No formulário "Deploy an app": repositório `cadueduu/Fritz`, branch `main`, arquivo `streamlit_app.py`.

Ao mudar o código, gere de novo e faça commit do build:

```sh
npm run build:streamlit
git add leve_build && git commit -m "Atualiza build"
```

Dentro do Streamlit o app não registra o service worker (não funciona offline nem é instalável); para isso, use o GitHub Pages.

## Agente (Supabase Edge Function + Gemini)

`supabase/functions/agente` usa o **Google Gemini** pelo plano gratuito. O app manda a conversa e um resumo dos seus dados (perfil, metas, plano, registros de 28 dias, água, pesagens). O agente responde e pode propor ações, cada uma com um botão de confirmar:

- **Dieta** — metas e refeições com "Usar esta dieta".
- **Refeição** — "comi 2 ovos e pão" vira kcal e macros com "Adicionar ao dia".
- **Peso** e **água** — "pesei 82,4", "bebi 2 copos".
- **Análise da semana** — em texto, com os números reais.

Chaves em **Supabase → Edge Functions → Secrets**: `GEMINI_API_KEY` (crie grátis em aistudio.google.com) e, opcional, `GEMINI_MODEL` (padrão `gemini-flash-latest`). No plano gratuito o Google pode usar as conversas para melhorar os produtos dele.

Para publicar mudanças na função: `supabase functions deploy agente`.
