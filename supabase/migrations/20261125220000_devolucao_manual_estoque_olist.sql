-- =============================================================================
-- PROMETHEUS CRM · DEVOLUÇÃO MANUAL DO ESTOQUE DA OLIST (botão na pré-venda)
--
-- A equipe devolve à Olist, de uma vez, todas as unidades que uma pré-venda baixou lá.
--   • Pedidos, Caixas VIP e cobranças continuam como estão; o link também (aberto segue
--     vendendo, e as vendas novas baixam normalmente).
--   • Unidades devolvidas à mão saem da conta da Olist PARA SEMPRE: cancelar, excluir ou
--     reabrir esses pedidos depois não devolve nem baixa de novo (nada em dobro).
--   • Na Olist, o lançamento diz que foi DEVOLUÇÃO MANUAL, de qual pré-venda, quem fez e quando.
--     Ele vai sozinho, nunca somado a baixas/devoluções automáticas do mesmo produto.
--   • Toda a equipe pode usar (a tela pede confirmação antes).
-- =============================================================================

-- Item: unidades já devolvidas à mão (em unidades do produto do CRM; kit = kits).
alter table public.pedido_itens
  add column estoque_olist_devolvido integer not null default 0
    constraint pedido_itens_estoque_olist_devolvido_check check (estoque_olist_devolvido >= 0);

comment on column public.pedido_itens.estoque_olist_devolvido is 'Unidades deste item devolvidas à Olist pelo botão da pré-venda. Não voltam a baixar nem a devolver estoque lá.';

-- Movimento: texto fixo do lançamento na Olist (devolução manual).
alter table public.movimentos_estoque_olist
  add column observacao text;

comment on column public.movimentos_estoque_olist.observacao is 'Texto do lançamento na Olist quando não é automático (devolução manual). Movimentos com texto são enviados sem somar com os automáticos.';

