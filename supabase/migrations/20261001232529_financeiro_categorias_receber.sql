-- =============================================================================
-- PROMETHEUS CRM · 08 · FINANCEIRO: CATEGORIAS, CONTAS A RECEBER E AJUSTES
--   • Categorias financeiras (a pagar / a receber). Uma categoria nova digitada
--     em um lançamento é cadastrada automaticamente.
--   • Contas a receber, acompanhadas mês a mês (com parcelamento).
--   • Contas a pagar:
--       - "hoje" no fuso de Brasília (o banco roda em UTC: entre 21h e 0h o
--         current_date já é o dia seguinte e contas viravam "vencidas" antes);
--       - contas variáveis pertencem ao mês do vencimento, também ao editar;
--       - contas fixas pausadas, encerradas ou excluídas não deixam lançamentos
--         pendentes em meses em que não deveriam mais existir;
--       - aplicar alterações do modelo às pendentes também ajusta o vencimento.
-- =============================================================================

-- "Hoje" no fuso de Brasília.
create or replace function public.hoje_brasilia()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- -----------------------------------------------------------------------------
-- Categorias financeiras
-- -----------------------------------------------------------------------------

create type public.natureza_financeira as enum ('pagar', 'receber');

create table public.categorias_financeiras (
  id        uuid primary key default gen_random_uuid(),
  natureza  public.natureza_financeira not null,
  nome      text not null check (length(trim(nome)) between 1 and 60),
  criado_em timestamptz not null default now()
);

comment on table public.categorias_financeiras is 'Categorias das contas a pagar e a receber. Categorias novas digitadas nos lançamentos entram aqui automaticamente.';

-- Sem duplicatas por maiúsculas/minúsculas ("Frete" = "frete").
create unique index categorias_financeiras_nome_key
  on public.categorias_financeiras (natureza, lower(nome));

create or replace function public.normalizar_categoria_financeira()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome := regexp_replace(trim(new.nome), '\s+', ' ', 'g');
  return new;
end;
$$;

create trigger categorias_financeiras_normalizar
  before insert or update on public.categorias_financeiras
  for each row execute function public.normalizar_categoria_financeira();

-- Usada pelos lançamentos (TG_ARGV[0] = 'pagar' | 'receber'): normaliza o texto,
-- reaproveita a grafia já cadastrada ("mercadorias" → "Mercadorias") e cadastra
-- a categoria se ela ainda não existir.
create or replace function public.registrar_categoria_financeira()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_natureza public.natureza_financeira := tg_argv[0]::public.natureza_financeira;
  v_nome     text;
begin
  new.categoria := coalesce(nullif(regexp_replace(trim(coalesce(new.categoria, '')), '\s+', ' ', 'g'), ''), 'Outros');

  select c.nome into v_nome
  from public.categorias_financeiras c
  where c.natureza = v_natureza and lower(c.nome) = lower(new.categoria);

  if v_nome is null then
    insert into public.categorias_financeiras (natureza, nome)
    values (v_natureza, new.categoria)
    on conflict do nothing;
  else
    new.categoria := v_nome;
  end if;

  return new;
end;
$$;

-- Categorias iniciais + as que já foram usadas em contas existentes.
insert into public.categorias_financeiras (natureza, nome)
select 'pagar', nome
from unnest(array[
  'Mercadorias', 'Embalagens', 'Estrutura', 'Logística', 'Marketing', 'Software',
  'Serviços', 'Impostos', 'Pessoal', 'Tarifas e taxas', 'Outros'
]) as nome
on conflict do nothing;

insert into public.categorias_financeiras (natureza, nome)
select 'receber', nome
from unnest(array[
  'Vendas a prazo', 'Bares e restaurantes', 'Repasse de cartão', 'Eventos', 'Reembolsos', 'Outros'
]) as nome
on conflict do nothing;

insert into public.categorias_financeiras (natureza, nome)
select 'pagar', categoria
from (
  select trim(categoria) as categoria from public.contas_pagar
  union
  select trim(categoria) from public.contas_fixas
) usadas
where categoria <> ''
on conflict do nothing;

alter table public.categorias_financeiras enable row level security;

create policy "Equipe gerencia categorias financeiras"
  on public.categorias_financeiras for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

