-- =============================================================================
-- PROMETHEUS CRM · PROGRAMA DE INFLUENCIADORES
--
-- Cada influenciador divulga um CUPOM (cupom nativo da Shopify). Todo pedido da loja
-- feito com esse cupom vira uma venda do influenciador, com a comissão calculada.
--
--   • influenciadores: cadastro, cupom, % de desconto do cliente, % de comissão, PIX
--     e o login do Portal (auth.users). Influenciador NÃO é da equipe: não tem linha
--     em `perfis`, então o RLS do CRM inteiro continua fechado para ele.
--   • influenciador_vendas: uma linha por pedido da Shopify com cupom de influenciador
--     (chave: shopify_order_id). Quem grava é o servidor (sincronização pela Admin API
--     e webhook), sempre por registrar_venda_influenciador().
--       base      = produtos depois do desconto e das devoluções, SEM frete
--       comissão  = base × percentual do influenciador (congelado na 1ª leitura)
--       status    = pendente (pedido não pago) → aprovada (pago) → paga (repasse feito)
--                   cancelada (pedido cancelado/estornado ou comissão bloqueada pela equipe)
--       liberar_em = data do pedido + carência (dias). Aprovada e passada a carência = disponível.
--   • influenciador_pagamentos: repasses feitos (PIX). Um repasse quita todas as
--     comissões disponíveis do influenciador e aceita um ajuste (+/−) com motivo.
--   • Portal: o influenciador lê SÓ os próprios dados, e só por funções portal_*()
--     (security definer, presas ao auth.uid()). Nenhuma tabela tem política para ele.
-- =============================================================================

create type public.status_influenciador as enum ('ativo', 'pausado', 'encerrado');
create type public.status_comissao as enum ('pendente', 'aprovada', 'paga', 'cancelada');

-- -----------------------------------------------------------------------------
-- Regras do programa (Configurações, linha única)
-- -----------------------------------------------------------------------------

alter table public.configuracoes
  add column influ_comissao_padrao     numeric(5, 2) not null default 10
    constraint configuracoes_influ_comissao_check check (influ_comissao_padrao >= 0 and influ_comissao_padrao <= 100),
  add column influ_desconto_padrao     numeric(5, 2) not null default 10
    constraint configuracoes_influ_desconto_check check (influ_desconto_padrao >= 0 and influ_desconto_padrao <= 100),
  add column influ_carencia_dias       integer not null default 7
    constraint configuracoes_influ_carencia_check check (influ_carencia_dias between 0 and 120),
  add column influ_regras              text
    constraint configuracoes_influ_regras_check check (influ_regras is null or length(influ_regras) <= 4000),
  add column influ_nome_loja           text
    constraint configuracoes_influ_nome_loja_check check (influ_nome_loja is null or length(trim(influ_nome_loja)) between 1 and 80),
  add column influ_loja_url            text
    constraint configuracoes_influ_loja_url_check check (influ_loja_url is null or influ_loja_url ~ '^https://[^\s/]+$'),
  add column influ_sincronizado_ate    timestamptz,
  add column influ_sincronizado_em     timestamptz,
  add column influ_sincronizacao_erro  text;

comment on column public.configuracoes.influ_comissao_padrao is 'Programa de influenciadores: % de comissão sugerida no cadastro.';
comment on column public.configuracoes.influ_desconto_padrao is 'Programa de influenciadores: % de desconto do cupom sugerida no cadastro.';
comment on column public.configuracoes.influ_carencia_dias is 'Dias entre a data do pedido e a comissão ficar disponível para repasse (trocas e devoluções).';
comment on column public.configuracoes.influ_regras is 'Texto "como e quando pagamos", mostrado no Portal do influenciador.';
comment on column public.configuracoes.influ_nome_loja is 'Nome da loja mostrado ao influenciador no Portal (vazio = nome_loja).';
comment on column public.configuracoes.influ_loja_url is 'Endereço público da loja (https://loja.com.br), usado no link de divulgação /discount/CUPOM.';
comment on column public.configuracoes.influ_sincronizado_ate is 'Pedidos da Shopify lidos até esta data de atualização (cursor da sincronização).';

-- -----------------------------------------------------------------------------
-- Influenciadores
-- -----------------------------------------------------------------------------

