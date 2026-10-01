<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Prometheus CRM — regras para agentes de IA

- **Idioma:** comunique-se e documente em **português do Brasil**. Nomes de domínio (tabelas, colunas, funções de negócio, componentes de feature) em português; primitivos de UI (`Button`, `Card`, `Badge`...) em inglês.
- **Arquitetura:** rotas finas em `src/app`; regra de negócio em `src/features/<dominio>/{queries,actions,schema}.ts` e `components/`. Utilitários em `src/lib`.
- **Banco:** toda mudança de schema é uma nova migration em `supabase/migrations` (`npm run db:nova nome`). Nunca edite migrations já aplicadas em produção. Regere os tipos com `npm run db:types`.
- **Segurança:** RLS ligado em todas as tabelas. `createAdminClient()` (chave secreta) só em rotas sem usuário logado (link público, webhooks, API v1, cron). Toda Server Action começa com `exigirEquipe()` ou `exigirAdmin()`.
- **Marca:** use os tokens de `globals.css` (`bg-volt`, `text-ink`, `tipo-h1`, `tipo-rotulo`...). Volt = uma ação principal por tela. Logotipo sempre pelos arquivos de `public/brand` (componente `Logo`), nunca redigitado.
- **Verificação:** antes de concluir, rode `npm run check` e `npm run build`.