-- Renomeia uma categoria e leva junto as contas que a usam (corrige erros de digitação).
create or replace function public.renomear_categoria_financeira(p_id uuid, p_nome text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_categoria public.categorias_financeiras;
  v_nome      text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
begin
  select * into v_categoria from public.categorias_financeiras where id = p_id;
  if not found then
    raise exception 'Categoria não encontrada.';
  end if;
  if v_nome = '' then
    raise exception 'Informe o nome da categoria.';
  end if;
  if lower(v_categoria.nome) = 'outros' then
    raise exception 'A categoria "Outros" não pode ser renomeada.';
  end if;

  update public.categorias_financeiras set nome = v_nome where id = p_id;

  if v_categoria.natureza = 'pagar' then
    update public.contas_pagar set categoria = v_nome where lower(categoria) = lower(v_categoria.nome);
    update public.contas_fixas set categoria = v_nome where lower(categoria) = lower(v_categoria.nome);
  else
    update public.contas_receber set categoria = v_nome where lower(categoria) = lower(v_categoria.nome);
  end if;
end;
$$;

-- Exclui uma categoria; as contas que a usavam passam para "Outros".
create or replace function public.excluir_categoria_financeira(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_categoria public.categorias_financeiras;
begin
  select * into v_categoria from public.categorias_financeiras where id = p_id;
  if not found then
    raise exception 'Categoria não encontrada.';
  end if;
  if lower(v_categoria.nome) = 'outros' then
    raise exception 'A categoria "Outros" não pode ser excluída.';
  end if;

  if v_categoria.natureza = 'pagar' then
    update public.contas_pagar set categoria = 'Outros' where lower(categoria) = lower(v_categoria.nome);
    update public.contas_fixas set categoria = 'Outros' where lower(categoria) = lower(v_categoria.nome);
  else
    update public.contas_receber set categoria = 'Outros' where lower(categoria) = lower(v_categoria.nome);
  end if;

  delete from public.categorias_financeiras where id = p_id;
end;
$$;

create trigger contas_pagar_categoria
  before insert or update of categoria on public.contas_pagar
  for each row execute function public.registrar_categoria_financeira('pagar');

create trigger contas_fixas_categoria
  before insert or update of categoria on public.contas_fixas
  for each row execute function public.registrar_categoria_financeira('pagar');

-- -----------------------------------------------------------------------------
-- Contas a pagar: ajustes
-- -----------------------------------------------------------------------------

create or replace function public.normalizar_conta_pagar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Variáveis pertencem ao mês do vencimento (inclusive quando ele é alterado).
  -- Fixas ficam no mês em que foram geradas, mesmo com o vencimento adiado,
  -- para a geração automática não criar a conta de novo naquele mês.
  if new.tipo = 'variavel' then
    new.competencia := (date_trunc('month', new.vencimento))::date;
  else
    new.competencia := (date_trunc('month', coalesce(new.competencia, new.vencimento)))::date;
  end if;

  if new.status = 'paga' then
    new.pago_em    := coalesce(new.pago_em, public.hoje_brasilia());
    new.valor_pago := coalesce(new.valor_pago, new.valor);
  else
    new.pago_em    := null;
    new.valor_pago := null;
  end if;

  return new;
end;
$$;

create or replace view public.vw_contas_pagar
with (security_invoker = true)
as
select
  cp.*,
  f.nome as fornecedor_nome,
  case
    when cp.status = 'paga' then 'paga'
    when cp.status = 'cancelada' then 'cancelada'
    when cp.vencimento < public.hoje_brasilia() then 'vencida'
    when cp.vencimento <= public.hoje_brasilia() + 3 then 'vence_logo'
    else 'em_dia'
  end as situacao
from public.contas_pagar cp
left join public.fornecedores f on f.id = cp.fornecedor_id;

-- Ao pausar, encerrar ou adiar o início de uma conta fixa, remove os lançamentos
-- PENDENTES que não deveriam mais existir (do mês atual em diante). Pausar não
-- mexe no mês atual — só nos próximos. Pagas e canceladas ficam no histórico.
create or replace function public.sincronizar_conta_fixa()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mes_atual date := (date_trunc('month', public.hoje_brasilia()))::date;
begin
  delete from public.contas_pagar cp
  where cp.conta_fixa_id = new.id
    and cp.status = 'pendente'
    and cp.competencia >= v_mes_atual
    and (
      (not new.ativa and cp.competencia > v_mes_atual)
      or cp.competencia < date_trunc('month', new.inicio_em)
      or (new.fim_em is not null and cp.competencia > date_trunc('month', new.fim_em))
    );
  return null;
end;
$$;

create trigger contas_fixas_sincronizar
  after update of ativa, inicio_em, fim_em on public.contas_fixas
  for each row execute function public.sincronizar_conta_fixa();

-- Ao excluir o modelo, remove os lançamentos pendentes dos próximos meses.
-- O mês atual e os anteriores continuam no histórico.
create or replace function public.limpar_futuras_da_conta_fixa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.contas_pagar
  where conta_fixa_id = old.id
    and status = 'pendente'
    and competencia > (date_trunc('month', public.hoje_brasilia()))::date;
  return old;
end;
$$;

create trigger contas_fixas_limpar_futuras
  before delete on public.contas_fixas
  for each row execute function public.limpar_futuras_da_conta_fixa();

-- Copia descrição, categoria, fornecedor, valor e dia de vencimento do modelo para
-- as contas pendentes já geradas, do mês atual em diante. Retorna quantas mudaram.
create or replace function public.aplicar_conta_fixa_aos_pendentes(p_conta_fixa_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_alteradas integer;
begin
  update public.contas_pagar cp
  set descricao     = cf.descricao,
      categoria     = cf.categoria,
      fornecedor_id = cf.fornecedor_id,
      valor         = cf.valor,
      vencimento    = cp.competencia + (least(
                        cf.dia_vencimento,
                        extract(day from (cp.competencia + interval '1 month' - interval '1 day'))::integer
                      ) - 1)
  from public.contas_fixas cf
  where cf.id = p_conta_fixa_id
    and cp.conta_fixa_id = cf.id
    and cp.status = 'pendente'
    and cp.competencia >= (date_trunc('month', public.hoje_brasilia()))::date;

  get diagnostics v_alteradas = row_count;
  return v_alteradas;
end;
$$;

-- -----------------------------------------------------------------------------
-- Contas a receber
-- -----------------------------------------------------------------------------

create type public.status_recebimento as enum ('pendente', 'recebida', 'cancelada');

create table public.contas_receber (
  id               uuid primary key default gen_random_uuid(),
  descricao        text not null check (length(trim(descricao)) > 0),
  categoria        text not null default 'Outros',
  pagador          text,
  competencia      date not null,
  vencimento       date not null,
  valor            numeric(12, 2) not null check (valor >= 0),
  status           public.status_recebimento not null default 'pendente',
  recebido_em      date,
  valor_recebido   numeric(12, 2) check (valor_recebido is null or valor_recebido >= 0),
  forma_pagamento  text,
  observacoes      text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint contas_receber_competencia_primeiro_dia check (extract(day from competencia) = 1)
);

comment on table public.contas_receber is 'Valores a receber fora dos pedidos (vendas a prazo, repasses, eventos...), mês a mês.';
comment on column public.contas_receber.competencia is 'Mês do vencimento (sempre dia 1). Calculado automaticamente.';
comment on column public.contas_receber.pagador is 'Quem vai pagar (cliente, empresa, operadora de cartão...).';

create index contas_receber_competencia_idx on public.contas_receber (competencia, vencimento);
create index contas_receber_status_idx on public.contas_receber (status, vencimento);

create or replace function public.normalizar_conta_receber()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.competencia := (date_trunc('month', new.vencimento))::date;
  new.pagador     := nullif(trim(new.pagador), '');

  if new.status = 'recebida' then
    new.recebido_em    := coalesce(new.recebido_em, public.hoje_brasilia());
    new.valor_recebido := coalesce(new.valor_recebido, new.valor);
  else
    new.recebido_em    := null;
    new.valor_recebido := null;
  end if;

  return new;
end;
$$;

create trigger contas_receber_normalizar
  before insert or update on public.contas_receber
  for each row execute function public.normalizar_conta_receber();

create trigger contas_receber_categoria
  before insert or update of categoria on public.contas_receber
  for each row execute function public.registrar_categoria_financeira('receber');

create trigger contas_receber_atualizado_em
  before update on public.contas_receber
  for each row execute function public.definir_atualizado_em();

create view public.vw_contas_receber
with (security_invoker = true)
as
select
  cr.*,
  case
    when cr.status = 'recebida' then 'recebida'
    when cr.status = 'cancelada' then 'cancelada'
    when cr.vencimento < public.hoje_brasilia() then 'vencida'
    when cr.vencimento <= public.hoje_brasilia() + 3 then 'vence_logo'
    else 'em_dia'
  end as situacao
from public.contas_receber cr;

alter table public.contas_receber enable row level security;

create policy "Equipe gerencia contas a receber"
  on public.contas_receber for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

-- -----------------------------------------------------------------------------
-- Permissões (mesmo modelo da migration 07: anon sem acesso)
-- -----------------------------------------------------------------------------

revoke all on public.categorias_financeiras, public.contas_receber, public.vw_contas_receber from anon;
grant select, insert, update, delete on public.categorias_financeiras, public.contas_receber to authenticated, service_role;
grant select on public.vw_contas_receber, public.vw_contas_pagar to authenticated, service_role;

revoke execute on function
  public.hoje_brasilia(),
  public.aplicar_conta_fixa_aos_pendentes(uuid),
  public.renomear_categoria_financeira(uuid, text),
  public.excluir_categoria_financeira(uuid)
from public, anon;

grant execute on function
  public.hoje_brasilia(),
  public.aplicar_conta_fixa_aos_pendentes(uuid),
  public.renomear_categoria_financeira(uuid, text),
  public.excluir_categoria_financeira(uuid)
to authenticated, service_role;