-- Pré-venda: última devolução manual (aparece na tela).
alter table public.pre_vendas
  add column estoque_olist_devolvido_em  timestamptz,
  add column estoque_olist_devolvido_por uuid references public.perfis (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Ajuste por item: desconta o que já foi devolvido à mão e grava o texto manual
-- (mesma assinatura e mesmo comportamento de antes para tudo que é automático)
-- -----------------------------------------------------------------------------

create or replace function public.ajustar_estoque_olist_item(
  p_item_id     uuid,
  p_produto_id  uuid,
  p_quantidade  integer,
  p_pedido_id   uuid,
  p_motivo      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero     bigint;
  v_comp       record;
  v_mov        record;
  v_resto      integer;
  v_devolvido  integer;
  v_alvo       integer;
  -- Preenchido só pela devolução manual (devolver_estoque_olist_pre_venda).
  v_obs        text := nullif(current_setting('prometheus.observacao_estoque', true), '');
begin
  select pe.numero into v_numero from public.pedidos pe where pe.id = p_pedido_id;

  -- Unidades devolvidas à mão não contam mais: nem baixam de novo, nem devolvem em dobro.
  select i.estoque_olist_devolvido into v_devolvido from public.pedido_itens i where i.id = p_item_id;
  v_alvo := greatest(coalesce(p_quantidade, 0) - coalesce(v_devolvido, 0), 0);

  for v_comp in
    with alvo as (
      select c.olist_id, (c.quantidade * v_alvo)::integer as quantidade
      from public.componentes_olist(p_produto_id) c
      where v_alvo > 0
    ),
    lancado as (
      select m.olist_produto_id as olist_id,
             sum(case m.tipo when 'S' then m.quantidade else -m.quantidade end)::integer as quantidade
      from public.movimentos_estoque_olist m
      where m.pedido_item_id = p_item_id and m.status <> 'cancelado'
      group by 1
    )
    select coalesce(a.olist_id, l.olist_id) as olist_id,
           coalesce(a.quantidade, 0) - coalesce(l.quantidade, 0) as diferenca
    from alvo a
    full join lancado l on l.olist_id = a.olist_id
    order by 1
  loop
    continue when v_comp.diferenca = 0;
    v_resto := abs(v_comp.diferenca);

    -- Lançamento contrário que ainda não chegou à Olist é anulado em vez de gerar outro.
    -- Ajuste automático nunca mexe numa devolução manual (o registro dela fica como foi feito).
    for v_mov in
      select m.id, m.quantidade
      from public.movimentos_estoque_olist m
      where m.pedido_item_id = p_item_id
        and m.olist_produto_id = v_comp.olist_id
        and m.tipo = case when v_comp.diferenca > 0 then 'E' else 'S' end
        and m.status in ('pendente', 'erro')
        and (v_obs is not null or m.observacao is null)
      order by m.id desc
      for update skip locked
    loop
      exit when v_resto = 0;
      if v_mov.quantidade <= v_resto then
        update public.movimentos_estoque_olist set status = 'cancelado' where id = v_mov.id;
        v_resto := v_resto - v_mov.quantidade;
      else
        update public.movimentos_estoque_olist set quantidade = quantidade - v_resto where id = v_mov.id;
        v_resto := 0;
      end if;
    end loop;

    if v_resto > 0 then
      insert into public.movimentos_estoque_olist (
        olist_produto_id, produto_id, pedido_id, pedido_item_id, pedido_numero, tipo, quantidade, motivo, observacao
      )
      values (
        v_comp.olist_id, p_produto_id, p_pedido_id, p_item_id, v_numero,
        case when v_comp.diferenca > 0 then 'S' else 'E' end,
        v_resto,
        p_motivo,
        v_obs
      );
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Quanto a pré-venda tem baixado na Olist agora (o que o botão devolveria)
-- -----------------------------------------------------------------------------

create or replace function public.estoque_olist_baixado_pre_venda(p_pre_venda_id uuid)
returns table (olist_id bigint, nome text, unidades integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.eh_membro_equipe() then
    raise exception 'Apenas a equipe consulta o estoque da Olist.' using errcode = '42501';
  end if;
  return query
    select m.olist_produto_id,
           coalesce(max(e.nome), max(p.nome), 'Produto ' || m.olist_produto_id)::text,
           sum(case m.tipo when 'S' then m.quantidade else -m.quantidade end)::integer
    from public.movimentos_estoque_olist m
    join public.pedido_itens i on i.id = m.pedido_item_id
    left join public.estoque_olist e on e.id = m.olist_produto_id
    left join public.produtos p on p.id = m.produto_id
    where i.pre_venda_id = p_pre_venda_id
      and m.status <> 'cancelado'
    group by m.olist_produto_id
    having sum(case m.tipo when 'S' then m.quantidade else -m.quantidade end) > 0
    order by 2;
end;
$$;

-- -----------------------------------------------------------------------------
-- O botão: devolve tudo o que a pré-venda baixou na Olist
-- -----------------------------------------------------------------------------

create or replace function public.devolver_estoque_olist_pre_venda(p_pre_venda_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo    text;
  v_usuario   uuid := auth.uid();
  v_nome      text;
  v_obs       text;
  v_item      record;
  v_lancado   integer;
  v_unidades  integer := 0;
  v_pedidos   uuid[] := '{}';
begin
  if not public.eh_membro_equipe() then
    raise exception 'Apenas a equipe devolve estoque à Olist.' using errcode = '42501';
  end if;

  select pv.titulo into v_titulo from public.pre_vendas pv where pv.id = p_pre_venda_id;
  if not found then
    raise exception 'Pré-venda não encontrada.' using errcode = 'P0001';
  end if;
  select pf.nome into v_nome from public.perfis pf where pf.id = v_usuario;

  -- Texto do lançamento na Olist (a fila acrescenta " · ref xxxxxxxx"; a Olist aceita 250).
  v_obs := left(format(
    'Prometheus CRM · DEVOLUÇÃO MANUAL pelo botão da pré-venda (não foi venda nem devolução automática) · por %s em %s · pré-venda "%s"',
    coalesce(nullif(trim(v_nome), ''), 'equipe'),
    to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    v_titulo
  ), 230);

  -- Mesma ordem de travas da compra no link: estoque dos produtos primeiro, depois os itens.
  perform public.travar_estoque_olist(array(
    select distinct i.produto_id from public.pedido_itens i
    where i.pre_venda_id = p_pre_venda_id and i.produto_id is not null
  ));

  perform set_config('prometheus.observacao_estoque', v_obs, true);

  for v_item in
    select i.id, i.produto_id, i.quantidade, i.pedido_id
    from public.pedido_itens i
    where i.pre_venda_id = p_pre_venda_id
      and i.produto_id is not null
    order by i.id
    for update of i
  loop
    select coalesce(sum(case m.tipo when 'S' then m.quantidade else -m.quantidade end), 0)::integer
      into v_lancado
    from public.movimentos_estoque_olist m
    where m.pedido_item_id = v_item.id and m.status <> 'cancelado';

    continue when v_lancado <= 0;

    -- Tudo o que o item tem hoje sai da conta da Olist; o ajuste então devolve o lançado
    -- (baixa que ainda não chegou à Olist é só anulada: lá nunca saiu).
    update public.pedido_itens
    set estoque_olist_devolvido = greatest(estoque_olist_devolvido, quantidade)
    where id = v_item.id;

    perform public.ajustar_estoque_olist_item(v_item.id, v_item.produto_id, v_item.quantidade, v_item.pedido_id, 'devolucao_manual');

    v_unidades := v_unidades + v_lancado;
    if not v_item.pedido_id = any (v_pedidos) then
      v_pedidos := v_pedidos || v_item.pedido_id;
    end if;
  end loop;

  perform set_config('prometheus.observacao_estoque', '', true);

  if v_unidades = 0 then
    return jsonb_build_object('unidades', 0, 'pedidos', 0);
  end if;

  update public.pre_vendas
  set estoque_olist_devolvido_em = now(), estoque_olist_devolvido_por = v_usuario
  where id = p_pre_venda_id;

  -- Histórico de cada pedido no CRM.
  insert into public.atividades (cliente_id, pedido_id, autor_id, tipo, descricao)
  select pe.cliente_id, pe.id, v_usuario, 'estoque_olist_devolvido',
         format('Estoque da pré-venda "%s" devolvido à Olist manualmente por %s (pedido #%s)', v_titulo, coalesce(nullif(trim(v_nome), ''), 'equipe'), pe.numero)
  from public.pedidos pe
  where pe.id = any (v_pedidos);

  return jsonb_build_object('unidades', v_unidades, 'pedidos', coalesce(array_length(v_pedidos, 1), 0));
end;
$$;

revoke execute on function
  public.estoque_olist_baixado_pre_venda(uuid),
  public.devolver_estoque_olist_pre_venda(uuid)
from public, anon;

grant execute on function
  public.estoque_olist_baixado_pre_venda(uuid),
  public.devolver_estoque_olist_pre_venda(uuid)
to authenticated, service_role;
