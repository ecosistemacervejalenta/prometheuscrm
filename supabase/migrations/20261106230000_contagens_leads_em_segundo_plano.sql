-- =============================================================================
-- PROMETHEUS CRM · BANCO DE LEADS · CONTAGENS EM SEGUNDO PLANO E EXPORTAÇÃO RÁPIDA
--   Medido em 2026-11-06, como usuário logado (limite de 8 s por consulta):
--     · contar os números por DDD do banco todo: 4,5 a 14 s — rodava DENTRO de
--       concluir_importacao_leads e da exclusão/mudança de pasta de uma lista,
--       então importar ou excluir uma lista podia falhar;
--     · DDDs da pasta Projeto Apolo (770 mil leads): 4 a 6 s a cada abertura;
--     · exportar_numeros_leads: mais de 25 s até numa lista de 32 leads (o
--       filtro "p_lista_id is null or ..." impedia o uso do índice) — o "Baixar
--       Excel/CSV" não funcionava em nenhuma lista nem pasta.
--   Agora:
--     · cada pasta guarda os números por DDD (leads_pastas.ddds), como a lista
--       (leads_listas.ddds) e o banco (leads_resumo.ddds) — as telas só leem;
--     · importar, excluir ou mover uma lista só MARCA a pasta e o banco como
--       pendentes; o pg_cron recalcula a cada 5 minutos, sem o limite de 8 s
--       (o atendimento do WhatsApp também conclui a lista automática a cada
--       contato novo — antes isso recontava o banco todo a cada mensagem);
--     · a exportação busca cada lista pelo próprio índice (0,1–0,3 s por página).
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;

-- Colunas novas -------------------------------------------------------------------

alter table public.leads_pastas
  add column ddds              jsonb   not null default '{}' check (jsonb_typeof(ddds) = 'object'),
  add column contagem_pendente boolean not null default false;

comment on column public.leads_pastas.ddds is 'Números diferentes da pasta por DDD ({"11": 1234, ...}); sem DDD do Brasil = whatsapp_unicos − whatsapp_validos. Mantido por atualizar_resumo_leads.';
comment on column public.leads_pastas.contagem_pendente is 'Uma lista da pasta mudou e as contagens ainda não foram recalculadas (o pg_cron recalcula a cada 5 minutos).';

alter table public.leads_resumo
  add column pendente boolean not null default false;

comment on column public.leads_resumo.pendente is 'Alguma lista mudou e o resumo do banco ainda não foi recalculado (o pg_cron recalcula a cada 5 minutos).';

-- Recálculo (pesado: só no pg_cron ou na migration) ----------------------------------

