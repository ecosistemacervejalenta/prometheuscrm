-- =============================================================================
-- Lotes e validades: baixa automática pelo lote que vence primeiro
--
-- Pedido do dono da loja (2026-11-25): a quantidade de cada lote acompanha sozinha o estoque
-- da Olist, sem se perder e sem inventar números. A Olist é a fonte da verdade do total:
--
--   • Regra que vale sempre: soma dos lotes ≤ estoque da Olist. O que sobra são "unidades sem
--     lote" (entraram na Olist e ninguém disse ainda de que lote são).
--   • Estoque caiu (venda, perda, ajuste na Olist) e a soma dos lotes passou do estoque: a
--     diferença sai do lote que vence primeiro (depois do seguinte, se ele zerar).
--   • Estoque subiu: o CRM NÃO põe essas unidades em lote nenhum. Elas ficam "sem lote" e a
--     equipe recebe um aviso no sino para cadastrar o lote.
--   • A conta é sempre feita com o total absoluto da Olist (não com a diferença entre duas
--     leituras): se uma leitura falhar ou atrasar, a próxima acerta tudo de uma vez.
--   • Tudo fica registrado em lote_movimentos (cadastro, ajuste, baixa pela Olist, exclusão).
--   • Nada vai para a Olist: aqui o CRM só lê.
-- =============================================================================

-- Lotes antigos sem quantidade (lote único que seguia o estoque): passam a ter a quantidade
-- gravada. Com um lote só, ele recebe o estoque da Olist; com vários, o lote sem quantidade
-- recebe o que sobra (só quando há exatamente um assim).
update public.lotes l
set quantidade = greatest(floor(c.estoque_olist)::integer - coalesce((
      select sum(o.quantidade) from public.lotes o where o.cerveja_id = l.cerveja_id and o.id <> l.id
    ), 0), 0)
from public.lotes_cervejas c
where c.id = l.cerveja_id
  and l.quantidade is null
  and c.estoque_olist is not null
  and (select count(*) from public.lotes n where n.cerveja_id = l.cerveja_id and n.quantidade is null) = 1;

comment on column public.lotes.quantidade is
  'Unidades deste lote. Baixa sozinha quando o estoque da Olist cai (lote que vence primeiro). Nulo só quando a Olist não informa o estoque e ninguém digitou.';

-- Releitura pedida (aviso da Olist): a rotina lê esta cerveja antes das outras.
alter table public.lotes_cervejas add column releitura_pedida_em timestamptz;
comment on column public.lotes_cervejas.releitura_pedida_em is
  'A Olist avisou que o estoque mudou: a rotina relê esta cerveja na próxima rodada (até 5 min).';

-- Histórico ---------------------------------------------------------------------------------

create table public.lote_movimentos (
  id              bigint generated always as identity primary key,
  cerveja_id      uuid not null references public.lotes_cervejas (id) on delete cascade,
  lote_id         uuid references public.lotes (id) on delete set null,
  lote            text not null,
  tipo            text not null,
  quantidade      integer not null,
  saldo           integer,
  estoque_antes   numeric(12, 2),
  estoque_depois  numeric(12, 2),
  autor_id        uuid references public.perfis (id) on delete set null,
  criado_em       timestamptz not null default now(),
  constraint lote_movimentos_tipo_check check (tipo in ('cadastro', 'ajuste', 'baixa_olist', 'exclusao'))
);

comment on table public.lote_movimentos is 'Histórico da quantidade de cada lote: cadastro, ajuste da equipe, baixa automática pela Olist e exclusão.';
comment on column public.lote_movimentos.quantidade is 'Variação no lote (+ entrou, − saiu).';
comment on column public.lote_movimentos.saldo is 'Quantidade do lote depois do movimento.';
comment on column public.lote_movimentos.estoque_antes is 'Baixa pela Olist: estoque da leitura anterior.';
comment on column public.lote_movimentos.estoque_depois is 'Baixa pela Olist: estoque da leitura que gerou a baixa.';

