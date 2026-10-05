-- =============================================================================
-- PROMETHEUS CRM · KIT DE CERVEJAS E GALERIA DE FOTOS DO PRODUTO
--
--   • produtos.fotos: várias fotos por produto, na ordem de exibição (a 1ª é a capa).
--     imagem_url continua existindo e passa a ser sempre a capa (fotos[1]) — o resto
--     do sistema (lista de produtos, pedidos, prévia do link) segue usando imagem_url.
--   • produtos.cervejas_do_kit: quando o produto é um kit, a lista das cervejas que
--     vêm nele (podem ser de marcas diferentes). Só descritivo: o kit é vendido como
--     um item, com um preço.
-- =============================================================================

alter table public.produtos
  add column fotos text[] not null default '{}'
    constraint produtos_fotos_limite check (cardinality(fotos) <= 10),
  add column cervejas_do_kit jsonb not null default '[]'
    constraint produtos_cervejas_do_kit_lista check (jsonb_typeof(cervejas_do_kit) = 'array');

comment on column public.produtos.fotos is 'Fotos do produto na ordem de exibição (URLs públicas do bucket "produtos"). A 1ª é a capa (= imagem_url).';
comment on column public.produtos.cervejas_do_kit is 'Kit: [{nome, cervejaria, estilo, teor_alcoolico, volume_ml, quantidade, descricao}]. Vazio = cerveja avulsa.';

update public.produtos set fotos = array[imagem_url] where imagem_url is not null and cardinality(fotos) = 0;

-- Mantém imagem_url (capa) e fotos em sincronia, venha a mudança de qualquer tela.
create or replace function public.sincronizar_capa_produto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if cardinality(new.fotos) > 0 then
      new.imagem_url := new.fotos[1];
    elsif new.imagem_url is not null then
      new.fotos := array[new.imagem_url];
    end if;
  elsif new.fotos is distinct from old.fotos then
    new.imagem_url := new.fotos[1]; -- nulo quando não sobra nenhuma foto
  elsif new.imagem_url is distinct from old.imagem_url then
    -- Capa trocada pelo cadastro de produtos (uma foto só): substitui a 1ª foto.
    new.fotos := case
      when new.imagem_url is null then coalesce(old.fotos[2:], '{}')
      else array[new.imagem_url] || coalesce(old.fotos[2:], '{}')
    end;
  end if;
  return new;
end;
$$;

create trigger produtos_sincronizar_capa
  before insert or update of fotos, imagem_url on public.produtos
  for each row execute function public.sincronizar_capa_produto();

-- Itens da pré-venda agora trazem as fotos e as cervejas do kit (colunas novas no fim).
create or replace view public.vw_pre_venda_itens
with (security_invoker = true)
as
select
  pvi.*,
  p.nome,
  p.estilo,
  p.cervejaria,
  p.volume_ml,
  p.teor_alcoolico,
  p.descricao,
  p.imagem_url,
  coalesce(v.vendido, 0) as vendido,
  case
    when pvi.quantidade_disponivel is null then null
    else greatest(pvi.quantidade_disponivel - coalesce(v.vendido, 0), 0)
  end as restante,
  p.fotos,
  p.cervejas_do_kit
from public.pre_venda_itens pvi
join public.produtos p on p.id = pvi.produto_id
left join lateral (
  select sum(i.quantidade)::integer as vendido
  from public.pedido_itens i
  join public.pedidos pe on pe.id = i.pedido_id
  where pe.pre_venda_id = pvi.pre_venda_id
    and i.produto_id = pvi.produto_id
    and pe.status <> 'cancelado'
) v on true;

-- =============================================================================
-- EXCLUSÕES DEFINITIVAS (somente administradores)
-- Pedido excluído sai do faturamento; fica um registro na linha do tempo do cliente.
-- Para manter o histórico, o caminho continua sendo o status "cancelado".
-- =============================================================================

create or replace function public.excluir_pedido(p_pedido_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
begin
  if not public.eh_admin() then
    raise exception 'Só administradores podem excluir vendas.' using errcode = 'P0001';
  end if;

  delete from public.pedidos where id = p_pedido_id returning * into v_pedido;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;

  insert into public.atividades (cliente_id, tipo, descricao, dados)
  values (
    v_pedido.cliente_id, 'pedido_excluido',
    format('Pedido #%s excluído (R$ %s)', v_pedido.numero, replace(to_char(v_pedido.total, 'FM999999990.00'), '.', ',')),
    jsonb_build_object('numero', v_pedido.numero, 'total', v_pedido.total, 'canal', v_pedido.canal)
  );
end;
$$;

-- Exclui a pré-venda (e as cervejas dela). Com pedidos, só se p_com_pedidos = true.
-- Devolve quantos pedidos foram excluídos junto.
create or replace function public.excluir_pre_venda(p_pre_venda_id uuid, p_com_pedidos boolean default false)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_titulo   text;
  v_pedidos  integer := 0;
begin
  if not public.eh_admin() then
    raise exception 'Só administradores podem excluir pré-vendas.' using errcode = 'P0001';
  end if;

  select titulo into v_titulo from public.pre_vendas where id = p_pre_venda_id;
  if not found then
    raise exception 'Pré-venda não encontrada.' using errcode = 'P0001';
  end if;

  if p_com_pedidos then
    with apagados as (
      delete from public.pedidos where pre_venda_id = p_pre_venda_id
      returning cliente_id, numero, total
    )
    insert into public.atividades (cliente_id, tipo, descricao, dados)
    select cliente_id, 'pedido_excluido',
           format('Pedido #%s excluído junto com a pré-venda "%s"', numero, v_titulo),
           jsonb_build_object('numero', numero, 'total', total)
    from apagados;
    get diagnostics v_pedidos = row_count;
  elsif exists (select 1 from public.pedidos where pre_venda_id = p_pre_venda_id) then
    raise exception 'Esta pré-venda tem pedidos. Confirme a exclusão junto com os pedidos.' using errcode = 'P0001';
  end if;

  delete from public.pre_vendas where id = p_pre_venda_id;
  return v_pedidos;
end;
$$;

revoke all on function public.excluir_pedido(uuid) from public, anon;
revoke all on function public.excluir_pre_venda(uuid, boolean) from public, anon;
grant execute on function public.excluir_pedido(uuid) to authenticated;
grant execute on function public.excluir_pre_venda(uuid, boolean) to authenticated;