create table public.influenciadores (
  id                   uuid primary key default gen_random_uuid(),
  nome                 text not null constraint influenciadores_nome_check check (length(trim(nome)) between 1 and 120),
  email                text not null constraint influenciadores_email_check check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  whatsapp             text,
  instagram            text constraint influenciadores_instagram_check check (instagram is null or instagram ~ '^[a-z0-9._]{1,30}$'),
  documento            text constraint influenciadores_documento_check check (documento is null or documento ~ '^([0-9]{11}|[0-9]{14})$'),
  cupom                text not null constraint influenciadores_cupom_check check (cupom ~ '^[A-Z0-9]{3,20}$'),
  desconto_percentual  numeric(5, 2) not null constraint influenciadores_desconto_check check (desconto_percentual >= 0 and desconto_percentual <= 100),
  comissao_percentual  numeric(5, 2) not null constraint influenciadores_comissao_check check (comissao_percentual >= 0 and comissao_percentual <= 100),
  contar_desde         date not null default public.hoje_brasilia(),
  status               public.status_influenciador not null default 'ativo',
  tipo_chave_pix       text constraint influenciadores_tipo_chave_pix_check check (tipo_chave_pix is null or tipo_chave_pix in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  chave_pix            text constraint influenciadores_chave_pix_check check (chave_pix is null or length(chave_pix) between 1 and 140),
  nome_recebedor       text constraint influenciadores_nome_recebedor_check check (nome_recebedor is null or length(nome_recebedor) <= 120),
  observacoes          text constraint influenciadores_observacoes_check check (observacoes is null or length(observacoes) <= 4000),
  -- Login do Portal
  usuario_id           uuid references auth.users (id) on delete set null,
  trocar_senha         boolean not null default false,
  acesso_criado_em     timestamptz,
  ultimo_acesso_em     timestamptz,
  -- Cupom na Shopify
  shopify_desconto_id  text,
  cupom_situacao       text not null default 'pendente'
    constraint influenciadores_cupom_situacao_check check (cupom_situacao in ('pendente', 'ativo', 'inativo', 'erro')),
  cupom_detalhe        text,
  cupom_conferido_em   timestamptz,
  criado_por           uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  constraint influenciadores_cupom_key unique (cupom),
  constraint influenciadores_email_key unique (email),
  constraint influenciadores_usuario_id_key unique (usuario_id)
);

comment on table public.influenciadores is 'Influenciadores do programa de cupons. Cada um tem um cupom da Shopify, uma comissão e (opcional) um login do Portal.';
comment on column public.influenciadores.cupom is 'Código do cupom na Shopify, em maiúsculas (a Shopify não diferencia maiúsculas de minúsculas).';
comment on column public.influenciadores.contar_desde is 'Só pedidos feitos a partir deste dia geram comissão (protege cupons que já existiam antes do cadastro).';
comment on column public.influenciadores.usuario_id is 'Login do Portal (auth.users). Influenciador nunca tem linha em perfis.';
comment on column public.influenciadores.cupom_situacao is 'pendente = ainda não criado/conferido na Shopify · ativo · inativo (pausado na Shopify) · erro (ver cupom_detalhe).';

create index influenciadores_status_idx on public.influenciadores (status, nome);

create trigger influenciadores_atualizado_em
  before update on public.influenciadores
  for each row execute function public.definir_atualizado_em();

-- -----------------------------------------------------------------------------
-- Repasses (pagamentos de comissão)
-- -----------------------------------------------------------------------------

create table public.influenciador_pagamentos (
  id                uuid primary key default gen_random_uuid(),
  influenciador_id  uuid not null references public.influenciadores (id) on delete restrict,
  comissoes         numeric(12, 2) not null default 0 constraint influenciador_pagamentos_comissoes_check check (comissoes >= 0),
  ajuste            numeric(12, 2) not null default 0,
  ajuste_motivo     text,
  total             numeric(12, 2) not null generated always as (comissoes + ajuste) stored,
  vendas            integer not null default 0,
  pago_em           date not null default public.hoje_brasilia(),
  chave_pix         text,
  observacoes       text constraint influenciador_pagamentos_observacoes_check check (observacoes is null or length(observacoes) <= 2000),
  criado_por        uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em         timestamptz not null default now(),
  constraint influenciador_pagamentos_total_check check (comissoes + ajuste >= 0),
  constraint influenciador_pagamentos_ajuste_motivo_check check (ajuste = 0 or nullif(trim(ajuste_motivo), '') is not null)
);

comment on table public.influenciador_pagamentos is 'Repasses de comissão feitos aos influenciadores. total = comissões quitadas + ajuste.';
comment on column public.influenciador_pagamentos.chave_pix is 'Cópia da chave PIX usada no repasse.';

create index influenciador_pagamentos_influenciador_idx on public.influenciador_pagamentos (influenciador_id, pago_em desc);

-- -----------------------------------------------------------------------------
-- Vendas com cupom (uma por pedido da Shopify)
-- -----------------------------------------------------------------------------

create table public.influenciador_vendas (
  id                 uuid primary key default gen_random_uuid(),
  influenciador_id   uuid not null references public.influenciadores (id) on delete restrict,
  shopify_order_id   text not null,
  pedido_numero      text,
  pedido_id          uuid references public.pedidos (id) on delete set null,
  cupom              text not null,
  pedido_em          timestamptz not null,
  dia                date not null generated always as ((pedido_em at time zone 'America/Sao_Paulo')::date) stored,
  status_financeiro  text,
  pedido_cancelado   boolean not null default false,
  valor_pedido       numeric(12, 2) not null default 0,
  desconto           numeric(12, 2) not null default 0,
  frete              numeric(12, 2) not null default 0,
  base               numeric(12, 2) not null default 0 constraint influenciador_vendas_base_check check (base >= 0),
  percentual         numeric(5, 2) not null,
  comissao           numeric(12, 2) not null default 0 constraint influenciador_vendas_comissao_check check (comissao >= 0),
  status             public.status_comissao not null default 'pendente',
  liberar_em         timestamptz not null,
  pagamento_id       uuid references public.influenciador_pagamentos (id) on delete set null,
  bloqueada          boolean not null default false,
  alerta             text,
  origem             text not null default 'sincronizacao'
    constraint influenciador_vendas_origem_check check (origem in ('sincronizacao', 'webhook')),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint influenciador_vendas_shopify_order_id_key unique (shopify_order_id)
);

comment on table public.influenciador_vendas is 'Pedidos da Shopify feitos com cupom de influenciador, com a comissão. Gravado só pelo servidor (registrar_venda_influenciador).';
comment on column public.influenciador_vendas.base is 'Base da comissão: produtos depois do desconto e das devoluções, sem frete.';
comment on column public.influenciador_vendas.percentual is '% de comissão do influenciador no momento da 1ª leitura do pedido (não muda depois).';
comment on column public.influenciador_vendas.liberar_em is 'Data do pedido + carência. Comissão aprovada e passada esta data = disponível para repasse.';
comment on column public.influenciador_vendas.bloqueada is 'A equipe cancelou esta comissão à mão (ex.: compra do próprio influenciador). A sincronização não reativa.';
comment on column public.influenciador_vendas.alerta is 'Aviso para a equipe (ex.: pedido estornado depois de a comissão ser paga) ou motivo do bloqueio.';

create index influenciador_vendas_influenciador_idx on public.influenciador_vendas (influenciador_id, pedido_em desc);
create index influenciador_vendas_dia_idx on public.influenciador_vendas (dia desc);
create index influenciador_vendas_a_pagar_idx on public.influenciador_vendas (influenciador_id, liberar_em) where status = 'aprovada';
create index influenciador_vendas_pagamento_idx on public.influenciador_vendas (pagamento_id) where pagamento_id is not null;

create trigger influenciador_vendas_atualizado_em
  before update on public.influenciador_vendas
  for each row execute function public.definir_atualizado_em();

-- Pedido da Shopify que entra no CRM depois da venda: liga os dois.
create or replace function public.ligar_pedido_a_venda_influenciador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.influenciador_vendas
  set pedido_id = new.id
  where shopify_order_id = new.shopify_order_id and pedido_id is null;
  return null;
end;
$$;

create trigger pedidos_ligar_venda_influenciador
  after insert on public.pedidos
  for each row when (new.shopify_order_id is not null)
  execute function public.ligar_pedido_a_venda_influenciador();

-- -----------------------------------------------------------------------------
-- Regras da comissão
-- -----------------------------------------------------------------------------

-- Situação do pagamento na Shopify → status da comissão.
create or replace function public.status_da_comissao(p_status_financeiro text, p_cancelado boolean)
returns public.status_comissao
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_cancelado, false) or lower(coalesce(p_status_financeiro, '')) in ('refunded', 'voided', 'expired')
      then 'cancelada'::public.status_comissao
    when lower(coalesce(p_status_financeiro, '')) in ('paid', 'partially_refunded')
      then 'aprovada'::public.status_comissao
    else 'pendente'::public.status_comissao
  end;
