-- =============================================================================
-- PROMETHEUS CRM · FRETE DO LINK DA PRÉ-VENDA (CEPs VIP)
--
-- Regra do link público /p/{slug}:
--   • CEP de entrega na lista de CEPs VIP  → frete fixo (configuracoes.frete_vip_valor, R$ 15).
--   • CEP fora da lista                    → frete "a cotar": a equipe cota e envia ao
--                                            cliente pelo WhatsApp antes do fechamento.
-- A lista vem de uma planilha (XLS/XLSX/CSV) importada em Configurações → Frete VIP
-- e aceita CEPs avulsos e faixas (CEP inicial–final).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configurações
-- -----------------------------------------------------------------------------

alter table public.configuracoes
  add column frete_vip_valor         numeric(12, 2) not null default 15 check (frete_vip_valor >= 0),
  add column frete_vip_arquivo       text,
  add column frete_vip_importado_em  timestamptz,
  add column whatsapp_comprovante    text;

comment on column public.configuracoes.frete_vip_valor is 'Frete fixo cobrado no link da pré-venda quando o CEP está na lista de CEPs VIP.';
comment on column public.configuracoes.frete_vip_arquivo is 'Nome da última planilha de CEPs VIP importada.';
comment on column public.configuracoes.whatsapp_comprovante is 'WhatsApp que recebe os comprovantes de PIX (exibido no fim do link da pré-venda).';
comment on column public.pre_vendas.taxa_entrega is 'Padrão para pedidos manuais. Pedidos pelo link seguem a lista de CEPs VIP (configuracoes.frete_vip_valor).';

update public.configuracoes
set whatsapp_comprovante = '5511937099371'
where id = 1 and whatsapp_comprovante is null;

-- -----------------------------------------------------------------------------
-- Lista de CEPs VIP (cada linha é um CEP avulso — início = fim — ou uma faixa)
-- -----------------------------------------------------------------------------

create table public.ceps_frete_vip (
  id          bigint generated always as identity primary key,
  cep_inicio  text not null check (cep_inicio ~ '^[0-9]{8}$'),
  cep_fim     text not null check (cep_fim ~ '^[0-9]{8}$'),
  constraint ceps_frete_vip_faixa_valida check (cep_inicio <= cep_fim)
);

comment on table public.ceps_frete_vip is 'CEPs com frete fixo no link da pré-venda. CEP avulso: cep_inicio = cep_fim. Somente dígitos.';

create index ceps_frete_vip_faixa_idx on public.ceps_frete_vip (cep_inicio, cep_fim);

alter table public.ceps_frete_vip enable row level security;

create policy "Equipe gerencia os CEPs do frete VIP"
  on public.ceps_frete_vip for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

-- -----------------------------------------------------------------------------
-- Situação do frete no pedido
-- -----------------------------------------------------------------------------

create type public.situacao_frete as enum ('vip', 'a_cotar', 'cotado');

alter table public.pedidos add column frete public.situacao_frete;

comment on column public.pedidos.frete is 'Frete dos pedidos do link: vip (CEP na lista, valor fixo), a_cotar (aguardando a equipe) ou cotado. Nulo nos demais pedidos.';

create index pedidos_frete_a_cotar_idx on public.pedidos (criado_em) where frete = 'a_cotar' and status <> 'cancelado';

-- -----------------------------------------------------------------------------
-- Funções
-- -----------------------------------------------------------------------------

-- O CEP (com ou sem máscara) está na lista de CEPs VIP?
create or replace function public.cep_tem_frete_vip(p_cep text)
returns boolean
language sql
stable
set search_path = ''
as $$
  with v as (select regexp_replace(coalesce(p_cep, ''), '[^0-9]', '', 'g') as cep)
  select length(v.cep) = 8 and exists (
    select 1 from public.ceps_frete_vip f
    where f.cep_inicio <= v.cep and f.cep_fim >= v.cep
  )
  from v;
$$;

-- Quantidade de faixas, CEPs avulsos e total de CEPs cobertos pela lista.
create or replace function public.resumo_ceps_frete_vip()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'faixas',        count(*) filter (where f.cep_inicio <> f.cep_fim),
    'ceps_avulsos',  count(*) filter (where f.cep_inicio = f.cep_fim),
    'ceps_cobertos', coalesce(sum(f.cep_fim::integer - f.cep_inicio::integer + 1), 0)
  )
  from public.ceps_frete_vip f;
