<p align="center">
  <img src="public/brand/logo-cor.png" alt="Prometheus" width="280" />
</p>

<h3 align="center">Prometheus CRM</h3>
<p align="center">CRM integrado · Shopify · App · Grupo VIP<br/>Clientes, fornecedores, contas a pagar e <strong>pré-vendas por link no WhatsApp</strong>.</p>

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Stack](#2-stack)
3. [Começo rápido (passo a passo)](#3-começo-rápido-passo-a-passo)
4. [Estrutura de pastas](#4-estrutura-de-pastas)
5. [Funcionalidades](#5-funcionalidades)
6. [Pré-venda por link (fluxo completo)](#6-pré-venda-por-link-fluxo-completo)
7. [Banco de dados](#7-banco-de-dados)
8. [Autenticação e equipe](#8-autenticação-e-equipe)
9. [Mensagens de WhatsApp](#9-mensagens-de-whatsapp)
10. [Deploy: Supabase + Vercel + GitHub](#10-deploy-supabase--vercel--github)
11. [Integrações (n8n, Shopify, App, API)](#11-integrações-n8n-shopify-app-api)
12. [Identidade visual](#12-identidade-visual)
13. [Scripts](#13-scripts)
14. [Segurança e LGPD](#14-segurança-e-lgpd)
15. [Solução de problemas](#15-solução-de-problemas)
16. [Próximos passos sugeridos](#16-próximos-passos-sugeridos)

---

## 1. Visão geral

O Prometheus CRM é o sistema interno da loja para:

| Módulo | O que faz |
|---|---|
| **Visão geral** | Receita do mês (vs. mês anterior), pedidos, valores a receber, contas do mês, gráfico de receita semanal por canal, “precisa de atenção”, pedidos e atividades recentes. |
| **Clientes** | Cadastro manual completo (dados, WhatsApp, endereço com busca de CEP, VIP, tags). Ficha com LTV, ticket médio, pedidos, linha do tempo e envio de pré-venda personalizada. |
| **Banco de Leads** | Pastas com listas de contatos importadas de **CSV, Excel (XLS/XLSX) ou TXT**: prévia antes de importar, detecção das colunas (nome, WhatsApp, e-mail), WhatsApp normalizado, números repetidos ignorados, busca em qualquer coluna e selo de quem já é cliente — base para os disparos. |
| **Fornecedores** | Empresas (cervejarias, distribuidoras, serviços) e **vendedores** que atendem a loja, com as **empresas que cada um representa** (uma ou várias). |
| **Contas a pagar** | Contas **fixas** (geradas automaticamente todo mês) e **variáveis** (avulsas, com parcelamento), navegação **mês a mês**, situação (em dia / vence logo / vencida / paga). |
| **Produtos** | Catálogo de cervejas com estilo, volume, teor, preço, imagem (Supabase Storage), SKU e IDs da Shopify. |
| **Pré-vendas** ⭐ | Campanha com cervejas, preço, limite por cliente e estoque → **link público para disparar no WhatsApp**. O cliente escolhe, informa endereço **uma única vez** e o pedido cai no CRM. |
| **Pedidos** | Todos os canais (Grupo VIP, WhatsApp, Loja, Shopify, App), status operacional, pagamento, cobrança com mensagem pronta, impressão. Pedido manual com busca de cliente. |
| **Grupo VIP** | Vendas do grupo, **quantidade por cerveja/modelo**, filtros por pré-venda/período/pagamento, **impressão** (resumo + lista de separação) e **cobranças**. |
| **Configurações** | Dados da loja, PIX, modelos de mensagem, webhooks (n8n), fila de eventos, API, Shopify e equipe (convites e acessos). |

Referências visuais do Brand Kit: [`docs/referencias/mockup-desktop.png`](docs/referencias/mockup-desktop.png) e [`docs/referencias/mockup-mobile.png`](docs/referencias/mockup-mobile.png).

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Front + servidor | **Next.js 16** (App Router, Server Components, Server Actions, `proxy.ts`), **React 19**, TypeScript |
| Estilo | **Tailwind CSS v4** com os tokens da marca (`src/app/globals.css`) |
| Banco, Auth e Storage | **Supabase** (Postgres 17, RLS, funções SQL, Storage) via `@supabase/ssr` |
| Validação | **Zod 4** |
| Ícones | `lucide-react` |
| Hospedagem | **Vercel** (região `gru1` — São Paulo), Cron para a fila de eventos |
| Código | **GitHub** + GitHub Actions (lint, tipos e build a cada push) |

---

## 3. Começo rápido (passo a passo)

> Pré-requisitos: **Node.js 20.9+** (recomendado 24), **npm**, conta no **Supabase**, **Vercel** e **GitHub**.
> Opcional: [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`).

### 3.1 Instalar

```bash
npm install
cp .env.example .env.local
```

### 3.2 Preencher o `.env.local`

| Variável | Onde pegar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase › Project Settings › API → `https://uljyhexcghvfzgobznkt.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase › Project Settings › **API Keys** → *Publishable key* (`sb_publishable_...`) |
| `SUPABASE_SECRET_KEY` | Supabase › Project Settings › **API Keys** → *Secret key* (`sb_secret_...`) — **nunca** exponha |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` no seu computador; o domínio do CRM em produção |
| `INTEGRATIONS_API_KEY` | opcional — gere com `openssl rand -hex 32` (API `/api/v1`) |
| `CRON_SECRET` | opcional — gere com `openssl rand -hex 32` (rotina de eventos) |
| `SHOPIFY_WEBHOOK_SECRET` | opcional — Shopify › Configurações › Notificações › Webhooks |

### 3.3 Criar o banco (migrations)

O seu projeto Supabase **Prometheus CRM** (`uljyhexcghvfzgobznkt`, região São Paulo) já recebeu a **primeira migration (`base`)**. As demais são aplicadas assim:

```bash
supabase login
supabase link --project-ref uljyhexcghvfzgobznkt
supabase db push        # aplica as migrations que faltam, na ordem
```

> Sem o CLI? Abra **Supabase › SQL Editor** e execute, **na ordem**, cada arquivo de `supabase/migrations/` a partir de `20261001223100_fornecedores.sql` (a `base` já foi aplicada). Neste caso o CLI não saberá quais foram aplicadas — prefira o `db push`.

**Dados de demonstração (opcional):** `supabase/seed.sql` cria fornecedores, cervejas, clientes, uma pré-venda “Drop de Outubro”, pedidos e contas. Em produção, só rode no SQL Editor se quiser exemplos (dá para apagar depois).

### 3.4 Criar o primeiro usuário (administrador)

Supabase › **Authentication › Users › Add user › Create new user** (marque *Auto Confirm User*).
O **primeiro usuário vira administrador automaticamente**. Os próximos entram por convite (seção 8).

### 3.5 Rodar

```bash
npm run dev     # http://localhost:3000
```

### 3.6 Desenvolvimento 100% local (opcional, requer Docker)

```bash
npm run db:start        # sobe Supabase local (Studio em http://localhost:54323)
npm run db:reset        # recria o banco com migrations + seed
npm run db:types:local  # regenera os tipos TypeScript
```

---

## 4. Estrutura de pastas

```
.
├── supabase/
│   ├── migrations/                 # Schema versionado (SQL) — fonte da verdade do banco
│   │   ├── 20261001223031_base.sql                 # funções utilitárias, perfis, configurações
│   │   ├── 20261001223100_fornecedores.sql         # fornecedores, vendedores, vínculo N:N
│   │   ├── 20261001223200_contas_pagar.sql         # contas fixas/variáveis, geração mensal
│   │   ├── 20261001223300_clientes_produtos.sql    # clientes, produtos
│   │   ├── 20261001223400_pre_vendas_pedidos.sql   # pré-vendas, pedidos, timeline, RPCs, views
│   │   ├── 20261001223500_integracoes.sql          # webhooks, fila de eventos, Shopify
│   │   └── 20261001223600_permissoes_storage.sql   # grants e bucket de imagens
│   ├── templates/                  # E-mail de recuperação de senha (pt-BR)
│   ├── seed.sql                    # Dados de demonstração
│   └── config.toml                 # Supabase local
├── src/
│   ├── app/                        # Rotas (finas: só montam a tela)
│   │   ├── (crm)/                  # Área logada (sidebar)
│   │   │   ├── page.tsx            # Visão geral
│   │   │   ├── clientes/  fornecedores/  contas/  produtos/
│   │   │   ├── pre-vendas/  pedidos/  grupo-vip/  configuracoes/
│   │   ├── p/[slug]/               # ⭐ Página PÚBLICA da pré-venda (link do WhatsApp)
│   │   ├── login/  redefinir-senha/  sem-acesso/  auth/confirm/
│   │   └── api/                    # health, cron/eventos, webhooks/shopify, v1/*
│   ├── features/                   # Regras de negócio por domínio
│   │   └── <dominio>/
│   │       ├── queries.ts          # Leituras (server-only)
│   │       ├── actions.ts          # Server Actions (mutações)
│   │       ├── schema.ts           # Validação (zod)
│   │       └── components/         # Componentes do domínio
│   ├── components/
│   │   ├── ui/                     # Primitivos (Button, Card, Badge, Table, Kpi...)
│   │   ├── form/                   # ActionForm, Field, Input, AddressFields...
│   │   ├── layout/                 # Sidebar
│   │   ├── marca/                  # Logo e Ícone oficiais
│   │   └── dominio/                # Linha do tempo
│   ├── lib/                        # supabase/, auth, env, format, datas, whatsapp, validacao...
│   ├── types/                      # database.types.ts (gerado) + apelidos
│   └── proxy.ts                    # Sessão do Supabase + proteção das rotas
├── public/brand/                   # Arquivos oficiais da marca (logos, ícones, banner)
├── docs/referencias/               # Mockups do Brand Kit
├── vercel.ts                       # Configuração da Vercel (região, cron)
└── .github/workflows/ci.yml        # CI: lint + tipos + build
```

**Convenções**

- Nomes de domínio em **português** (`clientes`, `salvarCliente`, `FormularioCliente`); primitivos de UI em inglês (`Button`, `Card`).
- Toda Server Action começa com `exigirEquipe()` (ou `exigirAdmin()`), valida com zod e devolve `EstadoAcao` (`ok`, `mensagem`, `erros` por campo).
- Formulários usam `<ActionForm>` + `<Field name="...">`: erros aparecem embaixo de cada campo e o que foi digitado não se perde.
- Datas sempre no fuso **America/Sao_Paulo** (`src/lib/datas.ts`); dinheiro e telefones formatados em `src/lib/format.ts`.

---

## 5. Funcionalidades

### Clientes
- Cadastro manual com **WhatsApp normalizado** (`(11) 98765-4321` → `5511987654321`) — é a chave que identifica o cliente no link de pré-venda.
- Endereço com **preenchimento automático pelo CEP** (ViaCEP).
- **VIP**, tags, observações, origem (manual, pré-venda, Shopify, App).
- Lista com busca (nome, e-mail, WhatsApp), filtro “Só VIP”, LTV e status de relacionamento (Ativo ≤ 60 dias, Em risco ≤ 120, Inativo).
- Ficha: LTV, pedidos, ticket médio, em aberto, endereço, **linha do tempo**, botão de mensagem e **“Enviar pré-venda”** (link personalizado que já traz o WhatsApp do cliente).

### Fornecedores e vendedores
- **Empresas**: nome, razão social, CNPJ, contato, cidade/UF, observações.
- **Vendedores**: nome, WhatsApp, e-mail e **empresas que representa** (marque várias ou cadastre novas digitando os nomes separados por vírgula — são criadas na hora).
- Cada empresa mostra quais vendedores a atendem.

### Contas a pagar
- **Fixas**: modelo com valor, dia de vencimento, início e fim opcional. Ao abrir um mês, o sistema **gera as contas fixas daquele mês** (sem duplicar). Em meses curtos, usa o último dia.
- **Variáveis**: lançamento avulso, com **parcelamento** (cria uma conta por mês: “Lote (1/3)”, “(2/3)”...).
- Navegação **mês a mês**, indicadores (total, pago, a pagar, vencido), botão **Pagar** de um clique, reabrir, editar e cancelar (fixa: cancela só aquele mês).
- Editar o modelo fixo pode atualizar as contas pendentes do mês atual em diante.

### Produtos
- Cervejas com estilo, cervejaria, volume, teor, preço, descrição, **imagem** (upload para o bucket público `produtos`), SKU e IDs da Shopify (produto/variante).

### Pedidos
- Lista com filtros (canal, pagamento, status) e busca por número/cliente.
- Detalhe: itens, totais, endereço “congelado” do pedido, status operacional (novo → confirmado → separado → entregue / cancelado), **pagamento** (forma + confirmação), **cobrança pelo WhatsApp** (abre a conversa com a mensagem pronta e registra a cobrança), impressão e linha do tempo.
- **Pedido manual**: busca de cliente, venda avulsa (preço de catálogo) ou vinculada a uma pré-venda (preço, limites e estoque da pré-venda).
- Número amigável: `#PRM-10001`.

### Grupo VIP
- Todas as vendas com canal **Grupo VIP**, filtráveis por **pré-venda**, **período** e **situação do pagamento**.
- **Quantidade por cerveja/modelo** (para pedir ao fornecedor e separar) + total.
- Tabela de **cobranças**: itens de cada cliente, total, situação, quantas cobranças já foram enviadas, botões **Cobrar** (WhatsApp) e **Pago**.
- **Imprimir**: gera um relatório A4 com cabeçalho da marca, resumo por cerveja e a lista de separação por cliente (com caixinha “Separado”).

### Tarefas (demandas internas)
- **Quadro** A fazer → Fazendo → Concluído. No computador, arraste o cartão entre as colunas; no celular, escolha a coluna nas abas e mude o status dentro do cartão.
- Cada tarefa tem **um ou mais responsáveis** (membros da equipe com login), **prazo com data e hora**, **prioridade** (baixa, média, alta, urgente), detalhes e **imagens** (fotos ou prints — dá para colar com Ctrl+V; ficam no bucket privado `tarefas`, reduzidas no navegador para no máximo 2000 px).
- **Impedimento**: quando algo trava a tarefa, registre o motivo. O cartão fica vermelho com o motivo até alguém resolver (a resolução e o motivo antigo ficam no histórico).
- **Histórico** dentro do cartão: comentários da equipe + registro automático (pelo banco) de cada mudança — status, prazo, prioridade, responsáveis, imagens, impedimentos.
- **Avisos no login (sino 🔔)**: quem é marcado como responsável recebe o aviso na hora (tempo real) e ao entrar no CRM. Comentários, impedimentos, mudança de prazo e conclusão também avisam os envolvidos — nunca quem fez a ação. Abrir a tarefa marca os avisos dela como lidos.
- Atalhos **Minhas · Atrasadas · Impedidas · Sem prazo**, busca e filtros por responsável e prioridade. Concluídas mostram se foram entregues no prazo.
- Excluir: só quem criou a tarefa ou um administrador (o histórico e as imagens vão junto).
- Quem aparece para ser marcado: membros ativos com `perfis.participa_tarefas` ligado (padrão para membros novos). A conta técnica de desenvolvimento fica de fora.

### Influenciadores (programa de cupons)
Cada influenciador divulga um **cupom nativo da Shopify**; todo pedido da loja feito com o cupom vira uma venda dele, com a comissão calculada. A equipe acompanha em **Influenciadores** e cada influenciador entra no **Portal** (`/portal`) com e-mail e senha.

- **Cadastro** (Influenciadores › Novo): nome, e-mail (login do Portal), cupom, % de desconto do cliente, % de comissão, PIX e **“contar vendas a partir de”** (protege cupons que já existiam). Ao salvar, o CRM **cria o cupom na Shopify**; se o código já existir lá, ele é **ligado como está** (o CRM adota o percentual da Shopify).
- **Vendas**: a rotina `/api/cron/influenciadores` (a cada 15 min) lê os pedidos **atualizados** na Shopify e registra os que têm cupom de influenciador — pedido novo, pago, cancelado, estornado, devolução parcial. Há também **Ler pedidos agora** (Ajustes) e **Buscar na Shopify** (ficha do influenciador, relê o cupom desde a data escolhida).
- **Comissão** = produtos **depois do desconto e das devoluções, sem o frete** × o percentual do influenciador **no dia da 1ª leitura** (mudar a comissão depois não mexe no que já foi calculado).
- **Situações** da venda: *Aguardando pagamento* (pedido não pago) → *A liberar* (pago, dentro da carência) → *Disponível* (passou a carência: data do pedido + N dias) → *Paga* (entrou num repasse). *Cancelada*: pedido cancelado/estornado ou comissão cancelada pela equipe (com motivo; a sincronização não reativa).
- **Repasses**: a aba Repasses lista quem tem comissão disponível, com a chave PIX. Na ficha, **Registrar repasse** quita todas as comissões disponíveis de uma vez e aceita um **ajuste** (+/−, com motivo — ex.: pedido estornado depois de pago, bônus). Administradores podem **desfazer** um repasse lançado errado.
- **Estorno depois do repasse**: o valor pago não muda; a venda ganha um alerta e a ficha avisa para descontar no próximo repasse.
- **Relatórios**: visão geral por período (vendas, pedidos, comissão, ranking, evolução), lista de vendas com filtros (influenciador, situação, período, nº do pedido) e **planilha CSV**.
- **Pausar / encerrar**: desliga o cupom na Shopify (reativar liga de novo). O histórico e as comissões pendentes continuam.
- **Portal do influenciador** (`/portal`): cupom e **link de divulgação** (`loja/discount/CUPOM`, já aplica o desconto), saldos (disponível, a liberar, aguardando, recebido), vendas com filtros, repasses e “Minha conta” (contato, PIX, senha). O login é criado na ficha (**Criar acesso ao Portal**): senha temporária + mensagem pronta para o WhatsApp, como na Equipe.
- **Simulador no cadastro** (seção “Simular um pedido”, também pelo atalho na ficha): monta um pedido com produtos reais da loja (catálogo pela Admin API, `read_products`; sem essa permissão, a vitrine pública, que a Shopify limita) ou carrega um dos últimos pedidos (só itens e valores). Mostra produtos, desconto do cupom, quanto o cliente paga, comissão e quanto fica para a loja, acompanhando o % digitado no formulário. O desconto segue a conta do checkout (sobre o total, arredondado para baixo no centavo — conferido em 6 pedidos reais: `npm run test:simulacao`). Não grava nada.
- **Regras** (Influenciadores › Ajustes, só administradores): comissão e desconto padrão, **carência** (dias), nome e endereço da loja no Portal e o texto “como e quando pagamos”.

| Onde | O quê |
|---|---|
| `src/features/influenciadores/shopify.ts` | Admin API: cupons (`discountCodeBasicCreate`, ligar/desligar, percentual) e leitura dos pedidos |
| `src/features/influenciadores/cupom.ts` | `sincronizarCupomNaShopify()`: deixa o cupom da loja igual ao cadastro |
| `src/features/influenciadores/sincronizacao.ts` | `sincronizarVendas()` (cursor por data de atualização) e `buscarVendasDoCupom()` |
| `src/features/influenciadores/portal/` | Sessão (`exigirInfluenciador`), consultas e ações do Portal |
| `src/features/influenciadores/simulacao.ts` · `catalogo.ts` | Conta do simulador (pura, testada) e catálogo/pedidos recentes da loja |
| Migration `20261126100000_programa_de_influenciadores` | Tabelas, comissão, repasses, funções `portal_*()` e RLS |

### Configurações
- **Loja e mensagens**: nome, WhatsApp da loja, chave PIX, favorecido e os modelos de mensagem (seção 9).
- **Integrações**: webhooks (n8n), fila de eventos com reenvio, instruções da Shopify, cron e API.
- **Equipe**: convites por e-mail, liberar/bloquear acesso, promover a admin, editar o próprio perfil.

---

## 6. Pré-venda por link (fluxo completo)

```mermaid
sequenceDiagram
    autonumber
    actor Equipe
    participant CRM as Prometheus CRM
    participant WA as WhatsApp (grupo VIP)
    actor Cliente
    participant DB as Supabase

    Equipe->>CRM: Cria pré-venda (cervejas, preços, limites, encerramento)
    CRM->>DB: salvar_pre_venda()
    Equipe->>WA: "Disparar no WhatsApp" (mensagem + link /p/drop-de-outubro-x7k2)
    Cliente->>CRM: Abre o link e informa o WhatsApp
    CRM->>DB: identificar_cliente_pre_venda() — dados MASCARADOS
    alt Já é cliente
        CRM-->>Cliente: "Bom te ver, Mariana!" + endereço resumido
    else Primeira compra
        CRM-->>Cliente: Pede nome e endereço (CEP automático) — uma única vez
    end
    Cliente->>CRM: Escolhe as cervejas e confirma
    CRM->>DB: registrar_pedido_pre_venda() → criar_pedido()
    DB-->>DB: valida preço, limite por cliente e estoque (com trava)
    DB-->>CRM: Pedido #PRM-10234
    CRM-->>Cliente: Tela de confirmação + botão "Falar com a loja"
    Equipe->>CRM: Grupo VIP › imprime resumo por cerveja
    Equipe->>WA: "Cobrar" — mensagem pronta com itens, total e PIX
    Equipe->>CRM: "Pago" quando o comprovante chega
```

**Detalhes importantes**

- **Identificação pelo WhatsApp:** o cliente só precisa preencher os dados na primeira compra. Nas próximas, digita o número e o sistema puxa nome e endereço do cadastro.
- **Privacidade:** como o link é público, a tela mostra apenas o **primeiro nome** e um **endereço resumido/mascarado** (`Rua dos Pinh…, nº 1*** · Pinheiros`). E-mail, CPF e endereço completo nunca saem do servidor.
- **Outro endereço:** o cliente pode trocar o endereço de entrega; o novo endereço passa a ser o do cadastro (registrado na linha do tempo).
- **Preços e limites são validados no banco** (não dá para “burlar” pelo navegador). Estoque usa trava de linha (`for update`) para não vender além do disponível.
- **Grupo VIP:** quem compra por uma pré-venda com canal *Grupo VIP* passa a ser marcado como **VIP**.
- **Link personalizado:** `/p/drop-outubro?w=5511987654321` já preenche o WhatsApp (usado no botão “Enviar pré-venda” da ficha do cliente).
- **Encerramento:** após `encerra_em` (ou ao clicar “Encerrar”), o link mostra “pré-venda encerrada”.
- **Prévia no WhatsApp:** a página tem Open Graph com o banner da marca (`public/brand/banner-1500x500.png`).

---

## 7. Banco de dados

### 7.1 Diagrama

```mermaid
erDiagram
    perfis ||--o{ pre_vendas : cria
    fornecedores ||--o{ fornecedor_vendedores : ""
    vendedores ||--o{ fornecedor_vendedores : representa
    fornecedores ||--o{ contas_fixas : ""
    fornecedores ||--o{ contas_pagar : ""
    contas_fixas ||--o{ contas_pagar : "gera (1 por mês)"
    fornecedores ||--o{ produtos : ""
    pre_vendas ||--|{ pre_venda_itens : oferta
    produtos ||--o{ pre_venda_itens : ""
    clientes ||--o{ pedidos : faz
    pre_vendas ||--o{ pedidos : origina
    pedidos ||--|{ pedido_itens : contém
    produtos ||--o{ pedido_itens : ""
    clientes ||--o{ atividades : "linha do tempo"
    pedidos ||--o{ atividades : "linha do tempo"
```

### 7.2 Tabelas

| Tabela | Descrição |
|---|---|
| `perfis` | Membros da equipe (1:1 com `auth.users`), papel `admin`/`equipe`, `ativo`, `trocar_senha` (entrou com senha temporária), `participa_tarefas` (aparece como responsável no quadro de Tarefas). |
| `configuracoes` | Linha única: loja, PIX, modelos de mensagem. |
| `fornecedores` | Empresas fornecedoras. CNPJ só dígitos, único. |
| `vendedores` | Representantes comerciais. |
| `fornecedor_vendedores` | N:N — empresas que cada vendedor representa. |
| `contas_fixas` | Modelos recorrentes (valor, dia, início/fim). |
| `contas_pagar` | Contas do mês (`competencia` = dia 1). `tipo` fixa/variável; `unique(conta_fixa_id, competencia)` evita duplicar. |
| `clientes` | `whatsapp` único e normalizado; endereço principal; VIP; tags; IDs Shopify/App. |
| `produtos` | Catálogo; `sku` e `shopify_variant_id` únicos. |
| `pre_vendas` | Campanhas; `slug` único (link `/p/{slug}`), canal, status, encerramento, taxa de entrega. |
| `pre_venda_itens` | Produtos ofertados: preço, limite por cliente, quantidade disponível, ordem. |
| `pedidos` | Todos os canais. `numero` sequencial (10001+), `total` calculado, endereço “congelado”, cobranças, pagamento, `shopify_order_id`. |
| `pedido_itens` | Itens com nome/preço do momento da venda. Subtotal do pedido é recalculado por trigger. |
| `atividades` | Linha do tempo (cliente/pedido), gravada pelas funções e triggers. |
| `webhooks` | Destinos de eventos (n8n etc.) com segredo HMAC. |
| `eventos_integracao` | Fila *outbox* de eventos com tentativas e erros. |
| `tarefas` | Demandas internas: `numero`, status, prioridade, `prazo`, `impedimento` (motivo atual), `concluida_em`. |
| `tarefa_responsaveis` | N:N — quem cuida de cada tarefa (só membros ativos). |
| `tarefa_anexos` | Imagens da tarefa (bucket privado `tarefas`, `path` = `<tarefa_id>/<arquivo>`). |
| `tarefa_eventos` | Histórico da tarefa: comentários + registros automáticos gravados por trigger. |
| `notificacoes` | Avisos de cada membro (sino). Nascem no banco; o membro só marca como lido. |
| `influenciadores` | Influenciadores do programa: cupom, % de desconto, % de comissão, PIX, status, login do Portal (`usuario_id`) e situação do cupom na Shopify. |
| `influenciador_vendas` | Uma linha por pedido da Shopify com cupom de influenciador (`shopify_order_id` único): base, percentual, comissão, status e `liberar_em`. Só o servidor grava. |
| `influenciador_pagamentos` | Repasses: comissões quitadas + ajuste (`total` gerado), data e cópia da chave PIX. |

### 7.3 Visões (respeitam o RLS — `security_invoker`)

`vw_clientes` (LTV, pedidos, em aberto, último pedido) · `vw_pedidos` (cliente, pré-venda, unidades) · `vw_pre_vendas` (status efetivo, pedidos, total, recebido, unidades) · `vw_pre_venda_itens` (vendido e restante) · `vw_contas_pagar` (situação: em dia, vence logo, vencida, paga, cancelada) · `vw_tarefas` (responsáveis, anexos, comentários, atraso, busca) · `vw_influenciadores` (totais e saldos de cada um) · `vw_influenciador_vendas` (venda + `situacao` pronta para a tela).

### 7.4 Funções (RPC)

| Função | Quem chama | Para quê |
|---|---|---|
| `criar_pedido(cliente, itens, pre_venda?, canal?, origem?, observacoes?, endereco?, taxa?, desconto?)` | Equipe / servidor | Cria pedido + itens de forma atômica, preços do banco, limites e estoque. |
| `registrar_pedido_pre_venda(slug, cliente, itens, atualizar_endereco?, observacoes?)` | **Somente servidor** | Link público: cadastra/atualiza cliente e chama `criar_pedido`. |
| `identificar_cliente_pre_venda(whatsapp)` | **Somente servidor** | Retorna dados mascarados para o link público. |
| `salvar_pre_venda(dados, itens, id?)` | Equipe | Cria/edita pré-venda e itens numa transação. |
| `registrar_cobranca(pedido)` | Equipe / API | Conta a cobrança e marca o pedido como “cobrado”. |
| `gerar_contas_fixas(competencia)` | Equipe | Gera as contas fixas do mês (idempotente). |
| `definir_empresas_do_vendedor(vendedor, ids, novas)` | Equipe | Atualiza o vínculo vendedor × empresas. |
| `metricas_painel(inicio, fim)` · `receita_semanal(semanas)` · `resumo_produtos_vendidos(...)` | Equipe | Relatórios. |
| `importar_pedido_shopify(pedido)` | **Somente servidor** | Importação idempotente de pedidos da Shopify. |
| `pedido_json(pedido)` | Equipe / servidor | Pedido completo em JSON (eventos e API). |
| `criar_tarefa(dados, responsaveis)` | Equipe | Cria a tarefa e marca os responsáveis numa transação (os marcados recebem aviso). |
| `registrar_venda_influenciador(venda)` | Servidor | Registra/atualiza a venda de um pedido da Shopify com cupom (idempotente) e calcula a comissão. |
| `registrar_pagamento_influenciador(...)` | Equipe | Repasse: quita as comissões disponíveis e soma o ajuste. `desfazer_pagamento_influenciador` só para admin. |
| `bloquear_comissao_influenciador(venda, bloquear, motivo)` | Equipe | Cancela ou devolve a comissão de uma venda (não vale para comissão já paga). |
| `resumo_influenciadores(inicio, fim, id?)` · `ranking_influenciadores(...)` | Equipe | Totais, saldos, série por dia e ranking do período. |
| `portal_influenciador()` · `portal_resumo()` · `portal_vendas()` · `portal_pagamentos()` · `portal_atualizar_dados()` | Influenciador | Só os dados de quem está logado (`auth.uid()`), sem nenhum dado de cliente. |

### 7.5 Segurança no banco (RLS)

- **RLS ligado em todas as tabelas.** Usuário logado só acessa algo se for **membro ativo** da equipe (`eh_membro_equipe()`).
- O papel `anon` não tem acesso a nenhuma tabela nem função — o link público passa pelo **servidor** com a chave secreta.
- Só **administradores** mudam papel/acesso de perfis (trigger `proteger_campos_do_perfil`).
- Storage: bucket `produtos` público para leitura; upload apenas pela equipe.
- **Influenciadores são logins de fora da equipe**: não têm linha em `perfis` (o gatilho de `auth.users` pula quem nasce com `tipo = influenciador`), então nenhuma tabela do CRM abre para eles. O Portal lê só pelas funções `portal_*()`, presas ao `auth.uid()`. **Toda função nova** precisa de `revoke execute ... from public, anon, authenticated` e de um `grant` explícito para quem pode chamar: o Supabase libera funções novas para qualquer login por padrão.

### 7.6 Criando novas migrations

```bash
npm run db:nova nome_da_mudanca     # cria supabase/migrations/<timestamp>_nome_da_mudanca.sql
# escreva o SQL, teste (npm run db:test — sem Docker — ou npm run db:reset) e depois:
npm run db:push
npm run db:types                    # atualiza src/types/database.types.ts
```

Nunca edite uma migration já aplicada em produção — crie outra.

---

## 8. Autenticação e equipe

- Login por **e-mail e senha** (Supabase Auth). Cadastro público **desativado** por design (CRM interno).
- **Primeiro usuário** = administrador ativo. Os demais nascem **inativos** até um admin liberar — exceto quem é **cadastrado pelo admin** (Configurações › Equipe), que já entra liberado.
- **Cadastro da equipe (sem e-mail)**: o admin informa nome, e-mail, cargo e papel → o CRM cria a conta com uma **senha temporária** (`xxxx-xxxx-xxxx`) e mostra a senha com uma mensagem pronta para copiar e mandar (ex.: WhatsApp). A senha não fica salva em lugar nenhum e não aparece de novo.
- **Primeiro acesso**: enquanto `perfis.trocar_senha` estiver ligado, qualquer tela do CRM leva para **Crie sua senha** (`/redefinir-senha`). Ao salvar a senha pessoal, o acesso é liberado.
- **Nova senha** (lista de membros, só admin): gera outra senha temporária — para quem esqueceu a senha ou contas de convites antigos por e-mail. A senha anterior para de funcionar.
- **Esqueceu a senha**: o CRM não envia e-mails — a tela de login orienta a pedir ao administrador uma **Nova senha**.

### Configurar no painel do Supabase (produção)

1. **Authentication › Sign In / Providers › Email**: desative *Allow new users to sign up*.
2. Só se alguém enviar recuperação de senha pelo próprio painel do Supabase (*Authentication › Users*): ajuste em **Authentication › URL Configuration** a *Site URL* (`https://SEU-DOMINIO`) e as *Redirect URLs* (`https://SEU-DOMINIO/**`), e use o modelo `supabase/templates/recuperar-senha.html` em **Email Templates › Reset password** (link `/auth/confirm?token_hash=...`). O CRM em si não depende disso.

---

## 9. Mensagens de WhatsApp

Os textos ficam em **Configurações › Mensagens** (com prévia de como chegam no WhatsApp). Use `*negrito*` do WhatsApp e as variáveis:

| Mensagem | Variáveis |
|---|---|
| Divulgação da pré-venda | `{titulo}` `{descricao}` `{link}` `{encerra_em}` `{entrega}` |
| Cobrança | `{nome}` (primeiro nome) `{pedido}` `{pre_venda}` `{itens}` (lista com quantidades e valores) `{total}` `{pagamento}` (bloco PIX) `{pix}` (só a chave) |

Os botões usam links `https://wa.me/...` — abrem o WhatsApp Web/App com a mensagem pronta (sem custo e sem API). Para envio automático, veja n8n na seção 11.

---

## 10. Deploy: Supabase + Vercel + GitHub

### 10.1 GitHub

```bash
git init            # se ainda não for um repositório
git add .
git commit -m "Prometheus CRM v1.0"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/prometheus-crm.git
git push -u origin main
```

O workflow `.github/workflows/ci.yml` roda **teste do banco + lint + tipos + build** a cada push e pull request.

### 10.2 Supabase

1. Aplicar as migrations (seção 3.3).
2. Configurar Auth (seção 8).
3. Criar o primeiro usuário (seção 3.4).
4. Conferir **Advisors** (Database › Advisors) — segurança e performance.

### 10.3 Vercel

1. **Add New › Project** → importe o repositório do GitHub (framework Next.js detectado).
2. **Settings › Environment Variables** — cadastre (Production e Preview):

   | Variável | Obrigatória |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | ✅ |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ |
   | `SUPABASE_SECRET_KEY` | ✅ |
   | `NEXT_PUBLIC_SITE_URL` | ✅ (ex.: `https://crm.suaempresa.com.br`) |
   | `CRON_SECRET` | recomendado |
   | `INTEGRATIONS_API_KEY` | se usar a API |
   | `SHOPIFY_WEBHOOK_SECRET` | se usar Shopify |

3. **Deploy.** A cada push na `main` a Vercel publica automaticamente; PRs geram *preview*.
4. **Domínio:** Settings › Domains (ex.: `crm.suaempresa.com.br`) — atualize `NEXT_PUBLIC_SITE_URL` e a *Site URL* do Supabase.

`vercel.ts` define a região **gru1 (São Paulo)** — a mesma do seu Supabase (sa-east-1) — e o **cron** `/api/cron/eventos`.

> Com a CLI: `npm i -g vercel`, depois `vercel link`, `vercel env pull .env.local` e `vercel --prod`.

---

## 11. Integrações (n8n, Shopify, App, API)

### 11.1 Eventos → n8n (webhooks de saída)

Toda mudança relevante gera um evento na tabela `eventos_integracao` (padrão *outbox*). O CRM entrega cada evento, logo após a ação, para os webhooks cadastrados em **Configurações › Webhooks**. Falhas são tentadas de novo com espera crescente (1, 2, 4… min, até 8 tentativas) pela rotina `/api/cron/eventos`.

**Eventos:** `pedido.criado` · `pedido.atualizado` · `pedido.pago` · `pedido.cancelado` · `cliente.criado` · `cliente.atualizado` · `pre_venda.criada` · `pre_venda.atualizada` · `whatsapp.mensagem_recebida` · `atendimento.transferido` (e `teste.ping` no botão “Testar”).

**Eventos do Atendimento (WhatsApp):**

- `whatsapp.mensagem_recebida`: o cliente mandou mensagem e a conversa não tinha aviso pendente. Mensagens seguidas antes de alguém abrir ou responder a conversa não geram outro evento. `responsavel` é quem está com a conversa (nulo = na fila). No primeiro contato de um atendimento (`novo: true`), `atendimento.motivo` diz como ele foi distribuído: `rodizio`, `retorno` (voltou para quem atendeu da última vez) ou `fila` (rodízio desligado). Nas mensagens seguintes, `motivo` vem nulo. `responsavel.whatsapp` é o WhatsApp pessoal do perfil (Configurações › Meu perfil); conversas da loja com esses números não entram no Atendimento. Fluxo pronto no n8n: *Prometheus CRM - Aviso de Cliente Novo (rodízio do WhatsApp)*.

  ```json
  { "atendimento": { "id": "…", "numero": 812, "novo": true, "motivo": "rodizio", "caminho": "/atendimento?aba=abertos&id=…" },
    "contato": { "nome": "João Silva", "whatsapp": "5511987654321" },
    "responsavel": { "id": "…", "nome": "Renan Rodrigues", "email": "…", "whatsapp": "5511…" },
    "mensagem": { "previa": "Oi, tem a IPA de 500 ml?", "tipo": "texto", "enviada_em": "2026-11-12T17:32:05Z", "hora": "14:32", "data": "12/11/2026" } }
  ```

- `atendimento.transferido`: alguém transferiu a conversa. Traz `atendimento`, `contato`, `responsavel` (quem recebeu), `transferido_por` e `ultima_mensagem`.

**Requisição enviada:**

```http
POST https://seu-n8n.com/webhook/prometheus
Content-Type: application/json
X-Prometheus-Evento: pedido.criado
X-Prometheus-Entrega: 6f1c...  (id único — use para não processar duas vezes)
X-Prometheus-Assinatura: sha256=<HMAC-SHA256 do corpo com o segredo do webhook>

{
  "id": "6f1c...",
  "tipo": "pedido.criado",
  "criado_em": "2026-10-01T14:32:00Z",
  "dados": {
    "id": "...", "numero": 10482, "canal": "grupo_vip", "total": 389.9,
    "status": "novo", "status_pagamento": "pendente",
    "cliente": { "id": "...", "nome": "Mariana Costa", "whatsapp": "5511987654321", "vip": true },
    "pre_venda": { "id": "...", "titulo": "Drop de Outubro", "slug": "drop-outubro" },
    "itens": [{ "descricao": "Hop Hunters IPA · 473 ml", "quantidade": 6, "preco_unitario": 21.9, "total": 131.4 }],
    "endereco_entrega": { "logradouro": "...", "numero": "...", "cidade": "...", "uf": "SP" }
  }
}
```

**Validar a assinatura no n8n** (nó *Code*, JavaScript):

```js
const crypto = require('crypto')
const segredo = 'COLE_O_SEGREDO_DO_WEBHOOK'
const corpo = JSON.stringify($json.body)          // ative "Raw Body" no Webhook node para máxima precisão
const esperado = 'sha256=' + crypto.createHmac('sha256', segredo).update(corpo).digest('hex')
if ($json.headers['x-prometheus-assinatura'] !== esperado) throw new Error('Assinatura inválida')
return $input.all()
```

**Receitas prontas para montar no n8n**

| Gatilho | Ação |
|---|---|
| `pedido.criado` | Enviar confirmação + dados do PIX pelo WhatsApp Business API / Z-API / Evolution API; depois `POST /api/v1/pedidos/{id}/cobranca`. |
| `pedido.pago` | Mensagem de agradecimento; avisar a logística; lançar no financeiro. |
| `pre_venda.criada` | Disparar a mensagem com o link em listas de transmissão. |
| `whatsapp.mensagem_recebida` | Avisar o responsável no WhatsApp pessoal: “Novo cliente para você: João Silva, às 14:32”. |
| Webhook do banco/PSP de PIX | `PATCH /api/v1/pedidos/{id}` com `{"status_pagamento":"pago","forma_pagamento":"PIX"}`. |
| Agendamento a cada 1 min | `GET /api/cron/eventos` com `Authorization: Bearer CRON_SECRET` (reenvio rápido no plano Hobby). |

### 11.2 API REST `/api/v1` (n8n, App próprio)

Autenticação: `Authorization: Bearer <INTEGRATIONS_API_KEY>` (ou header `x-api-key`). Respostas em JSON: `{ "dados": ... }` ou `{ "erro": "..." }`.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/clientes?whatsapp=&email=&q=&vip=true&limite=` | Busca clientes (com LTV e em aberto) |
| POST | `/api/v1/clientes` | Cria/atualiza pelo WhatsApp (`nome`, `whatsapp`, `email`, endereço, `vip`, `tags`, `app_usuario_id`) |
| GET | `/api/v1/pedidos?status_pagamento=&canal=&pre_venda=&desde=&limite=` | Pedidos com cliente e itens |
| GET | `/api/v1/pedidos/{id}` | Pedido completo |
| PATCH | `/api/v1/pedidos/{id}` | Atualiza `status`, `status_pagamento`, `forma_pagamento`, `observacoes` |
| POST | `/api/v1/pedidos/{id}/cobranca` | Registra cobrança enviada |
| GET | `/api/v1/pre-vendas?status=ativa` | Pré-vendas com o `link` público |
| GET | `/api/v1/produtos?ativos=false` | Catálogo |
| GET | `/api/health` | Saúde (sem autenticação) |

Exemplos:

```bash
# Buscar cliente pelo WhatsApp
curl -H "Authorization: Bearer $INTEGRATIONS_API_KEY" \
  "https://SEU-DOMINIO/api/v1/clientes?whatsapp=11987654321"

# Confirmar pagamento
curl -X PATCH -H "Authorization: Bearer $INTEGRATIONS_API_KEY" -H "Content-Type: application/json" \
  -d '{"status_pagamento":"pago","forma_pagamento":"PIX"}' \
  "https://SEU-DOMINIO/api/v1/pedidos/<ID>"
```

### 11.3 Shopify

1. Shopify Admin › **Configurações › Notificações › Webhooks** → crie webhooks em **JSON** para `https://SEU-DOMINIO/api/webhooks/shopify` com os eventos `orders/create`, `orders/updated`, `orders/paid`, `orders/cancelled`, `customers/create`, `customers/update`.
2. Copie o segredo de assinatura exibido pela Shopify para `SHOPIFY_WEBHOOK_SECRET`.
3. Vincule os produtos: preencha **ID da variante** (ou use o mesmo **SKU**) no cadastro de produtos.

Como funciona: assinatura HMAC validada → `importar_pedido_shopify()` encontra o cliente (ID Shopify → WhatsApp → e-mail) ou cria um novo, importa o pedido com os valores da Shopify (canal `shopify`) e, se o pedido já existir, apenas sincroniza pagamento/status (idempotente).

#### 11.3.1 Frete calculado pelo Olist Envios (link da pré-venda)

Para os pedidos do link com **CEP fora da lista de CEPs VIP**: em vez de a equipe cotar na mão, o CRM pergunta à loja da Shopify quanto custa o envio — a Shopify consulta o app **Olist Envios** instalado nela — e cobra a **opção mais barata**, já somada no PIX. Nada é criado na Shopify (é só o cálculo `draftOrderCalculate`) e o cliente não precisa de conta na loja. A etiqueta continua sendo comprada na Olist.

**Regras** (decisões do dono da loja, 2026-11-25)

- **Peso:** 500 g por cerveja (`PESO_POR_CERVEJA_KG`); o kit conta cada cerveja de dentro (`unidades_para_frete`). A Shopify recebe N itens de 500 g — a mesma conta do checkout da loja para N latas.
- **Opção:** sempre a mais barata, e só as do Olist Envios. O outro app de frete da loja (ShipZip, a “Entrega VIP”) fica de fora: frete fixo é assunto da lista de CEPs do CRM.
- **Um frete por caixa:** o cálculo vale para as cervejas e o CEP da hora (`pedidos.frete_cotacao`). Cerveja nova na caixa ou CEP novo → o frete volta para “a cotar” e é calculado de novo para a caixa inteira.
- **Quando calcula:** na tela final do link (o cliente vê o valor antes de escolher), ao fechar a caixa, ao abrir `/pagar/{pedido}`, quando a equipe fecha a caixa para cobrar e no botão **Calcular pelo Olist Envios** do pedido.
- **Se falhar** (Shopify fora do ar, CEP sem opção, permissão): o pedido fica “frete a cotar”, com o motivo na ficha e na linha do tempo, e a equipe informa o valor como antes. Depois de uma falha o link espera 45 s para tentar de novo.
- **Frete informado à mão** pela equipe nunca é trocado pelo cálculo. Pedido pago, separado ou cancelado não é recalculado.

**Conexão** (Configurações › Shopify, só administradores): app criado no **Dev Dashboard a partir do admin da própria loja** (mesma organização), com o escopo `write_draft_orders`, instalado na loja. O CRM guarda loja + Client ID em `integracao_shopify` e o Client secret + token no **Vault**; o token vale 24 h e é renovado sozinho (client credentials grant). A mesma tela tem o **Testar um frete** (CEP + quantidade de cervejas).

| Onde | O quê |
|---|---|
| `src/features/shopify/cotacao.ts` | Regras puras: peso, endereço no formato da Shopify, escolha da mais barata (`npm run test:frete`) |
| `src/features/shopify/api.ts` | Token (client credentials) e `draftOrderCalculate` |
| `src/features/shopify/frete.ts` | `garantirFreteDoPedido()`: o banco decide se calcula (`frete_a_calcular`) e grava (`aplicar_frete_calculado`) |
| Migration `20261125200000_frete_olist_envios_shopify` | `integracao_shopify`, `pedidos.frete_cotacao`, funções acima e o recálculo em `registrar_pedido_pre_venda` |

#### 11.3.2 Programa de influenciadores (cupons e pedidos)

O mesmo app da loja ganha três escopos: **`read_products`** (catálogo do simulador do cadastro), **`read_orders`** (ler valor, situação e cupons dos pedidos — nenhum dado do cliente vai para o programa) e **`write_discounts`** (criar, pausar e reativar os cupons). Passo a passo em **Influenciadores › Ajustes** (nova versão do app no Dev Dashboard com os três escopos → Release → aprovar na loja → “Conferir permissões”).

- **Sem `write_discounts`** o programa funciona, mas cada cupom é criado e pausado à mão em Descontos, no admin da Shopify (a ficha do influenciador mostra “Falta criar na Shopify”).
- **Sem `read_orders`** nenhuma venda chega: a leitura dos pedidos é a fonte das comissões. `read_orders` enxerga os **últimos 60 dias** — por isso a primeira leitura e o “Buscar na Shopify” vão até 60 dias atrás.
- **Webhook opcional**: se os webhooks `orders/*` da seção 11.3 estiverem ligados, a venda com cupom entra na hora (mesma função `registrar_venda_influenciador`); a rotina de 15 min continua conferindo tudo.
- O cupom criado pelo CRM vale para **todos os produtos e clientes**, sem limite de usos, e **soma com frete grátis** (não soma com outros descontos de produto ou de pedido). Para regras diferentes, edite o cupom na Shopify: o CRM só mexe no percentual e no liga/desliga.

### 11.4 App próprio

Já preparado: canal `app`, coluna `clientes.app_usuario_id`, origem `app`, API `/api/v1` para criar clientes/consultar pedidos e eventos via webhook para manter o App sincronizado.

### 11.5 Olist ERP (API v3) — painel "Vendas por canal"

O painel da Visão geral mostra as vendas do **Mercado Livre, Shopee e Loja Virtual (Shopify)** a partir do Olist ERP e as do **Grupo VIP** a partir dos pedidos do próprio CRM, com filtros (hoje, 7/30/60/90 dias, este mês, mês passado), gráfico de pizza da participação por canal e gráfico de evolução (por dia até 45 dias; por semana acima disso).

**Critério = Dashboard de vendas do Olist** (conferido ao centavo: 189 pedidos / R$ 29.122,53 nos mesmos 30 dias): pela data do pedido, todas as situações **exceto Aberta, Cancelada e Dados incompletos**. A regra fica num só lugar, a função `situacao_erp_conta_venda()` no banco. "Últimos N dias" = de hoje − N até hoje (inclusive), como no Olist. Pedidos de outros e-commerces (ex.: Magalu, API Tiny) e sem e-commerce ficam de fora. Grupo VIP: pedidos do CRM não cancelados.

**Configuração (uma vez):**

1. No Olist: **Menu › Configurações › aba Geral › Aplicativos › + novo aplicativo**. Permissões: **Leitura** em **Pedidos** e **Produtos**; **Leitura e Escrita** em **Estoque** (estoque das pré-vendas, seção 11.5.1). Mudou as permissões de um aplicativo já conectado? Clique em **Reconectar**. URL de redirecionamento: `https://SEU-DOMINIO/api/olist/callback` (a tela Configurações › Olist ERP mostra a URL exata para copiar).
2. Na Vercel, cadastre `OLIST_CLIENT_ID`, `OLIST_CLIENT_SECRET` e `CRON_SECRET` (`openssl rand -hex 32`) e faça um novo deploy.
3. Em **Configurações › Olist ERP**, um administrador clica em **Conectar Olist** e autoriza. A primeira sincronização importa 13 meses de histórico.

**Como funciona:**

- OAuth2 (Keycloak do Olist): o token de acesso vale 4 h e o de renovação, 1 dia. Os tokens ficam em `integracao_olist`, tabela sem acesso pela equipe (só o servidor); a interface lê apenas o status por `status_integracao_olist()`.
- A rota `/api/cron/olist` (protegida por `CRON_SECRET`) renova o token e sincroniza para `pedidos_erp` os pedidos criados na janela do modo + os alterados desde a última execução. É a única parte que usa a chave secreta do Supabase. Modos: `?modo=rapida` (7 dias), padrão (62 dias) e `?modo=completa` (13 meses, reconcilia tudo).
- Quem chama a rota: a Vercel Cron 6x por dia (a cada ~4 h, compatível com o plano Hobby — mantém o token vivo; a das 2h de Brasília é a reconciliação completa), o botão **Atualizar** e a Visão geral: se os dados têm mais de 10 min, ela sincroniza (modo rápido) **antes** de mostrar os números, esperando no máximo 8 s.
- Se a renovação falhar por mais de 1 dia, a conexão expira: o painel avisa e basta **Reconectar** (o histórico importado é mantido).
- Limite da API: 60 requisições/min no plano Evoluir (por conta, compartilhado entre aplicativos). Uma sincronização normal usa poucas requisições; a importação inicial, ~1 por 100 pedidos.
- Código: `src/features/olist/` (OAuth, cliente da API, sincronização) e `src/features/vendas/` (painel).

#### 11.5.1 Estoque da Olist nas pré-vendas

Na pré-venda, **Buscar na Olist** traz o produto (título, foto principal copiada para o Storage, preço sugerido; kit com as cervejas que o compõem) e o vincula (`produtos.olist_id` / `olist_kit`). A partir daí **o estoque da Olist vale no link** e a Olist fica certa — sem criar pedido de venda nem nota fiscal lá:

- **Cerveja entrou na Caixa VIP** (link ou pedido manual de pré-venda) → lançamento de **saída** na Olist. Kit baixa cada componente.
- **Cancelado, item removido, pedido excluído, pré-venda excluída ou caixa vencida** → lançamento de **entrada**. Se a saída ainda nem tinha chegado à Olist, as duas se anulam (nada é enviado).
- **Caixa VIP sem nenhum pagamento** é cancelada sozinha depois de `configuracoes.caixa_prazo_pagamento_dias` (padrão 7; 0 = nunca), contados da última compra, do fechamento ou da última cobrança. Caixa paga, com parte paga ou com PIX em aberto não vence. Aviso no sino.

Como funciona:

- O banco cria cada lançamento em `movimentos_estoque_olist` na **mesma transação** da venda/cancelamento (gatilhos em `pedido_itens` e `pedidos`), e a compra confere o estoque com trava (`adicionar_itens_pre_venda` + `travar_estoque_olist`): duas pessoas não levam a última unidade.
- Estoque que vale no link = disponível lido na Olist (`estoque_olist`) − lançamentos que a Olist ainda não refletiu (`estoque_olist_efetivo`). O CRM já desconta a unidade antes de a Olist confirmar.
- O servidor envia a fila logo depois de cada ação, somando por produto (um lançamento por produto e rodada); a rotina `/api/cron/olist-estoque` (a cada 5 min) reenvia o que ficou, cancela caixas vencidas e lê de novo o estoque das pré-vendas ativas. Limite de chamadas → espera e tenta depois; recusa da Olist → status `erro` + aviso no sino; envio sem resposta → `conferir` (não repete sozinho, para não lançar em dobro). Os dois aparecem em **Configurações › Olist ERP** com "Tentar de novo" / "Já acertei na Olist".
- **Aviso de estoque da Olist (webhook)**: instale o aplicativo **Webhooks** na Olist e ative **Lançamentos de estoque** com a URL mostrada no cartão da Olist (`/api/olist/webhook?chave=…`, chave derivada do `CRON_SECRET`). Assim uma venda no Mercado Livre/Shopee atualiza o link na hora.
- O refresh token da Olist muda a cada uso: a renovação tem trava (`integracao_olist.renovando_token_desde`) e é compartilhada com a sincronização de vendas (`src/features/olist/token.ts`).
- Código: `src/features/olist/estoque.ts` (fila, leituras, webhook), `rotina-estoque.ts` (pedidos da tela), `components/janela-olist.tsx`; migration `20261113180000_estoque_olist.sql`; testes no `npm run db:test`.

#### 11.5.2 Balanço de estoque pelos lotes (a contagem vai para a Olist)

Em **Lotes e validades**, o botão **Balanço de estoque** da cerveja abre a contagem por lote: a equipe informa quanto contou de cada lote (0 se acabou) e, se chegou mercadoria, os lotes novos. **A soma vira o estoque da cerveja na Olist — exatamente esse número** (lançamento do tipo "Balanço" da Olist), e os lotes do CRM ficam iguais à contagem. Cerveja que ainda não está no controle faz o balanço pela prévia da busca (`/lotes/novo/balanco`) e entra no controle junto.

- **Só o número do estoque muda na Olist.** A trava de escrita (`conferirEscritaOlist`, em `src/features/olist/api.ts`) só deixa passar `POST /estoque/{id}` com os campos `tipo`, `quantidade`, `precoUnitario` (o custo médio atual) e `observacoes`: tipos S/E de 1 a 1.000 un. (pré-vendas) e tipo B de 0 a 100.000 un. (balanço). Cadastro, preços, custo, EAN e peso nunca são enviados. Testado no produto clone de teste: o cadastro fica idêntico, só o saldo muda. **Não afrouxe a trava.**
- **Todo balanço nasce de um registro.** A tela chama `iniciar_balanco_dos_lotes` (banco), que valida a contagem e grava em `lotes_balancos` quem contou, a contagem de cada lote e o total. O servidor (`enviarBalancoParaOlist`, em `src/features/lotes/olist.ts`, pela rota `/api/cron/olist-estoque` com `{ acao: 'lote-balanco', balanco }`) só lança a partir desse registro, uma vez só e logo depois de criado: lê o saldo, lança, lê de novo para conferir e chama `concluir_balanco_dos_lotes`, que numa transação deixa os lotes iguais à contagem e registra tudo no histórico do produto (`lote_movimentos`: evento `balanco` + o ajuste de cada lote, com o autor).
- **Falhas ficam registradas.** A Olist recusou (4xx) → `recusado`: nada mudou lá nem nos lotes. Sem resposta, ou a Olist mudou e os lotes não foram gravados → `conferir`: a tela da cerveja avisa, e refazer o balanço com os mesmos números resolve (o balanço troca o saldo pelo número, então repetir não soma nada). Os dois viram `falha_balanco` no histórico.
- **Observação na Olist:** `BALANÇO PELO CRM #id · contado N un. (a Olist tinha M) · por Fulano · lotes: L1 q1, L2 q2…` (até 250 caracteres).
- **Caixa VIP:** a cerveja que entra numa Caixa VIP já saiu do estoque da Olist, mas a garrafa fica na prateleira até a caixa ser separada. O balanço envia o número exato e **avisa** quantas unidades estão nessa situação (`caixa_vip_do_produto_olist`), para a equipe não contar essas garrafas.
- **Salvar lote não é balanço.** O formulário "Salvar lote" só organiza em lotes as unidades que já estão na Olist (não envia nada, e não deixa passar do estoque de lá). Para lançar mercadoria nova ou corrigir o número, é o balanço.
- Código: `src/features/lotes/` (`actions.ts` → `lancarBalanco`, `components/formulario-balanco.tsx`), migration `20261127120000_balanco_de_estoque_dos_lotes.sql`; teste: `node scripts/testar-balanco.mjs`.

### 11.6 Banco de Leads (importação de listas)

- **Onde:** menu **Banco de Leads** → pastas (ex.: "Central da Cerveja") → listas (ex.: "Grupo VIP").
- **Formatos:** CSV (separador `,` `;` tab ou `|`, UTF-8 ou Windows-1252), Excel `.xlsx`/`.xls`/`.ods` (escolha da aba) e TXT (delimitado ou um contato por linha, ex.: `João - +55 11 98765-4321`). Até 20 MB.
- **Como funciona:** o arquivo é lido **no navegador** (`src/features/leads/planilha.ts`), que mostra a prévia, detecta cabeçalho e tipo de cada coluna e sugere as colunas de nome/WhatsApp/e-mail (dá para trocar e renomear colunas). O envio vai em lotes de 1.000 para a função `importar_leads()`; reenviar um lote não duplica nada (linha e WhatsApp são únicos na lista).
- **Dados:** todas as colunas originais ficam em `leads.dados`; `nome`, `whatsapp` (normalizado, só dígitos com DDI) e `email` viram colunas. `vw_leads.ja_cliente` indica quem já está em Clientes (mesmo WhatsApp). Uma pasta só pode ser excluída vazia; excluir uma lista apaga os leads dela.
- **LGPD:** são dados pessoais — acesso só para a equipe (RLS). Antes dos disparos, mantenha a opção de descadastro e use as listas só para a finalidade informada aos contatos.

---

## 12. Identidade visual

| Token | Valor | Uso |
|---|---|---|
| `volt` | `#2BDE94` | Ação principal (uma por tela), destaques |
| `ink` | `#0A0E14` | Texto, sidebar, fundos escuros |
| `papel` | `#F5F6F8` | Fundo das telas |
| `linha` | `#E6E8EC` | Bordas |
| `shopify` / `app` / `vip` / `whatsapp` | `#5B8DEF` / `#8B7CF6` / `#E8B53E` / `#25D366` | Canais |

**Tipografia** (Google Fonts via `next/font`): **Archivo** (títulos e números, largura 108%), **Geist** (interface), **Geist Mono** (dados e rótulos). Utilitários: `tipo-display`, `tipo-h1`, `tipo-h2`, `tipo-h3`, `tipo-numero`, `tipo-dado`, `tipo-rotulo`.

**Regras do Brand Kit aplicadas:** logotipo sempre pelos arquivos de `public/brand` (componente `<Logo>`; nunca redigitado), largura mínima 120 px (abaixo disso, `<Icone>`), texto Ink sobre Volt, sem distorção/sombra no logo.

O gráfico de receita usa uma paleta categórica **validada para daltonismo** (definida em `features/painel/components/grafico-receita.tsx`), com legenda, tooltip e visão em tabela.

---

## 13. Scripts

| Comando | Faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | Tipos (gera os tipos de rota do Next antes) |
| `npm run check` | Lint + tipos |
| `npm run db:test` | Testa migrations, seed, regras de negócio e RLS num Postgres embutido (**sem Docker**) |
| `npm run test:frete` | Testa as regras do frete calculado (peso, endereço, opção mais barata) com respostas reais da loja, sem rede |
| `npm run db:start` / `db:stop` | Supabase local (Docker) |
| `npm run db:reset` | Recria o banco local com migrations + seed |
| `npm run db:link` | Vincula ao projeto remoto |
| `npm run db:push` | Aplica migrations no projeto remoto |
| `npm run db:nova <nome>` | Nova migration |
| `npm run db:types` / `db:types:local` | Regenera `src/types/database.types.ts` |

---

## 14. Segurança e LGPD

- Chave **secreta** do Supabase só no servidor (`src/lib/env.server.ts` + `import 'server-only'`).
- RLS em todas as tabelas; `anon` sem acesso; funções públicas executadas só pelo servidor.
- Link público expõe apenas primeiro nome e endereço mascarado; campo anti-robô no checkout.
- Webhooks assinados (HMAC-SHA256) nas duas direções (Shopify → CRM e CRM → n8n); comparação em tempo constante.
- Cabeçalhos de segurança (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`) e `robots: noindex`.
- **LGPD:** os dados de clientes são usados para entrega e cobrança. Recomenda-se publicar uma política de privacidade e atender pedidos de exclusão (excluir o cliente na ficha — só é possível sem pedidos; para clientes com pedidos, anonimize os dados pessoais).

---

## 15. Solução de problemas

| Sintoma | Causa provável / solução |
|---|---|
| “Variável de ambiente ... não configurada” | Preencha o `.env.local` (local) ou as variáveis na Vercel e faça novo deploy. |
| Login funciona mas cai em “Acesso pendente” | O perfil está inativo — um admin libera em Configurações › Equipe (ou `update perfis set ativo = true where email = '...'` no SQL Editor). |
| Pessoa da equipe não consegue entrar | Um admin clica em **Nova senha** em Configurações › Equipe e repassa a senha temporária. |
| O único administrador esqueceu a senha | No SQL Editor: `update auth.users set encrypted_password = extensions.crypt('Temporaria#2026', extensions.gen_salt('bf')) where email = 'admin@...';` e `update perfis set trocar_senha = true where email = 'admin@...';` — entre com essa senha e crie a nova. |
| Link da pré-venda aponta para `localhost` | Defina `NEXT_PUBLIC_SITE_URL` com o domínio de produção. |
| Pré-venda não aceita pedidos | Status diferente de “Ativa” ou data de encerramento passou. |
| Upload de imagem falha | Migration `permissoes_storage` aplicada? Imagem até 4 MB (PNG/JPG/WEBP/AVIF). |
| Eventos “ignorados” | Não havia webhook ativo para aquele tipo de evento quando ele foi processado — use “Reenviar”. |
| `supabase db push` reclama do histórico | Rode `supabase migration list` para comparar; use `supabase migration repair --status applied <versão>` se aplicou algo manualmente. |

---

## 16. Próximos passos sugeridos

- Envio automático das mensagens pelo **WhatsApp Business API** via n8n (eventos já prontos).
- **PIX com QR Code dinâmico** (Mercado Pago, Asaas, Efí) confirmando pagamento via `PATCH /api/v1/pedidos/{id}`.
- Sincronização de **estoque** com a Shopify.
- Testes automatizados (Vitest + Playwright) no CI.
- Relatórios financeiros (DRE simples: vendas × contas a pagar).

---

<p align="center"><sub>Prometheus CRM v1.0 · Outubro 2026 · uso interno</sub></p>
