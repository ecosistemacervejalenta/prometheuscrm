-- =============================================================================
-- PROMETHEUS CRM · 03 · CONTAS A PAGAR
-- Contas fixas (modelos recorrentes) geram uma conta a pagar por mês.
-- Contas variáveis são lançadas avulsas, mês a mês.
-- =============================================================================

create type public.tipo_conta as enum ('fixa', 'variavel');
create type public.status_conta as enum ('pendente', 'paga', 'cancelada');

-- Modelos de contas fixas (aluguel, internet, contador...) -----------------------

create table public.contas_fixas (
  id              uuid primary key default gen_random_uuid(),
  descricao       text not null check (length(trim(descricao)) > 0),
  categoria       text not null default 'Outros',
  fornecedor_id   uuid references public.fornecedores (id) on delete set null,
  valor           numeric(12, 2) not null check (valor >= 0),
  dia_vencimento  smallint not null check (dia_vencimento between 1 and 31),
  inicio_em       date not null default (date_trunc('month', current_date))::date,
  fim_em          date,
  ativa           boolean not null default true,
  observacoes     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint contas_fixas_periodo_valido check (fim_em is null or fim_em >= inicio_em)
);

comment on table public.contas_fixas is 'Modelos de contas recorrentes. Cada mês gera uma linha em contas_pagar via gerar_contas_fixas().';
comment on column public.contas_fixas.inicio_em is 'Primeiro mês (competência) em que a conta é gerada.';
comment on column public.contas_fixas.fim_em is 'Último mês em que a conta é gerada (opcional).';

create trigger contas_fixas_atualizado_em
  before update on public.contas_fixas
  for each row execute function public.definir_atualizado_em();

-- Contas a pagar (fixas geradas + variáveis) -------------------------------------

create table public.contas_pagar (
  id               uuid primary key default gen_random_uuid(),
  descricao        text not null check (length(trim(descricao)) > 0),
  categoria        text not null default 'Outros',
  tipo             public.tipo_conta not null default 'variavel',
  fornecedor_id    uuid references public.fornecedores (id) on delete set null,
  conta_fixa_id    uuid references public.contas_fixas (id) on delete set null,
  competencia      date not null,
  vencimento       date not null,
  valor            numeric(12, 2) not null check (valor >= 0),
  status           public.status_conta not null default 'pendente',
  pago_em          date,
  valor_pago       numeric(12, 2) check (valor_pago is null or valor_pago >= 0),
  forma_pagamento  text,
  observacoes      text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint contas_pagar_competencia_primeiro_dia check (extract(day from competencia) = 1),
  constraint contas_pagar_fixa_por_mes unique (conta_fixa_id, competencia)
);

comment on table public.contas_pagar is 'Contas a pagar do mês (competência). Fixas são geradas a partir de contas_fixas.';
comment on column public.contas_pagar.competencia is 'Mês de referência (sempre dia 1).';

create index contas_pagar_competencia_idx on public.contas_pagar (competencia, vencimento);
create index contas_pagar_status_idx on public.contas_pagar (status, vencimento);
create index contas_pagar_fornecedor_idx on public.contas_pagar (fornecedor_id);

create or replace function public.normalizar_conta_pagar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.competencia := (date_trunc('month', coalesce(new.competencia, new.vencimento)))::date;

  if new.status = 'paga' then
    new.pago_em    := coalesce(new.pago_em, current_date);
    new.valor_pago := coalesce(new.valor_pago, new.valor);
  else
    new.pago_em    := null;
    new.valor_pago := null;
  end if;

  return new;
end;
$$;

create trigger contas_pagar_normalizar
  before insert or update on public.contas_pagar
  for each row execute function public.normalizar_conta_pagar();

create trigger contas_pagar_atualizado_em
  before update on public.contas_pagar
  for each row execute function public.definir_atualizado_em();

-- Gera as contas fixas de um mês (idempotente: não duplica).
-- Retorna quantas contas foram criadas.
create or replace function public.gerar_contas_fixas(p_competencia date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_mes        date := (date_trunc('month', p_competencia))::date;
  v_ultimo_dia integer := extract(day from (v_mes + interval '1 month' - interval '1 day'))::integer;
  v_criadas    integer;
begin
  insert into public.contas_pagar (
    descricao, categoria, tipo, fornecedor_id, conta_fixa_id,
    competencia, vencimento, valor, observacoes
  )
  select
    cf.descricao, cf.categoria, 'fixa', cf.fornecedor_id, cf.id,
    v_mes, v_mes + (least(cf.dia_vencimento, v_ultimo_dia) - 1), cf.valor, cf.observacoes
  from public.contas_fixas cf
  where cf.ativa
    and date_trunc('month', cf.inicio_em) <= v_mes
    and (cf.fim_em is null or date_trunc('month', cf.fim_em) >= v_mes)
  on conflict (conta_fixa_id, competencia) do nothing;

  get diagnostics v_criadas = row_count;
  return v_criadas;
end;
$$;

-- Visão com a situação calculada (vencida = pendente com vencimento no passado).
create view public.vw_contas_pagar
with (security_invoker = true)
as
select
  cp.*,
  f.nome as fornecedor_nome,
  case
    when cp.status = 'paga' then 'paga'
    when cp.status = 'cancelada' then 'cancelada'
    when cp.vencimento < current_date then 'vencida'
    when cp.vencimento <= current_date + 3 then 'vence_logo'
    else 'em_dia'
  end as situacao
from public.contas_pagar cp
left join public.fornecedores f on f.id = cp.fornecedor_id;

-- Segurança --------------------------------------------------------------------

alter table public.contas_fixas enable row level security;
alter table public.contas_pagar enable row level security;

create policy "Equipe gerencia contas fixas"
  on public.contas_fixas for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe gerencia contas a pagar"
  on public.contas_pagar for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));
