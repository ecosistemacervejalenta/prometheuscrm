-- =============================================================================
-- Histórico do cliente para sempre
--
-- Pedido do dono da loja (2026-11-19): tudo o que o cliente comprou e pagou fica no CRM
-- para sempre, mesmo que a pré-venda seja excluída.
--   • Excluir uma pré-venda NÃO apaga mais os pedidos: eles continuam no cliente, no
--     faturamento e nas Caixas VIP. Só o link e a página da pré-venda deixam de existir.
--     (Para tirar um pedido de teste, exclua o próprio pedido.)
--   • pedido_itens.pre_venda_titulo guarda o nome da pré-venda de cada item, para o
--     histórico continuar dizendo de onde veio a cerveja depois que a pré-venda some.
-- =============================================================================

alter table public.pedido_itens add column pre_venda_titulo text;
comment on column public.pedido_itens.pre_venda_titulo is
  'Nome da pré-venda de origem, guardado no item: continua no histórico mesmo depois que a pré-venda é excluída.';

update public.pedido_itens i
set pre_venda_titulo = pv.titulo
from public.pre_vendas pv
where pv.id = i.pre_venda_id and i.pre_venda_titulo is null;

-- Item sem pré-venda informada herda a do pedido (pedido manual, API, Shopify),
-- e o nome da pré-venda é guardado junto.
create or replace function public.definir_pre_venda_do_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.pre_venda_id is null then
    select pe.pre_venda_id into new.pre_venda_id from public.pedidos pe where pe.id = new.pedido_id;
  end if;
  -- Ao excluir a pré-venda, o pre_venda_id vira null e o nome guardado fica.
  if new.pre_venda_id is not null and (tg_op = 'INSERT' or new.pre_venda_id is distinct from old.pre_venda_id) then
    select pv.titulo into new.pre_venda_titulo from public.pre_vendas pv where pv.id = new.pre_venda_id;
  end if;
  return new;
end;
$$;

drop trigger pedido_itens_definir_pre_venda on public.pedido_itens;
create trigger pedido_itens_definir_pre_venda
  before insert or update of pre_venda_id on public.pedido_itens
  for each row execute function public.definir_pre_venda_do_item();

-- Enquanto a pré-venda existe, as telas mostram o nome atual dela (se for renomeada);
-- o nome guardado no item só aparece depois que ela é excluída.

-- -----------------------------------------------------------------------------
-- Excluir pré-venda: os pedidos ficam
-- -----------------------------------------------------------------------------
-- p_com_pedidos continua na assinatura só para compatibilidade (não apaga mais nada).
-- Devolve quantos pedidos continuam no histórico.
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

  with afetados as (
    select distinct pe.id, pe.cliente_id, pe.numero
    from public.pedidos pe
    where pe.pre_venda_id = p_pre_venda_id
       or exists (select 1 from public.pedido_itens i where i.pedido_id = pe.id and i.pre_venda_id = p_pre_venda_id)
  )
  insert into public.atividades (cliente_id, pedido_id, tipo, descricao)
  select cliente_id, id, 'pre_venda_excluida',
         format('Pré-venda "%s" excluída — o pedido #%s continua no histórico', v_titulo, numero)
  from afetados;
  get diagnostics v_pedidos = row_count;

  -- pedidos.pre_venda_id e pedido_itens.pre_venda_id viram null (on delete set null);
  -- o nome fica em pedido_itens.pre_venda_titulo (garantido aqui também para itens antigos).
  update public.pedido_itens set pre_venda_titulo = v_titulo
  where pre_venda_id = p_pre_venda_id and pre_venda_titulo is null;
  delete from public.pre_vendas where id = p_pre_venda_id;
  return v_pedidos;
end;
$$;