$$;

-- Registra (ou atualiza) a venda de um pedido da Shopify. EXCLUSIVA do servidor.
--   p_venda: { shopify_order_id, pedido_numero, pedido_em, cupons: ["CODIGO", ...],
--              status_financeiro, cancelado, teste, base, desconto, frete, valor_pedido, origem }
--   Devolve { registrada, motivo? | id, nova, influenciador_id, status }.
create or replace function public.registrar_venda_influenciador(p_venda jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_order_id    text := nullif(trim(p_venda ->> 'shopify_order_id'), '');
  v_existente   public.influenciador_vendas;
  v_influ       public.influenciadores;
  v_pedido_em   timestamptz := coalesce((p_venda ->> 'pedido_em')::timestamptz, now());
  v_fin         text := nullif(lower(trim(p_venda ->> 'status_financeiro')), '');
  v_cancelado   boolean := coalesce((p_venda ->> 'cancelado')::boolean, false);
  v_base        numeric(12, 2) := greatest(coalesce((p_venda ->> 'base')::numeric, 0), 0);
  v_status      public.status_comissao;
  v_carencia    integer;
  v_id          uuid;
begin
  if v_order_id is null then
    raise exception 'shopify_order_id é obrigatório.' using errcode = 'P0001';
  end if;

  -- Webhook e sincronização podem chegar juntos para o mesmo pedido.
  perform pg_advisory_xact_lock(hashtext('influenciador_venda:' || v_order_id));

  select * into v_existente from public.influenciador_vendas where shopify_order_id = v_order_id;
  v_status := public.status_da_comissao(v_fin, v_cancelado);

  if v_existente.id is null then
    if coalesce((p_venda ->> 'teste')::boolean, false) then
      return jsonb_build_object('registrada', false, 'motivo', 'pedido_de_teste');
    end if;

    -- O primeiro cupom do pedido que é de um influenciador.
    select i.* into v_influ
    from jsonb_array_elements_text(coalesce(p_venda -> 'cupons', '[]'::jsonb)) with ordinality as c (codigo, ordem)
    join public.influenciadores i on i.cupom = upper(trim(c.codigo))
    order by c.ordem
    limit 1;

    if v_influ.id is null then
      return jsonb_build_object('registrada', false, 'motivo', 'sem_cupom_de_influenciador');
    end if;
    if (v_pedido_em at time zone 'America/Sao_Paulo')::date < v_influ.contar_desde then
      return jsonb_build_object('registrada', false, 'motivo', 'antes_do_inicio');
    end if;

    select influ_carencia_dias into v_carencia from public.configuracoes where id = 1;

    insert into public.influenciador_vendas (
      influenciador_id, shopify_order_id, pedido_numero, pedido_id, cupom, pedido_em,
      status_financeiro, pedido_cancelado, valor_pedido, desconto, frete,
      base, percentual, comissao, status, liberar_em, origem
    )
    values (
      v_influ.id, v_order_id, nullif(trim(p_venda ->> 'pedido_numero'), ''),
      (select p.id from public.pedidos p where p.shopify_order_id = v_order_id),
      v_influ.cupom, v_pedido_em,
      v_fin, v_cancelado,
      greatest(coalesce((p_venda ->> 'valor_pedido')::numeric, 0), 0),
      greatest(coalesce((p_venda ->> 'desconto')::numeric, 0), 0),
      greatest(coalesce((p_venda ->> 'frete')::numeric, 0), 0),
      v_base, v_influ.comissao_percentual, round(v_base * v_influ.comissao_percentual / 100, 2),
      v_status, v_pedido_em + make_interval(days => coalesce(v_carencia, 7)),
      case when p_venda ->> 'origem' = 'webhook' then 'webhook' else 'sincronizacao' end
    )
    returning id into v_id;

    return jsonb_build_object('registrada', true, 'id', v_id, 'nova', true, 'influenciador_id', v_influ.id, 'status', v_status);
  end if;

  if v_existente.status = 'paga' then
    -- Comissão já repassada: os valores não mudam; a equipe é avisada para ajustar no próximo repasse.
    update public.influenciador_vendas
    set status_financeiro = v_fin,
        pedido_cancelado = v_cancelado,
        alerta = case
          when v_status = 'cancelada' then 'O pedido foi cancelado ou estornado depois de a comissão ser paga.'
          when v_base < base then 'O pedido teve devolução parcial depois de a comissão ser paga.'
          else alerta
        end
    where id = v_existente.id
      and (status_financeiro is distinct from v_fin or pedido_cancelado is distinct from v_cancelado
           or (v_status = 'cancelada' and alerta is null) or (v_base < base and alerta is null));
  else
    update public.influenciador_vendas
    set status_financeiro = v_fin,
        pedido_cancelado = v_cancelado,
        pedido_numero = coalesce(nullif(trim(p_venda ->> 'pedido_numero'), ''), pedido_numero),
        valor_pedido = greatest(coalesce((p_venda ->> 'valor_pedido')::numeric, valor_pedido), 0),
        desconto = greatest(coalesce((p_venda ->> 'desconto')::numeric, desconto), 0),
        frete = greatest(coalesce((p_venda ->> 'frete')::numeric, frete), 0),
        base = v_base,
        comissao = round(v_base * percentual / 100, 2),
        status = case when bloqueada then 'cancelada'::public.status_comissao else v_status end,
        pedido_id = coalesce(pedido_id, (select p.id from public.pedidos p where p.shopify_order_id = v_order_id))
    where id = v_existente.id
      and (status_financeiro is distinct from v_fin or pedido_cancelado is distinct from v_cancelado
           or base is distinct from v_base
           or status is distinct from (case when bloqueada then 'cancelada'::public.status_comissao else v_status end)
           or pedido_id is null);
  end if;

  return jsonb_build_object(
    'registrada', true, 'id', v_existente.id, 'nova', false,
    'influenciador_id', v_existente.influenciador_id, 'status', v_status
  );
end;
$$;

-- A equipe cancela (ou devolve) a comissão de uma venda. Comissão já paga não muda.
create or replace function public.bloquear_comissao_influenciador(p_venda_id uuid, p_bloquear boolean, p_motivo text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_venda public.influenciador_vendas;
begin
  if not public.eh_membro_equipe() then
    raise exception 'Apenas a equipe altera comissões.' using errcode = '42501';
  end if;

  select * into v_venda from public.influenciador_vendas where id = p_venda_id for update;
  if v_venda.id is null then
    raise exception 'Venda não encontrada.' using errcode = 'P0001';
  end if;
  if v_venda.status = 'paga' then
    raise exception 'Esta comissão já foi paga. Use um ajuste no próximo repasse.' using errcode = 'P0001';
  end if;

  if p_bloquear then
    if nullif(trim(p_motivo), '') is null then
      raise exception 'Informe o motivo do cancelamento da comissão.' using errcode = 'P0001';
    end if;
    update public.influenciador_vendas
    set bloqueada = true, status = 'cancelada', alerta = left(trim(p_motivo), 300)
    where id = p_venda_id;
  else
    update public.influenciador_vendas
    set bloqueada = false, alerta = null,
        status = public.status_da_comissao(status_financeiro, pedido_cancelado)
    where id = p_venda_id;
  end if;
end;
$$;

-- Registra um repasse: quita TODAS as comissões disponíveis do influenciador e soma o ajuste.
create or replace function public.registrar_pagamento_influenciador(
  p_influenciador_id  uuid,
  p_pago_em           date default null,
  p_ajuste            numeric default 0,
  p_ajuste_motivo     text default null,
  p_observacoes       text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_influ      public.influenciadores;
  v_id         uuid;
  v_comissoes  numeric(12, 2);
  v_vendas     integer;
  v_ajuste     numeric(12, 2) := round(coalesce(p_ajuste, 0), 2);
begin
  if not public.eh_membro_equipe() then
    raise exception 'Apenas a equipe registra repasses.' using errcode = '42501';
  end if;

  -- Trava o influenciador: dois repasses ao mesmo tempo não pagam a mesma comissão.
  select * into v_influ from public.influenciadores where id = p_influenciador_id for update;
  if v_influ.id is null then
    raise exception 'Influenciador não encontrado.' using errcode = 'P0001';
  end if;
  if v_ajuste <> 0 and nullif(trim(p_ajuste_motivo), '') is null then
    raise exception 'Informe o motivo do ajuste.' using errcode = 'P0001';
  end if;
  if coalesce(p_pago_em, public.hoje_brasilia()) > public.hoje_brasilia() then
    raise exception 'A data do repasse não pode ser no futuro.' using errcode = 'P0001';
  end if;

  insert into public.influenciador_pagamentos (influenciador_id, pago_em, chave_pix, observacoes)
  values (v_influ.id, coalesce(p_pago_em, public.hoje_brasilia()), v_influ.chave_pix, nullif(trim(p_observacoes), ''))
  returning id into v_id;

  with quitadas as (
    update public.influenciador_vendas
    set status = 'paga', pagamento_id = v_id
    where influenciador_id = v_influ.id and status = 'aprovada' and liberar_em <= now()
    returning comissao
  )
  select coalesce(sum(comissao), 0), count(*) into v_comissoes, v_vendas from quitadas;

  if v_vendas = 0 and v_ajuste = 0 then
    raise exception 'Este influenciador não tem comissão disponível para repasse.' using errcode = 'P0001';
  end if;
  if v_comissoes + v_ajuste < 0 then
    raise exception 'O ajuste não pode ser maior que as comissões do repasse.' using errcode = 'P0001';
  end if;

  update public.influenciador_pagamentos
  set comissoes = v_comissoes, vendas = v_vendas, ajuste = v_ajuste,
      ajuste_motivo = case when v_ajuste <> 0 then left(trim(p_ajuste_motivo), 300) end
  where id = v_id;

  return v_id;
end;
$$;

-- Desfaz um repasse lançado errado (só administradores): as comissões voltam a ficar disponíveis.
create or replace function public.desfazer_pagamento_influenciador(p_pagamento_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores desfazem repasses.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.influenciador_pagamentos where id = p_pagamento_id) then
    raise exception 'Repasse não encontrado.' using errcode = 'P0001';
  end if;

  update public.influenciador_vendas
  set status = case when bloqueada then 'cancelada'::public.status_comissao
                    else public.status_da_comissao(status_financeiro, pedido_cancelado) end,
      pagamento_id = null
  where pagamento_id = p_pagamento_id;

  delete from public.influenciador_pagamentos where id = p_pagamento_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Visões da equipe
-- -----------------------------------------------------------------------------

-- Venda + influenciador + situação que a tela mostra.
create view public.vw_influenciador_vendas
with (security_invoker = true) as
select
  v.*,
  i.nome as influenciador_nome,
  case
    when v.status = 'cancelada' then 'cancelada'
    when v.status = 'paga' then 'paga'
    when v.status = 'pendente' then 'aguardando_pagamento'
    when v.liberar_em > now() then 'a_liberar'
    else 'disponivel'
  end as situacao
from public.influenciador_vendas v
join public.influenciadores i on i.id = v.influenciador_id;

-- Influenciador + totais de sempre (vendas válidas, saldos e repasses).
create view public.vw_influenciadores
with (security_invoker = true) as
select
  i.*,
  coalesce(v.pedidos, 0)::integer             as pedidos,
  coalesce(v.vendido, 0)::numeric(14, 2)      as vendido,
  coalesce(v.comissao_total, 0)::numeric(14, 2) as comissao_total,
  coalesce(v.aguardando, 0)::numeric(14, 2)   as saldo_aguardando,
  coalesce(v.a_liberar, 0)::numeric(14, 2)    as saldo_a_liberar,
  coalesce(v.disponivel, 0)::numeric(14, 2)   as saldo_disponivel,
  coalesce(v.vendas_disponiveis, 0)::integer  as vendas_disponiveis,
  coalesce(v.alertas, 0)::integer             as alertas,
  coalesce(p.recebido, 0)::numeric(14, 2)     as recebido,
  v.ultima_venda_em,
  p.ultimo_pagamento_em
from public.influenciadores i
left join lateral (
  select
    count(*) filter (where s.status <> 'cancelada') as pedidos,
    sum(s.base) filter (where s.status <> 'cancelada') as vendido,
    sum(s.comissao) filter (where s.status <> 'cancelada') as comissao_total,
    sum(s.comissao) filter (where s.status = 'pendente') as aguardando,
    sum(s.comissao) filter (where s.status = 'aprovada' and s.liberar_em > now()) as a_liberar,
    sum(s.comissao) filter (where s.status = 'aprovada' and s.liberar_em <= now()) as disponivel,
    count(*) filter (where s.status = 'aprovada' and s.liberar_em <= now()) as vendas_disponiveis,
    count(*) filter (where s.status = 'paga' and s.alerta is not null) as alertas,
    max(s.pedido_em) filter (where s.status <> 'cancelada') as ultima_venda_em
  from public.influenciador_vendas s
  where s.influenciador_id = i.id
) v on true
left join lateral (
  select sum(g.total) as recebido, max(g.pago_em) as ultimo_pagamento_em
  from public.influenciador_pagamentos g
  where g.influenciador_id = i.id
) p on true;

-- Resumo do programa (ou de um influenciador) num período: totais, saldos e a série por dia.
-- Roda com o RLS de quem chama (equipe). O Portal usa portal_resumo(), que passa o próprio id.
create or replace function public.resumo_influenciadores(p_inicio date, p_fim date, p_influenciador_id uuid default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with limites as (
    select p_inicio as inicio, least(p_fim, p_inicio + 400) as fim
  ),
  vendas as (
    select v.* from public.influenciador_vendas v
    where p_influenciador_id is null or v.influenciador_id = p_influenciador_id
  ),
  no_periodo as (
    select v.* from vendas v, limites l where v.dia between l.inicio and l.fim
  ),
  dias as (
    select d::date as dia from limites l, generate_series(l.inicio::timestamp, l.fim::timestamp, interval '1 day') d
  )
  select jsonb_build_object(
    'periodo', (
      select jsonb_build_object(
        'pedidos', count(*) filter (where status <> 'cancelada'),
        'vendido', coalesce(sum(base) filter (where status <> 'cancelada'), 0),
        'comissao', coalesce(sum(comissao) filter (where status <> 'cancelada'), 0),
        'desconto', coalesce(sum(desconto) filter (where status <> 'cancelada'), 0),
        'cancelados', count(*) filter (where status = 'cancelada'),
        'influenciadores', count(distinct influenciador_id) filter (where status <> 'cancelada')
      ) from no_periodo
    ),
    'saldos', (
      select jsonb_build_object(
        'aguardando', coalesce(sum(comissao) filter (where status = 'pendente'), 0),
        'a_liberar', coalesce(sum(comissao) filter (where status = 'aprovada' and liberar_em > now()), 0),
        'disponivel', coalesce(sum(comissao) filter (where status = 'aprovada' and liberar_em <= now()), 0),
        'vendas_disponiveis', count(*) filter (where status = 'aprovada' and liberar_em <= now()),
        'proxima_liberacao', min(liberar_em) filter (where status = 'aprovada' and liberar_em > now()),
        'recebido', coalesce((
          select sum(g.total) from public.influenciador_pagamentos g
          where p_influenciador_id is null or g.influenciador_id = p_influenciador_id
        ), 0)
      ) from vendas
    ),
    'total', (
      select jsonb_build_object(
        'pedidos', count(*) filter (where status <> 'cancelada'),
        'vendido', coalesce(sum(base) filter (where status <> 'cancelada'), 0),
        'comissao', coalesce(sum(comissao) filter (where status <> 'cancelada'), 0)
      ) from vendas
    ),
    'serie', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dia', d.dia,
        'pedidos', coalesce(s.pedidos, 0),
        'vendido', coalesce(s.vendido, 0),
        'comissao', coalesce(s.comissao, 0)
      ) order by d.dia)
      from dias d
      left join (
        select dia, count(*) as pedidos, sum(base) as vendido, sum(comissao) as comissao
        from no_periodo where status <> 'cancelada' group by dia
      ) s on s.dia = d.dia
    ), '[]'::jsonb)
  );