create or replace function public.atualizar_resumo_leads(p_pastas uuid[] default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Tira as marcas ANTES de contar: o que mudar durante a contagem fica marcado para a próxima rodada.
  update public.leads_pastas
  set contagem_pendente = false
  where contagem_pendente and (p_pastas is null or id = any (p_pastas));

  update public.leads_resumo set pendente = false where pendente;

  update public.leads_pastas p
  set whatsapp_unicos  = x.unicos,
      whatsapp_validos = x.validos,
      ddds             = x.ddds
  from public.leads_pastas alvo
  cross join lateral (
    select coalesce(sum(d.numeros), 0)::integer                                                as unicos,
           coalesce(sum(d.numeros) filter (where d.ddd is not null), 0)::integer                as validos,
           coalesce(jsonb_object_agg(d.ddd, d.numeros) filter (where d.ddd is not null), '{}'::jsonb) as ddds
    from public.ddds_dos_leads(p_pasta_id => alvo.id) d
  ) x
  where p.id = alvo.id
    and (p_pastas is null or alvo.id = any (p_pastas));

  update public.leads_resumo r
  set whatsapp_unicos = coalesce(x.unicos, 0),
      ddds            = coalesce(x.ddds, '{}'::jsonb),
      atualizado_em   = now()
  from (
    select sum(d.numeros)::integer as unicos,
           jsonb_object_agg(d.ddd, d.numeros) filter (where d.ddd is not null) as ddds
    from public.ddds_dos_leads() d
  ) x
  where r.id;
end;
$$;

-- Marca as pastas (e o banco) para recalcular — leve, pode rodar dentro de qualquer ação.
create or replace function public.marcar_resumo_leads_pendente(p_pastas uuid[])
returns void
language sql
set search_path = ''
as $$
  update public.leads_pastas set contagem_pendente = true where id = any (p_pastas) and not contagem_pendente;
  update public.leads_resumo set pendente = true where not pendente;
$$;

-- Rodada do pg_cron: recalcula só o que está marcado (sem nada marcado, não faz nada).
create or replace function public.processar_resumo_leads()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pastas uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_pastas from public.leads_pastas where contagem_pendente;
  if cardinality(v_pastas) = 0 and not exists (select 1 from public.leads_resumo where pendente) then
    return;
  end if;
  perform public.atualizar_resumo_leads(v_pastas);
end;
$$;

-- Concluir a importação: contagens da lista na hora (pelos índices da lista) e marca a pasta.
create or replace function public.concluir_importacao_leads(p_lista_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.leads_listas ll
  set total                  = (select count(*) from public.leads l where l.lista_id = ll.id),
      com_whatsapp           = (select count(*) from public.leads l where l.lista_id = ll.id and l.whatsapp is not null),
      com_email              = (select count(*) from public.leads l where l.lista_id = ll.id and l.email is not null),
      sem_whatsapp_com_email = (select count(*) from public.leads l where l.lista_id = ll.id and l.whatsapp is null and l.email is not null),
      ddds                   = (
        select coalesce(jsonb_object_agg(x.ddd, x.numeros), '{}'::jsonb)
        from (
          select l.ddd, count(*) as numeros
          from public.leads l
          where l.lista_id = ll.id and l.whatsapp is not null and l.ddd is not null
          group by l.ddd
        ) x
      ),
      status                 = 'pronta'
  where ll.id = p_lista_id;

  select public.marcar_resumo_leads_pendente(array(select pasta_id from public.leads_listas where id = p_lista_id));
$$;

-- Excluir uma lista ou movê-la de pasta: só marca (o recálculo fica com o pg_cron).
create or replace function public.leads_listas_atualizar_resumo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.marcar_resumo_leads_pendente(array[old.pasta_id]);
  elsif new.pasta_id is distinct from old.pasta_id then
    perform public.marcar_resumo_leads_pendente(array[old.pasta_id, new.pasta_id]);
  end if;
  return null;
end;
$$;

-- Exportação ----------------------------------------------------------------------
-- Números para exportar, sem repetir (número em mais de uma lista: vale a
-- ocorrência com nome, da lista mais antiga). Páginas em ordem de número: passe
-- em p_apos o último número recebido. Cada item: [whatsapp, nome, email, ddd, lista].
--   1º os próximos números: uma consulta por lista, cada uma pelo índice da
--      lista (lista_id, whatsapp) ou (lista_id, ddd, whatsapp), juntas no fim;
--   2º os dados de cada número escolhido.
create or replace function public.exportar_numeros_leads(
  p_pasta_id uuid default null,
  p_lista_id uuid default null,
  p_ddd text default null,
  p_apos text default null,
  p_limite integer default 5000
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_limite  integer := least(greatest(coalesce(p_limite, 5000), 1), 5000);
  v_listas  uuid[];
  v_partes  text;
  v_numeros text[];
  v_saida   jsonb;
begin
  select array_agg(ll.id) into v_listas
  from public.leads_listas ll
  where (p_lista_id is null or ll.id = p_lista_id)
    and (p_pasta_id is null or ll.pasta_id = p_pasta_id);
  if v_listas is null then
    return '[]'::jsonb;
  end if;

  select string_agg(format(
           '(select l.whatsapp from public.leads l where l.lista_id = %L and l.whatsapp is not null and l.whatsapp > $1%s order by l.whatsapp limit $2)',
           x.id,
           case when p_ddd is not null then ' and l.ddd = $3' else '' end
         ), ' union all ')
  into v_partes
  from unnest(v_listas) x(id);

  execute format('select array(select distinct n.whatsapp from (%s) n order by n.whatsapp limit $2)', v_partes)
  into v_numeros
  using coalesce(p_apos, ''), v_limite, p_ddd;

  select coalesce(jsonb_agg(jsonb_build_array(n.whatsapp, m.nome, m.email, m.ddd, m.lista) order by n.whatsapp), '[]'::jsonb)
  into v_saida
  from unnest(v_numeros) n(whatsapp)
  cross join lateral (
    select l.nome, l.email, l.ddd, ll.nome as lista
    from public.leads l
    join public.leads_listas ll on ll.id = l.lista_id
    where l.whatsapp = n.whatsapp
      and l.lista_id = any (v_listas)
    order by l.nome is null, ll.criado_em
    limit 1
  ) m;

  return v_saida;
end;
$$;

-- Visão das pastas: recriada para incluir as colunas novas de leads_pastas (p.*) ------

drop view public.vw_leads_pastas;

create view public.vw_leads_pastas
with (security_invoker = true)
as
select
  p.*,
  count(ll.id)::integer                                as listas,
  coalesce(sum(ll.total), 0)::integer                  as leads,
  coalesce(sum(ll.com_whatsapp), 0)::integer           as com_whatsapp,
  max(ll.criado_em)                                    as ultima_lista_em,
  coalesce(sum(ll.com_email), 0)::integer              as com_email,
  coalesce(sum(ll.sem_whatsapp_com_email), 0)::integer as sem_whatsapp_com_email
from public.leads_pastas p
left join public.leads_listas ll on ll.pasta_id = p.id
group by p.id;

-- Segurança -----------------------------------------------------------------------

revoke all on public.vw_leads_pastas from anon;
grant select on public.vw_leads_pastas to authenticated, service_role;

-- O recálculo completo é pesado: só o pg_cron (postgres) roda.
revoke execute on function public.atualizar_resumo_leads(uuid[]) from public, anon, authenticated;
revoke execute on function public.processar_resumo_leads() from public, anon, authenticated, service_role;

revoke execute on function public.marcar_resumo_leads_pendente(uuid[]) from public, anon;
grant execute on function public.marcar_resumo_leads_pendente(uuid[]) to authenticated, service_role;

revoke execute on function public.exportar_numeros_leads(uuid, uuid, text, text, integer) from public, anon;
grant execute on function public.exportar_numeros_leads(uuid, uuid, text, text, integer) to authenticated, service_role;

-- Agendamento: a cada 5 minutos (sem nada pendente, a rodada só confere e sai) --------

select cron.schedule('resumo-leads', '*/5 * * * *', 'select public.processar_resumo_leads()');

-- Contagens de agora (preenche leads_pastas.ddds de todas as pastas).
select public.atualizar_resumo_leads();
