-- =============================================================================
-- PROMETHEUS CRM · BANCO DE LEADS · DDD
--   DDD de cada WhatsApp, para filtrar listas e pastas por região, contar
--   quantos números há de cada DDD e exportar só esses números (CSV/Excel).
-- =============================================================================

-- DDD de um WhatsApp normalizado (5511987654321 → '11'). Só números do Brasil
-- num formato possível: 55 + DDD que existe + celular com 9 dígitos (começando
-- em 9) ou 8 dígitos (fixo ou celular antigo). CPF/CNPJ e códigos que caíram na
-- coluna de WhatsApp na importação ficam sem DDD.
create or replace function public.ddd_do_whatsapp(p_whatsapp text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_whatsapp ~ '^55[1-9][1-9](9[0-9]{8}|[0-9]{8})$'
     and substr(p_whatsapp, 3, 2) in (
       '11', '12', '13', '14', '15', '16', '17', '18', '19',
       '21', '22', '24', '27', '28',
       '31', '32', '33', '34', '35', '37', '38',
       '41', '42', '43', '44', '45', '46', '47', '48', '49',
       '51', '53', '54', '55',
       '61', '62', '63', '64', '65', '66', '67', '68', '69',
       '71', '73', '74', '75', '77', '79',
       '81', '82', '83', '84', '85', '86', '87', '88', '89',
       '91', '92', '93', '94', '95', '96', '97', '98', '99'
     )
    then substr(p_whatsapp, 3, 2)
  end;
$$;

alter table public.leads
  add column ddd text generated always as (public.ddd_do_whatsapp(whatsapp)) stored;

comment on column public.leads.ddd is 'DDD do WhatsApp (só números do Brasil em formato válido), mantido pelo banco.';

-- Com o número no índice, filtrar um DDD já devolve os números em ordem (exportação em páginas).
create index leads_lista_ddd_idx on public.leads (lista_id, ddd, whatsapp) where ddd is not null;

-- A visão foi criada com l.* (colunas fixadas na criação): recriada para incluir o DDD.
drop view public.vw_leads;

create view public.vw_leads
with (security_invoker = true)
as
select
  l.*,
  exists (select 1 from public.clientes c where c.whatsapp = l.whatsapp) as ja_cliente
from public.leads l;

revoke all on public.vw_leads from anon;
grant select on public.vw_leads to authenticated, service_role;

-- Contagem por DDD ----------------------------------------------------------------

-- Quantos números (sem repetir) há de cada DDD numa lista ou numa pasta.
-- A linha com ddd nulo soma os números sem DDD do Brasil (estrangeiros ou inválidos).
create or replace function public.ddds_dos_leads(p_pasta_id uuid default null, p_lista_id uuid default null)
returns table (ddd text, numeros integer)
language sql
stable
set search_path = ''
as $$
  select l.ddd, count(distinct l.whatsapp)::integer
  from public.leads l
  join public.leads_listas ll on ll.id = l.lista_id
  where l.whatsapp is not null
    and (p_lista_id is null or l.lista_id = p_lista_id)
    and (p_pasta_id is null or ll.pasta_id = p_pasta_id)
  group by l.ddd
  order by l.ddd nulls last;
$$;

-- Exportação ----------------------------------------------------------------------

-- Números para exportar, sem repetir (se o número está em mais de uma lista da
-- pasta, vale a ocorrência com nome). Vem em páginas de até 5.000, em ordem de
-- número: passe em p_apos o último número recebido para buscar a próxima página.
-- Cada item: [whatsapp, nome, email, ddd, lista].
create or replace function public.exportar_numeros_leads(
  p_pasta_id uuid default null,
  p_lista_id uuid default null,
  p_ddd text default null,
  p_apos text default null,
  p_limite integer default 5000
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_array(x.whatsapp, x.nome, x.email, x.ddd, x.lista) order by x.whatsapp), '[]'::jsonb)
  from (
    select distinct on (l.whatsapp) l.whatsapp, l.nome, l.email, l.ddd, ll.nome as lista
    from public.leads l
    join public.leads_listas ll on ll.id = l.lista_id
    where l.whatsapp > coalesce(p_apos, '')
      and (p_ddd is null or l.ddd = p_ddd)
      and (p_lista_id is null or l.lista_id = p_lista_id)
      and (p_pasta_id is null or ll.pasta_id = p_pasta_id)
    order by l.whatsapp, l.nome is null, ll.criado_em
    limit least(greatest(coalesce(p_limite, 5000), 1), 5000)
  ) x;
$$;

revoke all on function
  public.ddds_dos_leads(uuid, uuid),
  public.exportar_numeros_leads(uuid, uuid, text, text, integer)
from public, anon;

grant execute on function
  public.ddds_dos_leads(uuid, uuid),
  public.exportar_numeros_leads(uuid, uuid, text, text, integer)
to authenticated, service_role;
