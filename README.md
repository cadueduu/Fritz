# Leve

App (PWA, mobile-first) de acompanhamento de emagrecimento, em português do Brasil. Implementação do design exportado do Claude Design (pasta `design/`).

## Telas

- **Hoje** — anel de calorias animado, barras de macros, água, passos, refeições do plano e dica do agente.
- **Registrar** (botão +) — câmera/galeria, descrição por texto, busca (amostra TACO / Open Food Facts), bandeja de itens, "Do plano" e "Repetir de ontem".
- **Análise da foto** — skeleton de carregamento, alimentos com porção editável (slider/campo), confiança, "Corrigir", perguntas rápidas e comparação com o plano. Só soma no dia depois de "Comi isso".
- **Diário** — linha do tempo por dia, faixa da semana, visão semanal, editar porção e excluir com "Desfazer".
- **Progresso** — peso com média móvel de 7 dias, nova pesagem, medidas, fotos, calorias vs meta, aderência e consistência.
- **Agente** — resumo semanal, proposta para o nutrólogo (compartilhar) e chat com sugestões rápidas.
- **Meu plano** — "Tenho dieta" (metas e refeições do nutrólogo) ou "Não tenho dieta" (metas calculadas por Mifflin-St Jeor + déficit, com mínimo seguro).

Tema claro/escuro segue o sistema. Tamanhos de texto em `rem` para respeitar o tamanho de fonte do usuário (Dynamic Type no iOS).

## Nesta primeira versão

Tudo roda no navegador, sem backend. Os dados ficam no `localStorage` do aparelho. No primeiro acesso, o app vem com dados de exemplo das últimas 4 semanas.

Simulado por enquanto: reconhecimento da foto (sempre o mesmo prato de exemplo), leitura da dieta importada, respostas do agente, leitor de código de barras, microfone e exportar PDF. A foto tirada aparece de verdade na análise e como miniatura no Diário.

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