$$;

-- Ranking do período (equipe).
create or replace function public.ranking_influenciadores(p_inicio date, p_fim date, p_limite integer default 10)
returns table (influenciador_id uuid, nome text, cupom text, instagram text, pedidos bigint, vendido numeric, comissao numeric)
language sql
stable
set search_path = ''
as $$
  select i.id, i.nome, i.cupom, i.instagram, count(*), sum(v.base), sum(v.comissao)
  from public.influenciador_vendas v
  join public.influenciadores i on i.id = v.influenciador_id
  where v.status <> 'cancelada' and v.dia between p_inicio and p_fim
  group by i.id
  order by sum(v.base) desc, count(*) desc, i.nome
  limit greatest(1, least(coalesce(p_limite, 10), 100));
$$;

-- -----------------------------------------------------------------------------
-- Login do Portal
-- -----------------------------------------------------------------------------

-- Influenciadores entram pelo Portal e NÃO são da equipe: não ganham perfil.
create or replace function public.criar_perfil_para_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primeiro boolean := not exists (select 1 from public.perfis);
begin
  if coalesce(new.raw_user_meta_data ->> 'tipo', '') = 'influenciador' then
    return new;
  end if;

  insert into public.perfis (id, nome, email, papel, ativo)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)),
    new.email,
    case when v_primeiro then 'admin'::public.papel_usuario else 'equipe'::public.papel_usuario end,
    v_primeiro
  );
  return new;