create index lote_movimentos_cerveja_idx on public.lote_movimentos (cerveja_id, criado_em desc);

-- Cadastro, ajuste e exclusão feitos pela equipe (a baixa automática registra a própria linha).
create or replace function public.registrar_movimento_lote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('lotes.baixa_olist', true) = 'on' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.lote_movimentos (cerveja_id, lote_id, lote, tipo, quantidade, saldo, autor_id)
    values (new.cerveja_id, new.id, new.lote, 'cadastro', coalesce(new.quantidade, 0), new.quantidade, auth.uid());
  elsif tg_op = 'UPDATE' then
    if new.quantidade is distinct from old.quantidade then
      insert into public.lote_movimentos (cerveja_id, lote_id, lote, tipo, quantidade, saldo, autor_id)
      values (new.cerveja_id, new.id, new.lote, 'ajuste', coalesce(new.quantidade, 0) - coalesce(old.quantidade, 0), new.quantidade, auth.uid());
    end if;
  elsif exists (select 1 from public.lotes_cervejas c where c.id = old.cerveja_id) then
    -- (cerveja sendo removida do controle: o histórico vai junto, nada a registrar)
    insert into public.lote_movimentos (cerveja_id, lote_id, lote, tipo, quantidade, saldo, autor_id)
    values (old.cerveja_id, null, old.lote, 'exclusao', -coalesce(old.quantidade, 0), 0, auth.uid());
  end if;
  return null;
end;
$$;

create trigger lotes_registrar_movimento
  after insert or update or delete on public.lotes
  for each row execute function public.registrar_movimento_lote();

-- Avisos no sino -----------------------------------------------------------------------------

alter table public.notificacoes add column lote_cerveja_id uuid references public.lotes_cervejas (id) on delete cascade;
comment on column public.notificacoes.lote_cerveja_id is 'Cerveja do módulo Lotes e validades (entrou mercadoria sem lote): abre direto a cerveja.';

alter table public.notificacoes drop constraint notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check (tipo in (
  'tarefa_atribuida', 'tarefa_comentario', 'tarefa_impedida', 'tarefa_desimpedida', 'tarefa_prazo', 'tarefa_concluida',
  'whatsapp_mensagem', 'atendimento_transferido', 'pix_recebido', 'estoque_olist', 'caixa_vencida', 'campanha_aprovada',
  'lote_sem_registro'
));

