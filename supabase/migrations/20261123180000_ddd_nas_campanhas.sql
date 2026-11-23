-- Campanhas: disparo só para alguns DDDs das listas do Banco de Leads (ex.: a lista
-- "Contatos Central da Cerveja", só o DDD 11 — ou o 11 e o 21).
--
-- As duas funções ganham um filtro opcional no fim (sem ele, fazem o mesmo de antes — o
-- código já no ar continua funcionando com a migration aplicada):
--   · adicionar_lista_campanha(..., p_ddd): uma página de um DDD da lista, direto do índice
--     (lista_id, ddd, whatsapp). A tela chama uma vez por lista e DDD escolhido;
--   · publico_listas_campanha(..., p_ddds): a prévia "quantos números diferentes" já com o filtro.
-- Os números sem DDD do Brasil (estrangeiros ou inválidos) ficam de fora quando há filtro.
-- O 9º dígito que falta não muda o DDD: o "gêmeo" sem o 9 cai no mesmo filtro.

-- Página de uma lista (ou só de um DDD dela) ------------------------------------------
-- Retorna { inseridos, lidos, ultimo } (ultimo nulo = acabou).

drop function public.adicionar_lista_campanha(uuid, uuid, text);

create function public.adicionar_lista_campanha(
  p_campanha_id uuid,
  p_lista_id uuid,
  p_apos text default null,
  p_ddd text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_numeros text[];
  v_nomes text[];
  v_lidos integer;
  v_inseridos integer;
begin
  if not exists (select 1 from public.campanhas where id = p_campanha_id and status = 'preparando') then
    raise exception 'Esta campanha não está mais recebendo contatos.';
  end if;

  -- Uma consulta para cada caso: com o DDD, o plano usa o índice (lista_id, ddd, whatsapp).
  if p_ddd is null then
    select array_agg(p.whatsapp order by p.whatsapp), array_agg(p.nome order by p.whatsapp)
    into v_numeros, v_nomes
    from (
      select l.whatsapp, l.nome
      from public.leads l
      where l.lista_id = p_lista_id and l.whatsapp is not null and l.whatsapp > coalesce(p_apos, '')
      order by l.whatsapp
      limit 5000
    ) p;
  else
    select array_agg(p.whatsapp order by p.whatsapp), array_agg(p.nome order by p.whatsapp)
    into v_numeros, v_nomes
    from (
      select l.whatsapp, l.nome
      from public.leads l
      where l.lista_id = p_lista_id and l.whatsapp is not null and l.ddd = p_ddd and l.whatsapp > coalesce(p_apos, '')
      order by l.whatsapp
      limit 5000
    ) p;
  end if;

  with validos as (
    select u.whatsapp, u.nome
    from unnest(coalesce(v_numeros, '{}'), coalesce(v_nomes, '{}')) as u(whatsapp, nome)
    where length(u.whatsapp) between 12 and 15
  ),
  inseridos as (
    insert into public.campanha_envios (campanha_id, whatsapp, nome)
    select p_campanha_id, v.whatsapp, v.nome
    from validos v
    on conflict do nothing
    returning 1
  )
  select (select count(*) from validos), (select count(*) from inseridos)
  into v_lidos, v_inseridos;

  update public.campanhas set contatos_lidos = contatos_lidos + v_lidos where id = p_campanha_id;

  return jsonb_build_object('inseridos', v_inseridos, 'lidos', v_lidos, 'ultimo', v_numeros[cardinality(v_numeros)]);
end;
$$;

revoke execute on function public.adicionar_lista_campanha(uuid, uuid, text, text) from public, anon;
grant execute on function public.adicionar_lista_campanha(uuid, uuid, text, text) to authenticated, service_role;

-- Prévia do público (soma e números diferentes), com o filtro de DDD --------------------
-- Mesmo cálculo de antes (distintos menos os "gêmeos" sem o 9). O filtro entra no texto da
-- consulta só quando existe: com ele, o banco lê só os DDDs escolhidos pelo índice
-- (~2,5 s com o 11 e o 21 nas 19 listas; sem filtro, ~4 s).

drop function public.publico_listas_campanha(uuid[]);

create function public.publico_listas_campanha(p_lista_ids uuid[], p_ddds text[] default null)
returns jsonb
language plpgsql
stable
set search_path = ''
set work_mem = '64MB'
as $$
declare
  v_filtro text := case when cardinality(p_ddds) > 0 then ' and l.ddd = any ($2)' else '' end;
  v_saida jsonb;
begin
  execute format($sql$
    with sel as (
      select l.whatsapp
      from public.leads l
      where l.lista_id = any ($1) and l.whatsapp is not null and length(l.whatsapp) between 12 and 15%s
    )
    select jsonb_build_object(
      'soma', (select count(*) from sel),
      'unicos', (select count(*) from (select distinct s.whatsapp from sel s) d)
        - (select count(distinct s.whatsapp) from sel s
           where length(s.whatsapp) = 12
             and s.whatsapp <> public.whatsapp_canonico(s.whatsapp)
             and exists (
               select 1 from public.leads b
               where b.whatsapp = public.whatsapp_canonico(s.whatsapp) and b.lista_id = any ($1)
             ))
    )
  $sql$, v_filtro)
  into v_saida
  using p_lista_ids, p_ddds;

  return v_saida;
end;
$$;

revoke execute on function public.publico_listas_campanha(uuid[], text[]) from public, anon;
grant execute on function public.publico_listas_campanha(uuid[], text[]) to authenticated, service_role;