end;
$$;

-- Liga o login recém-criado ao influenciador. EXCLUSIVA do servidor.
-- Se o usuário for da equipe (perfil ativo), recusa: uma conta não pode ser as duas coisas.
create or replace function public.vincular_acesso_influenciador(p_influenciador_id uuid, p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.perfis where id = p_usuario_id and ativo) then
    raise exception 'Este e-mail já é de um membro da equipe. Use outro e-mail para o influenciador.' using errcode = 'P0001';
  end if;
  -- Perfil inativo criado pelo gatilho (se houver): influenciador não aparece na Equipe.
  delete from public.perfis where id = p_usuario_id;

  update public.influenciadores
  set usuario_id = p_usuario_id, trocar_senha = true, acesso_criado_em = now()
  where id = p_influenciador_id;
  if not found then
    raise exception 'Influenciador não encontrado.' using errcode = 'P0001';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Portal do influenciador: tudo preso ao auth.uid() de quem chama
-- -----------------------------------------------------------------------------

create or replace function public.meu_influenciador_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.influenciadores where usuario_id = (select auth.uid());
$$;

-- Cadastro do influenciador logado + regras do programa (nunca devolve observações internas).
create or replace function public.portal_influenciador()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id,
    'nome', i.nome,
    'email', i.email,
    'whatsapp', i.whatsapp,
    'instagram', i.instagram,
    'documento', i.documento,
    'cupom', i.cupom,
    'cupom_ativo', i.status = 'ativo' and i.cupom_situacao in ('ativo', 'pendente'),
    'desconto_percentual', i.desconto_percentual,
    'comissao_percentual', i.comissao_percentual,
    'status', i.status,
    'trocar_senha', i.trocar_senha,
    'tipo_chave_pix', i.tipo_chave_pix,
    'chave_pix', i.chave_pix,
    'nome_recebedor', i.nome_recebedor,
    'criado_em', i.criado_em,
    'loja_nome', coalesce(nullif(trim(c.influ_nome_loja), ''), c.nome_loja),
    'loja_url', c.influ_loja_url,
    'carencia_dias', c.influ_carencia_dias,
    'regras', c.influ_regras
  )
  from public.influenciadores i
  cross join public.configuracoes c
  where i.usuario_id = (select auth.uid()) and c.id = 1;