-- Um aviso por cerveja e pessoa: enquanto não for lido, é atualizado em vez de repetido.
create or replace function public.avisar_lote_sem_registro(p_cerveja_id uuid, p_nome text, p_unidades integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text := 'Entrou mercadoria: cadastre o lote';
  v_texto  text := left(format('%s: %s un. na Olist ainda sem lote.', p_nome, p_unidades), 300);
begin
  update public.notificacoes n
  set titulo = v_titulo, texto = v_texto, quantidade = n.quantidade + 1, criado_em = now()
  where n.tipo = 'lote_sem_registro' and n.lote_cerveja_id = p_cerveja_id and n.lida_em is null;

  insert into public.notificacoes (perfil_id, tipo, lote_cerveja_id, titulo, texto)
  select p.id, 'lote_sem_registro', p_cerveja_id, v_titulo, v_texto
  from public.perfis p
  where p.ativo
    and not exists (
      select 1 from public.notificacoes n
      where n.perfil_id = p.id and n.tipo = 'lote_sem_registro' and n.lote_cerveja_id = p_cerveja_id and n.lida_em is null
    );
end;
$$;

-- Conciliação --------------------------------------------------------------------------------

/**
 * Deixa os lotes da cerveja de acordo com o estoque atual da Olist. Devolve as unidades sem
 * lote (null se não dá para saber: estoque não informado ou lote sem quantidade).
 * p_estoque_antes: estoque da leitura anterior (só para o histórico e o aviso).
 */
create or replace function public.conciliar_lotes_da_cerveja(p_cerveja_id uuid, p_estoque_antes numeric default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cerveja  public.lotes_cervejas;
  v_estoque  integer;
  v_soma     integer;
  v_excesso  integer;
  v_tira     integer;
  v_lote     record;
begin
  -- Trava a cerveja: leitura da Olist e cadastro de lote não se cruzam no meio da conta.
  select * into v_cerveja from public.lotes_cervejas where id = p_cerveja_id for update;
  if not found or v_cerveja.estoque_olist is null then
    return null;
  end if;
  if exists (select 1 from public.lotes where cerveja_id = p_cerveja_id and quantidade is null) then
    return null;
  end if;

  v_estoque := greatest(floor(v_cerveja.estoque_olist)::integer, 0);
  select coalesce(sum(quantidade), 0) into v_soma from public.lotes where cerveja_id = p_cerveja_id;
  v_excesso := v_soma - v_estoque;

  if v_excesso > 0 then
    perform set_config('lotes.baixa_olist', 'on', true);
    for v_lote in
      select id, lote, quantidade from public.lotes
      where cerveja_id = p_cerveja_id and quantidade > 0
      order by validade, criado_em, lote
      for update
    loop
      exit when v_excesso <= 0;
      v_tira := least(v_lote.quantidade, v_excesso);
      update public.lotes set quantidade = quantidade - v_tira where id = v_lote.id;
      insert into public.lote_movimentos (cerveja_id, lote_id, lote, tipo, quantidade, saldo, estoque_antes, estoque_depois)
      values (p_cerveja_id, v_lote.id, v_lote.lote, 'baixa_olist', -v_tira, v_lote.quantidade - v_tira, p_estoque_antes, v_cerveja.estoque_olist);
      v_excesso := v_excesso - v_tira;
    end loop;
    perform set_config('lotes.baixa_olist', '', true);
    return 0;
  end if;

  -- Entrou mercadoria (o estoque subiu) e ficou unidade sem lote: avisa a equipe.
  if v_excesso < 0 and p_estoque_antes is not null and v_cerveja.estoque_olist > p_estoque_antes
     and exists (select 1 from public.lotes where cerveja_id = p_cerveja_id) then
    perform public.avisar_lote_sem_registro(p_cerveja_id, v_cerveja.nome, -v_excesso);
  end if;
  return -v_excesso;
end;
$$;

-- Toda leitura nova da Olist (rotina, botão, aviso da Olist ou cadastro) passa por aqui.
create or replace function public.conciliar_lotes_ao_ler_estoque()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.conciliar_lotes_da_cerveja(new.id, old.estoque_olist);
  return null;
end;
$$;

create trigger lotes_cervejas_conciliar
  after update of estoque_olist on public.lotes_cervejas
  for each row
  when (old.estoque_olist is distinct from new.estoque_olist)
  execute function public.conciliar_lotes_ao_ler_estoque();

/** Para a tela: confere os lotes da cerveja de novo depois de salvar (equipe). */
create or replace function public.conciliar_lotes(p_cerveja_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_membro_equipe() then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  return public.conciliar_lotes_da_cerveja(p_cerveja_id);
end;
$$;

-- Segurança ----------------------------------------------------------------------------------

alter table public.lote_movimentos enable row level security;

create policy "Equipe vê o histórico dos lotes"
  on public.lote_movimentos for select to authenticated
  using ((select public.eh_membro_equipe()));

-- O histórico nasce no banco: a equipe só lê.
revoke all on public.lote_movimentos from anon, authenticated;
grant select on public.lote_movimentos to authenticated;
grant select, insert, update, delete on public.lote_movimentos to service_role;

revoke all on function public.registrar_movimento_lote(), public.avisar_lote_sem_registro(uuid, text, integer),
  public.conciliar_lotes_da_cerveja(uuid, numeric), public.conciliar_lotes_ao_ler_estoque(), public.conciliar_lotes(uuid)
  from public, anon, authenticated;
grant execute on function public.conciliar_lotes(uuid) to authenticated, service_role;
grant execute on function public.conciliar_lotes_da_cerveja(uuid, numeric) to service_role;
