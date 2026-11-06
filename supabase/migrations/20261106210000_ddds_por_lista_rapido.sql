-- =============================================================================
-- PROMETHEUS CRM · BANCO DE LEADS · CONTAGEM POR DDD DA LISTA SEM TIMEOUT
--   ddds_dos_leads era uma função SQL com os filtros opcionais na mesma consulta
--   ("p_lista_id is null or l.lista_id = p_lista_id"). O plano genérico não usa
--   o índice da lista: ao abrir uma lista, o banco percorria os ~770 mil leads
--   e passava dos 8 s do statement_timeout (a lista "Contatos Central da
--   Cerveja", com 383 leads, levava ~5 s e às vezes caía).
--   Agora cada caso (lista, pasta, banco todo) tem a sua consulta, e a da lista
--   sai direto do índice (lista_id, ddd, whatsapp).
--
--   Também corrige a lista "Contatos Central da Cerveja", importada antes de o
--   importador entender planilhas com linhas de título no topo e o DDD numa
--   coluna separada do telefone: nenhum número tinha virado WhatsApp.
-- =============================================================================

create or replace function public.ddds_dos_leads(p_pasta_id uuid default null, p_lista_id uuid default null)
returns table (ddd text, numeros integer)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_lista_id is not null then
    return query
      select l.ddd, count(distinct l.whatsapp)::integer
      from public.leads l
      where l.lista_id = p_lista_id
        and l.whatsapp is not null
        and (p_pasta_id is null or exists (
          select 1 from public.leads_listas ll where ll.id = p_lista_id and ll.pasta_id = p_pasta_id
        ))
      group by l.ddd
      order by l.ddd nulls last;
  elsif p_pasta_id is not null then
    return query
      select l.ddd, count(distinct l.whatsapp)::integer
      from public.leads_listas ll
      join public.leads l on l.lista_id = ll.id
      where ll.pasta_id = p_pasta_id
        and l.whatsapp is not null
      group by l.ddd
      order by l.ddd nulls last;
  else
    return query
      select l.ddd, count(distinct l.whatsapp)::integer
      from public.leads l
      where l.whatsapp is not null
      group by l.ddd
      order by l.ddd nulls last;
  end if;
end;
$$;

-- Correção da lista "Contatos Central da Cerveja" ------------------------------
-- Planilha: 2 linhas de título, cabeçalho "Nº | Nome | DDD | Telefone | WhatsApp"
-- (c0..c4) e o telefone sem DDD ("91213-7799"). Só roda se a lista ainda está
-- sem nenhum WhatsApp (ou seja, uma vez só).
do $$
declare
  v_lista uuid := '1de879b5-4d69-42e4-9825-4cb793a76e92';
begin
  if not exists (select 1 from public.leads_listas where id = v_lista and com_whatsapp = 0) then
    return;
  end if;

  -- Linhas de título e o cabeçalho, que entraram como leads.
  delete from public.leads
  where lista_id = v_lista
    and whatsapp is null
    and (dados ->> 'c2' is null or dados ->> 'c2' = 'DDD');

  with numeros as (
    select l.id,
           nullif(nullif(l.dados ->> 'c1', ''), '-') as nome,
           case
             when l.dados ->> 'c2' ~ '^[0-9]{2}$' and length(t.digitos) between 8 and 9 then (l.dados ->> 'c2') || t.digitos
             else t.digitos
           end as bruto
    from public.leads l
    cross join lateral (select ltrim(regexp_replace(coalesce(l.dados ->> 'c3', ''), '[^0-9]', '', 'g'), '0') as digitos) t
    where l.lista_id = v_lista
  ),
  normalizados as (
    select id, nome,
           case
             when length(bruto) in (10, 11) then '55' || bruto
             when length(bruto) between 12 and 15 then bruto
           end as whatsapp
    from numeros
  ),
  -- O mesmo número duas vezes na lista: fica a 1ª ocorrência (como no importador).
  unicos as (
    select id, nome,
           case when row_number() over (partition by whatsapp order by id) = 1 then whatsapp end as whatsapp
    from normalizados
  )
  update public.leads l
  set whatsapp = u.whatsapp,
      nome     = u.nome
  from unicos u
  where l.id = u.id;

  update public.leads_listas
  set colunas = '[
    {"chave": "c0", "rotulo": "Nº",       "tipo": "texto"},
    {"chave": "c1", "rotulo": "Nome",     "tipo": "nome"},
    {"chave": "c2", "rotulo": "DDD",      "tipo": "texto"},
    {"chave": "c3", "rotulo": "Telefone", "tipo": "telefone"},
    {"chave": "c4", "rotulo": "WhatsApp", "tipo": "texto"}
  ]'::jsonb
  where id = v_lista;

  -- Recalcula total, com WhatsApp, DDDs da lista e os resumos da pasta e do banco.
  perform public.concluir_importacao_leads(v_lista);
end;
$$;