$$;

create or replace function public.portal_resumo(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.meu_influenciador_id();
begin
  if v_id is null then
    return null;
  end if;
  return public.resumo_influenciadores(p_inicio, p_fim, v_id);
end;
$$;

-- Vendas do influenciador logado (sem nenhum dado do cliente).
create or replace function public.portal_vendas(
  p_inicio      date default null,
  p_fim         date default null,
  p_situacao    text default null,
  p_pagina      integer default 1,
  p_por_pagina  integer default 30
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with minhas as (
    select
      v.id, v.pedido_numero, v.pedido_em, v.dia, v.cupom, v.base, v.percentual, v.comissao, v.liberar_em,
      case
        when v.status = 'cancelada' then 'cancelada'
        when v.status = 'paga' then 'paga'
        when v.status = 'pendente' then 'aguardando_pagamento'
        when v.liberar_em > now() then 'a_liberar'
        else 'disponivel'
      end as situacao
    from public.influenciador_vendas v
    where v.influenciador_id = public.meu_influenciador_id()
      and (p_inicio is null or v.dia >= p_inicio)
      and (p_fim is null or v.dia <= p_fim)
  ),
  filtradas as (
    select * from minhas where nullif(trim(p_situacao), '') is null or situacao = trim(p_situacao)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtradas),
    'soma_base', (select coalesce(sum(base), 0) from filtradas where situacao <> 'cancelada'),
    'soma_comissao', (select coalesce(sum(comissao), 0) from filtradas where situacao <> 'cancelada'),
    'vendas', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.pedido_em desc)
      from (
        select * from filtradas
        order by pedido_em desc
        limit greatest(1, least(coalesce(p_por_pagina, 30), 100))
        offset (greatest(coalesce(p_pagina, 1), 1) - 1) * greatest(1, least(coalesce(p_por_pagina, 30), 100))
      ) f
    ), '[]'::jsonb)
  );
