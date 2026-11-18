-- Campanhas: o mesmo número em várias listas recebe 1 mensagem só — e a tela mostra quantos
-- repetidos foram tirados (na criação e na página da campanha).
--
-- O banco já guardava o número uma vez por campanha (campanha_envios_numero_key, no formato
-- canônico). Agora também conta: contatos_lidos soma o que veio das listas/arquivo antes de
-- tirar os repetidos; na confirmação, repetidos = lidos − contatos que ficaram.

alter table public.campanhas
  add column contatos_lidos integer not null default 0,
  add column repetidos integer not null default 0;

comment on column public.campanhas.contatos_lidos is 'Números válidos lidos das listas/arquivo, antes de tirar os repetidos (preenchido enquanto a campanha está em preparo).';
comment on column public.campanhas.repetidos is 'Números repetidos tirados da campanha (o mesmo contato em mais de uma lista ou linha). Calculado na confirmação.';

-- vw_campanhas: "c.*" é expandido quando a view é criada — recriada para trazer as colunas novas.
drop view public.vw_campanhas;

create view public.vw_campanhas
with (security_invoker = true)
as
select c.*, n.pendentes, n.enviadas, n.entregues, n.lidas, n.respostas, n.falhas, n.ignoradas, n.sairam
from public.campanhas c
cross join lateral (
  select
    count(*) filter (where e.status in ('pendente', 'enviando'))::integer as pendentes,
    count(*) filter (where e.enviada_em is not null)::integer            as enviadas,
    count(*) filter (where e.entregue_em is not null)::integer           as entregues,
    count(*) filter (where e.lida_em is not null)::integer               as lidas,
    count(*) filter (where e.respondida_em is not null)::integer         as respostas,
    count(*) filter (where e.status = 'falhou')::integer                 as falhas,
    count(*) filter (where e.status = 'ignorada')::integer               as ignoradas,
    count(*) filter (where e.saiu_em is not null)::integer               as sairam
  from public.campanha_envios e
  where e.campanha_id = c.id
) n;

revoke all on public.vw_campanhas from anon;
grant select on public.vw_campanhas to authenticated, service_role;

-- Página de uma lista do Banco de Leads: agora também soma os números lidos na campanha.
-- Retorna { inseridos, lidos, ultimo } (ultimo nulo = acabou).
create or replace function public.adicionar_lista_campanha(p_campanha_id uuid, p_lista_id uuid, p_apos text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_lidos integer;
  v_inseridos integer;
  v_ultimo text;
begin
  if not exists (select 1 from public.campanhas where id = p_campanha_id and status = 'preparando') then
    raise exception 'Esta campanha não está mais recebendo contatos.';
  end if;

  with pagina as (
    select l.whatsapp, l.nome
    from public.leads l
    where l.lista_id = p_lista_id and l.whatsapp is not null and l.whatsapp > coalesce(p_apos, '')
    order by l.whatsapp
    limit 5000
  ),
  validos as (
    select p.whatsapp, p.nome from pagina p where length(p.whatsapp) between 12 and 15
  ),
  inseridos as (
    insert into public.campanha_envios (campanha_id, whatsapp, nome)
    select p_campanha_id, v.whatsapp, v.nome
    from validos v
    on conflict do nothing
    returning 1
  )
  select (select count(*) from validos), (select count(*) from inseridos), (select max(whatsapp) from pagina)
  into v_lidos, v_inseridos, v_ultimo;

  update public.campanhas set contatos_lidos = contatos_lidos + v_lidos where id = p_campanha_id;

  return jsonb_build_object('inseridos', v_inseridos, 'lidos', v_lidos, 'ultimo', v_ultimo);
end;
$$;

-- Fecha a lista de contatos: tira quem pediu para não receber, conta os repetidos e manda
-- para a análise da Meta.
create or replace function public.confirmar_campanha(p_campanha_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_total integer;
  v_ignorados integer;
  v_repetidos integer;
begin
  if not exists (select 1 from public.campanhas where id = p_campanha_id and status = 'preparando') then
    raise exception 'Esta campanha já foi confirmada.';
  end if;

  update public.campanha_envios e
  set status = 'ignorada', erro = 'Pediu para não receber campanhas.'
  where e.campanha_id = p_campanha_id
    and e.status = 'pendente'
    and exists (select 1 from public.whatsapp_descadastros d where d.whatsapp = e.whatsapp);
  get diagnostics v_ignorados = row_count;

  select count(*) into v_total from public.campanha_envios where campanha_id = p_campanha_id;
  if v_total - v_ignorados = 0 then
    raise exception 'Nenhum número válido para enviar nesta campanha.';
  end if;

  update public.campanhas
  set status = 'aguardando_aprovacao', total = v_total, repetidos = greatest(contatos_lidos - v_total, 0)
  where id = p_campanha_id
  returning repetidos into v_repetidos;

  return jsonb_build_object('total', v_total, 'ignorados', v_ignorados, 'repetidos', v_repetidos);
end;
$$;

-- Prévia na criação: quantos números as listas escolhidas somam e quantos são diferentes.
-- Mesmo critério da campanha: número canônico (o 9º dígito que falta conta como o mesmo número).
-- Na mesma lista o número já é único, e o canônico só difere em números de 12 dígitos — por
-- isso conta os distintos direto e desconta só os "gêmeos" sem o 9 (~3 s com as 18 listas, 765 mil leads).
create or replace function public.publico_listas_campanha(p_lista_ids uuid[])
returns jsonb
language sql
stable
set search_path = ''
set work_mem = '64MB'
as $$
  with sel as (
    select l.whatsapp
    from public.leads l
    where l.lista_id = any (p_lista_ids) and l.whatsapp is not null and length(l.whatsapp) between 12 and 15
  )
  select jsonb_build_object(
    'soma', (select count(*) from sel),
    'unicos', (select count(*) from (select distinct s.whatsapp from sel s) d)
      - (select count(distinct s.whatsapp) from sel s
         where length(s.whatsapp) = 12
           and s.whatsapp <> public.whatsapp_canonico(s.whatsapp)
           and exists (
             select 1 from public.leads b
             where b.whatsapp = public.whatsapp_canonico(s.whatsapp) and b.lista_id = any (p_lista_ids)
           ))
  );
$$;

revoke execute on function public.publico_listas_campanha(uuid[]) from public, anon;
grant execute on function public.publico_listas_campanha(uuid[]) to authenticated, service_role;