$$;

-- Substitui a lista inteira de uma vez (nova planilha importada).
--   p_faixas: [["01310100","01310100"], ["04000000","04999999"], ...]
create or replace function public.substituir_ceps_frete_vip(p_faixas jsonb, p_arquivo text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if p_faixas is null or jsonb_typeof(p_faixas) <> 'array' then
    raise exception 'Lista de CEPs inválida.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_faixas) > 200000 then
    raise exception 'A lista passou do limite de 200 mil CEPs/faixas.' using errcode = 'P0001';
  end if;

  delete from public.ceps_frete_vip where true;

  insert into public.ceps_frete_vip (cep_inicio, cep_fim)
  select e ->> 0, coalesce(e ->> 1, e ->> 0)
  from jsonb_array_elements(p_faixas) as e;

  update public.configuracoes
  set frete_vip_arquivo = nullif(trim(p_arquivo), ''),
      frete_vip_importado_em = now()
  where id = 1;

  return public.resumo_ceps_frete_vip();
end;
$$;

-- A equipe informa o frete de um pedido "a cotar" (ou corrige um frete).
create or replace function public.cotar_frete_pedido(p_pedido_id uuid, p_valor numeric)
returns public.pedidos
language plpgsql
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
begin
  if p_valor is null or p_valor < 0 then
    raise exception 'Informe o valor do frete.' using errcode = 'P0001';
  end if;

  update public.pedidos
  set taxa_entrega = round(p_valor, 2),
      frete = 'cotado'
  where id = p_pedido_id
  returning * into v_pedido;

  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;

  insert into public.atividades (cliente_id, pedido_id, tipo, descricao, dados)
  values (
    v_pedido.cliente_id, v_pedido.id, 'frete_cotado',
    format('Frete do pedido #%s: R$ %s', v_pedido.numero, replace(to_char(v_pedido.taxa_entrega, 'FM999999990.00'), '.', ',')),
    jsonb_build_object('valor', v_pedido.taxa_entrega)
  );

  return v_pedido;
end;
$$;

-- Pedido pelo link público: mesmas regras de antes + frete pela lista de CEPs VIP.
--   p_cliente: {whatsapp, nome, email, cep, logradouro, numero, complemento,
--               bairro, cidade, uf, referencia}
create or replace function public.registrar_pedido_pre_venda(
  p_slug                text,
  p_cliente             jsonb,
  p_itens               jsonb,
  p_atualizar_endereco  boolean default false,
  p_observacoes         text default null
)
returns public.pedidos
language plpgsql
set search_path = ''
as $$
declare
  v_pre_venda          public.pre_vendas;
  v_cliente            public.clientes;
  v_pedido             public.pedidos;
  v_whatsapp           text := public.normalizar_whatsapp(p_cliente ->> 'whatsapp');
  v_gravar_endereco    boolean;
  v_cep                text;
  v_frete_vip          boolean;
  v_valor_frete_vip    numeric;
begin
  select * into v_pre_venda from public.pre_vendas where slug = p_slug;
  if not found
     or v_pre_venda.status <> 'ativa'
     or (v_pre_venda.encerra_em is not null and v_pre_venda.encerra_em <= now()) then
    raise exception 'Esta pré-venda não está mais disponível.' using errcode = 'P0001';
  end if;

  if v_whatsapp is null or length(v_whatsapp) < 12 or length(v_whatsapp) > 15 then
    raise exception 'Informe um número de WhatsApp válido, com DDD.' using errcode = 'P0001';
  end if;

  select * into v_cliente from public.clientes where whatsapp = v_whatsapp for update;
  v_gravar_endereco := not found or p_atualizar_endereco or v_cliente.logradouro is null;

  if v_gravar_endereco and (
       coalesce(trim(p_cliente ->> 'logradouro'), '') = ''
    or coalesce(trim(p_cliente ->> 'numero'), '') = ''
    or coalesce(trim(p_cliente ->> 'bairro'), '') = ''
    or coalesce(trim(p_cliente ->> 'cidade'), '') = ''
    or coalesce(trim(p_cliente ->> 'uf'), '') = ''
  ) then
    raise exception 'Informe o endereço de entrega completo.' using errcode = 'P0001';
  end if;

  if v_cliente.id is null then
    if coalesce(trim(p_cliente ->> 'nome'), '') = '' then
      raise exception 'Informe seu nome.' using errcode = 'P0001';
    end if;

    insert into public.clientes (
      nome, whatsapp, email, cep, logradouro, numero, complemento,
      bairro, cidade, uf, referencia, origem, vip
    )
    values (
      trim(p_cliente ->> 'nome'), v_whatsapp, p_cliente ->> 'email',
      p_cliente ->> 'cep', p_cliente ->> 'logradouro', p_cliente ->> 'numero',
      nullif(trim(p_cliente ->> 'complemento'), ''), p_cliente ->> 'bairro',
      p_cliente ->> 'cidade', p_cliente ->> 'uf', nullif(trim(p_cliente ->> 'referencia'), ''),
      'pre_venda', v_pre_venda.canal = 'grupo_vip'
    )
    returning * into v_cliente;

    insert into public.atividades (cliente_id, tipo, descricao)
    values (v_cliente.id, 'cliente_criado',
            format('Cadastro feito pelo link da pré-venda "%s"', v_pre_venda.titulo));
  else
    if v_gravar_endereco then
      update public.clientes
      set cep = p_cliente ->> 'cep',
          logradouro = p_cliente ->> 'logradouro',
          numero = p_cliente ->> 'numero',
          complemento = nullif(trim(p_cliente ->> 'complemento'), ''),
          bairro = p_cliente ->> 'bairro',
          cidade = p_cliente ->> 'cidade',
          uf = p_cliente ->> 'uf',
          referencia = nullif(trim(p_cliente ->> 'referencia'), '')
      where id = v_cliente.id
      returning * into v_cliente;

      insert into public.atividades (cliente_id, tipo, descricao)
      values (v_cliente.id, 'endereco_atualizado', 'Endereço de entrega atualizado pelo link da pré-venda');
    end if;

    -- Quem compra pelo link do grupo VIP passa a ser VIP.
    if v_pre_venda.canal = 'grupo_vip' and not v_cliente.vip then
      update public.clientes set vip = true where id = v_cliente.id;
    end if;
  end if;

  -- Frete: CEP na lista VIP → valor fixo; fora da lista → a cotar (R$ 0 até a equipe cotar).
  v_cep := regexp_replace(coalesce(v_cliente.cep, ''), '[^0-9]', '', 'g');
  v_frete_vip := public.cep_tem_frete_vip(v_cep);
  select coalesce(c.frete_vip_valor, 0) into v_valor_frete_vip from public.configuracoes c where c.id = 1;

  v_pedido := public.criar_pedido(
    p_cliente_id   => v_cliente.id,
    p_itens        => p_itens,
    p_pre_venda_id => v_pre_venda.id,
    p_origem       => 'link',
    p_observacoes  => p_observacoes,
    p_taxa_entrega => case when v_frete_vip then coalesce(v_valor_frete_vip, 0) else 0 end
  );

  update public.pedidos
  set frete = (case when v_frete_vip then 'vip' else 'a_cotar' end)::public.situacao_frete
  where id = v_pedido.id
  returning * into v_pedido;

  if not v_frete_vip then
    insert into public.atividades (cliente_id, pedido_id, tipo, descricao, dados)
    values (
      v_cliente.id, v_pedido.id, 'frete_a_cotar',
      format('Pedido #%s: frete a cotar (CEP %s fora da lista VIP)', v_pedido.numero,
             case when length(v_cep) = 8 then substr(v_cep, 1, 5) || '-' || substr(v_cep, 6) else 'não informado' end),
      jsonb_build_object('cep', v_cep)
    );
  end if;

  return v_pedido;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on public.ceps_frete_vip to authenticated, service_role;
grant usage, select on sequence public.ceps_frete_vip_id_seq to authenticated, service_role;

revoke all on function public.cep_tem_frete_vip(text) from public, anon;
revoke all on function public.resumo_ceps_frete_vip() from public, anon;
revoke all on function public.substituir_ceps_frete_vip(jsonb, text) from public, anon;
revoke all on function public.cotar_frete_pedido(uuid, numeric) from public, anon;

grant execute on function public.cep_tem_frete_vip(text) to authenticated, service_role;
grant execute on function public.resumo_ceps_frete_vip() to authenticated, service_role;
grant execute on function public.substituir_ceps_frete_vip(jsonb, text) to authenticated;
grant execute on function public.cotar_frete_pedido(uuid, numeric) to authenticated;