$$;

create or replace function public.portal_pagamentos()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id,
    'pago_em', g.pago_em,
    'total', g.total,
    'comissoes', g.comissoes,
    'ajuste', g.ajuste,
    'ajuste_motivo', g.ajuste_motivo,
    'vendas', g.vendas,
    'chave_pix', g.chave_pix,
    'observacoes', g.observacoes
  ) order by g.pago_em desc, g.criado_em desc), '[]'::jsonb)
  from public.influenciador_pagamentos g
  where g.influenciador_id = public.meu_influenciador_id();
$$;

-- O influenciador atualiza contato e PIX (nunca cupom, comissão ou status).
create or replace function public.portal_atualizar_dados(p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id         uuid := public.meu_influenciador_id();
  v_instagram  text := nullif(lower(regexp_replace(trim(coalesce(p_dados ->> 'instagram', '')), '^@+', '')), '');
  v_documento  text := public.somente_digitos(p_dados ->> 'documento');
  v_tipo       text := nullif(trim(p_dados ->> 'tipo_chave_pix'), '');
  v_chave      text := nullif(trim(p_dados ->> 'chave_pix'), '');
begin
  if v_id is null then
    raise exception 'Acesso não encontrado.' using errcode = '42501';
  end if;
  if (v_tipo is null) <> (v_chave is null) then
    raise exception 'Informe o tipo e a chave PIX.' using errcode = 'P0001';
  end if;

  update public.influenciadores
  set whatsapp = public.normalizar_whatsapp(p_dados ->> 'whatsapp'),
      instagram = v_instagram,
      documento = v_documento,
      tipo_chave_pix = v_tipo,
      chave_pix = v_chave,
      nome_recebedor = nullif(trim(p_dados ->> 'nome_recebedor'), '')
  where id = v_id;
end;
$$;

-- Senha pessoal criada (primeiro acesso).
create or replace function public.portal_senha_definida()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.influenciadores set trocar_senha = false
  where usuario_id = (select auth.uid()) and trocar_senha;
$$;

create or replace function public.portal_registrar_acesso()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.influenciadores set ultimo_acesso_em = now()
  where usuario_id = (select auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Segurança
-- -----------------------------------------------------------------------------

alter table public.influenciadores enable row level security;
alter table public.influenciador_vendas enable row level security;
alter table public.influenciador_pagamentos enable row level security;

create policy "Equipe vê os influenciadores"
  on public.influenciadores for select to authenticated
  using ((select public.eh_membro_equipe()));

create policy "Equipe cadastra influenciadores"
  on public.influenciadores for insert to authenticated
  with check ((select public.eh_membro_equipe()));

create policy "Equipe edita influenciadores"
  on public.influenciadores for update to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Administradores excluem influenciadores"
  on public.influenciadores for delete to authenticated
  using ((select public.eh_admin()));

create policy "Equipe vê as vendas dos influenciadores"
  on public.influenciador_vendas for select to authenticated
  using ((select public.eh_membro_equipe()));

-- A equipe só muda o status (bloqueio e repasse), pelas funções acima; inserir é do servidor.
create policy "Equipe atualiza comissões"
  on public.influenciador_vendas for update to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe vê os repasses"
  on public.influenciador_pagamentos for select to authenticated
  using ((select public.eh_membro_equipe()));

create policy "Equipe registra repasses"
  on public.influenciador_pagamentos for insert to authenticated
  with check ((select public.eh_membro_equipe()));

create policy "Equipe ajusta o repasse recém-criado"
  on public.influenciador_pagamentos for update to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Administradores desfazem repasses"
  on public.influenciador_pagamentos for delete to authenticated
  using ((select public.eh_admin()));

revoke all on public.influenciadores, public.influenciador_vendas, public.influenciador_pagamentos from anon;
grant select, insert, update, delete on public.influenciadores, public.influenciador_pagamentos to authenticated, service_role;
grant select, update on public.influenciador_vendas to authenticated;
grant select, insert, update, delete on public.influenciador_vendas to service_role;
revoke insert, delete on public.influenciador_vendas from authenticated;
grant select on public.vw_influenciadores, public.vw_influenciador_vendas to authenticated, service_role;
revoke all on public.vw_influenciadores, public.vw_influenciador_vendas from anon;

revoke execute on function
  public.ligar_pedido_a_venda_influenciador(),
  public.status_da_comissao(text, boolean),
  public.registrar_venda_influenciador(jsonb),
  public.bloquear_comissao_influenciador(uuid, boolean, text),
  public.registrar_pagamento_influenciador(uuid, date, numeric, text, text),
  public.desfazer_pagamento_influenciador(uuid),
  public.resumo_influenciadores(date, date, uuid),
  public.ranking_influenciadores(date, date, integer),
  public.vincular_acesso_influenciador(uuid, uuid),
  public.meu_influenciador_id(),
  public.portal_influenciador(),
  public.portal_resumo(date, date),
  public.portal_vendas(date, date, text, integer, integer),
  public.portal_pagamentos(),
  public.portal_atualizar_dados(jsonb),
  public.portal_senha_definida(),
  public.portal_registrar_acesso()
from public, anon, authenticated;

-- Equipe (o RLS e as checagens das funções decidem) e Portal (preso ao auth.uid()).
grant execute on function
  public.status_da_comissao(text, boolean),
  public.bloquear_comissao_influenciador(uuid, boolean, text),
  public.registrar_pagamento_influenciador(uuid, date, numeric, text, text),
  public.desfazer_pagamento_influenciador(uuid),
  public.resumo_influenciadores(date, date, uuid),
  public.ranking_influenciadores(date, date, integer),
  public.meu_influenciador_id(),
  public.portal_influenciador(),
  public.portal_resumo(date, date),
  public.portal_vendas(date, date, text, integer, integer),
  public.portal_pagamentos(),
  public.portal_atualizar_dados(jsonb),
  public.portal_senha_definida(),
  public.portal_registrar_acesso()
to authenticated;

grant execute on function
  public.status_da_comissao(text, boolean),
  public.registrar_venda_influenciador(jsonb),
  public.resumo_influenciadores(date, date, uuid),
  public.ranking_influenciadores(date, date, integer),
  public.vincular_acesso_influenciador(uuid, uuid)
to service_role;

-- -----------------------------------------------------------------------------
-- Funções do estoque da Olist: exclusivas do servidor (de verdade)
--
-- Com o Portal passa a existir login de gente de fora da equipe. Estas seis funções
-- foram criadas para o servidor (chave secreta) e para gatilhos, mas a migration
-- 20261113180000 só tirou a permissão de `public` e `anon`: qualquer login conseguia
-- chamá-las pela API. O CRM só as usa com a chave secreta e por funções que rodam
-- como dono (security definer), então nada muda para a equipe.
-- -----------------------------------------------------------------------------

revoke execute on function
  public.ajustar_estoque_olist_item(uuid, uuid, integer, uuid, text),
  public.reservar_movimentos_olist(integer),
  public.reservar_leitura_estoque_olist(bigint[], integer),
  public.produtos_olist_em_uso(),
  public.avisar_estoque_olist(text, text),
  public.vencer_caixas_vip()
from public, anon, authenticated;
