-- =============================================================================
-- Privacidade (LGPD)
--
-- Pedido do dono da loja (2026-11-25): no link da pré-venda, quem digitava o WhatsApp de
-- outra pessoa do Grupo VIP via o cadastro dela, mexia na Caixa VIP e podia trocar o
-- endereço de entrega. Agora:
--   • O link manda um código de 6 dígitos no WhatsApp digitado. Só depois de confirmar o
--     código o link mostra o cadastro e a caixa, e só assim a compra é aceita.
--   • O aparelho confirmado fica lembrado por 90 dias (cookie com um token aleatório; aqui
--     fica só o hash dele). Em outro aparelho, pede o código de novo.
--   • Botão "Anonimizar dados (LGPD)" na ficha do cliente (só admin): atende o pedido de
--     exclusão do titular sem perder o histórico de vendas (valores ficam, dados pessoais saem).
--
-- As tabelas novas não têm política de RLS: só o servidor (chave secreta) lê e grava.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Códigos de confirmação do WhatsApp
-- -----------------------------------------------------------------------------
create table public.link_codigos (
  id            uuid primary key default gen_random_uuid(),
  whatsapp      text not null,
  -- HMAC do código (nunca o código em si).
  codigo_hash   text not null,
  -- HMAC do IP de quem pediu (só para limitar pedidos em massa).
  ip_hash       text,
  tentativas    smallint not null default 0,
  criado_em     timestamptz not null default now(),
  expira_em     timestamptz not null,
  confirmado_em timestamptz
);
comment on table public.link_codigos is
  'Códigos de 6 dígitos enviados no WhatsApp para confirmar o número no link da pré-venda (apagados depois de 1 dia).';

create index link_codigos_whatsapp_idx on public.link_codigos (whatsapp, criado_em desc);
create index link_codigos_ip_idx on public.link_codigos (ip_hash, criado_em desc) where ip_hash is not null;

-- -----------------------------------------------------------------------------
-- 2. Aparelhos confirmados (sessões do link)
-- -----------------------------------------------------------------------------
create table public.link_sessoes (
  id          uuid primary key default gen_random_uuid(),
  -- SHA-256 do token guardado no cookie do aparelho.
  token_hash  text not null unique,
  whatsapp    text not null,
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz not null,
  usado_em    timestamptz not null default now()
);
comment on table public.link_sessoes is
  'Aparelhos que confirmaram o WhatsApp no link da pré-venda (lembrados por 90 dias).';

create index link_sessoes_whatsapp_idx on public.link_sessoes (whatsapp);

alter table public.link_codigos enable row level security;
alter table public.link_sessoes enable row level security;
revoke all on table public.link_codigos from anon, authenticated;
revoke all on table public.link_sessoes from anon, authenticated;
grant select, insert, update, delete on table public.link_codigos to service_role;
grant select, insert, update, delete on table public.link_sessoes to service_role;

-- -----------------------------------------------------------------------------
-- 3. Pedir um código
--    Limites: 1 código a cada 45 s e 3 por hora para o mesmo número; 10 por hora para o
--    mesmo IP (evita usar o WhatsApp da loja para mandar código para muita gente).
--    Devolve {ok, id} ou {ok:false, motivo, segundos}.
-- -----------------------------------------------------------------------------
create or replace function public.emitir_codigo_link(p_whatsapp text, p_codigo_hash text, p_ip_hash text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_whatsapp  text := public.normalizar_whatsapp(p_whatsapp);
  v_ultimo    timestamptz;
  v_na_hora   integer;
  v_mais_velho timestamptz;
  v_id        uuid;
begin
  if v_whatsapp is null or length(v_whatsapp) < 12 or length(v_whatsapp) > 15 then
    raise exception 'Informe um número de WhatsApp válido, com DDD.' using errcode = 'P0001';
  end if;

  -- Uma chamada por vez para o mesmo número.
  perform pg_advisory_xact_lock(hashtext('link_codigo:' || v_whatsapp));

  -- Limpeza: códigos com mais de 1 dia e aparelhos vencidos.
  delete from public.link_codigos where criado_em < now() - interval '1 day';
  delete from public.link_sessoes where expira_em < now();

  select max(criado_em), count(*), min(criado_em)
  into v_ultimo, v_na_hora, v_mais_velho
  from public.link_codigos
  where whatsapp = v_whatsapp and criado_em > now() - interval '1 hour';

  if v_ultimo is not null and v_ultimo > now() - interval '45 seconds' then
    return jsonb_build_object('ok', false, 'motivo', 'aguarde',
      'segundos', ceil(extract(epoch from (v_ultimo + interval '45 seconds' - now())))::int);
  end if;

  if v_na_hora >= 3 then
    return jsonb_build_object('ok', false, 'motivo', 'limite',
      'segundos', ceil(extract(epoch from (v_mais_velho + interval '1 hour' - now())))::int);
  end if;

  if p_ip_hash is not null and (
    select count(*) from public.link_codigos
    where ip_hash = p_ip_hash and criado_em > now() - interval '1 hour'
  ) >= 10 then
    return jsonb_build_object('ok', false, 'motivo', 'limite', 'segundos', 3600);
  end if;

  -- Vale só o código mais novo.
  update public.link_codigos
  set expira_em = now()
  where whatsapp = v_whatsapp and confirmado_em is null and expira_em > now();

  insert into public.link_codigos (whatsapp, codigo_hash, ip_hash, expira_em)
  values (v_whatsapp, p_codigo_hash, p_ip_hash, now() + interval '10 minutes')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- O envio pelo WhatsApp falhou: o código não conta no limite.
create or replace function public.descartar_codigo_link(p_id uuid)
returns void
language sql
set search_path = ''
as $$
  delete from public.link_codigos where id = p_id and confirmado_em is null;
$$;

-- -----------------------------------------------------------------------------
-- 4. Conferir o código. Certo → registra o aparelho (token do cookie) e devolve {ok:true}.
--    Até 5 tentativas por código; depois é preciso pedir outro.
-- -----------------------------------------------------------------------------
create or replace function public.conferir_codigo_link(
  p_whatsapp     text,
  p_codigo_hash  text,
  p_token_hash   text,
  p_dias         integer default 90
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_whatsapp text := public.normalizar_whatsapp(p_whatsapp);
  v_codigo   public.link_codigos;
begin
  select * into v_codigo
  from public.link_codigos
  where whatsapp = v_whatsapp and confirmado_em is null and expira_em > now()
  order by criado_em desc
  limit 1
  for update;

  if v_codigo.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'expirado');
  end if;
  if v_codigo.tentativas >= 5 then
    return jsonb_build_object('ok', false, 'motivo', 'tentativas');
  end if;

  update public.link_codigos set tentativas = tentativas + 1 where id = v_codigo.id;

  if v_codigo.codigo_hash <> p_codigo_hash then
    return jsonb_build_object('ok', false, 'motivo', 'errado', 'restantes', 4 - v_codigo.tentativas);
  end if;

  update public.link_codigos set confirmado_em = now() where id = v_codigo.id;
  insert into public.link_sessoes (token_hash, whatsapp, expira_em)
  values (p_token_hash, v_whatsapp, now() + make_interval(days => greatest(p_dias, 1)));

  return jsonb_build_object('ok', true);
end;
$$;

-- WhatsApp confirmado neste aparelho (null = aparelho não confirmado ou vencido).
create or replace function public.whatsapp_da_sessao_link(p_token_hash text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_whatsapp text;
begin
  update public.link_sessoes
  set usado_em = now()
  where token_hash = p_token_hash and expira_em > now()
  returning whatsapp into v_whatsapp;
  return v_whatsapp;
end;
$$;

-- "Não sou eu" / trocar de número: o aparelho deixa de ser confirmado.
create or replace function public.encerrar_sessao_link(p_token_hash text)
returns void
language sql
set search_path = ''
as $$
  delete from public.link_sessoes where token_hash = p_token_hash;
$$;

-- Dono da caixa (fechar a caixa pelo link exige o aparelho confirmado do mesmo WhatsApp).
create or replace function public.whatsapp_do_pedido(p_pedido_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select c.whatsapp from public.pedidos pe join public.clientes c on c.id = pe.cliente_id where pe.id = p_pedido_id;
$$;

revoke all on function public.emitir_codigo_link(text, text, text) from public, anon, authenticated;
revoke all on function public.descartar_codigo_link(uuid) from public, anon, authenticated;
revoke all on function public.conferir_codigo_link(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.whatsapp_da_sessao_link(text) from public, anon, authenticated;
revoke all on function public.encerrar_sessao_link(text) from public, anon, authenticated;
revoke all on function public.whatsapp_do_pedido(uuid) from public, anon, authenticated;
grant execute on function public.emitir_codigo_link(text, text, text) to service_role;
grant execute on function public.descartar_codigo_link(uuid) to service_role;
grant execute on function public.conferir_codigo_link(text, text, text, integer) to service_role;
grant execute on function public.whatsapp_da_sessao_link(text) to service_role;
grant execute on function public.encerrar_sessao_link(text) to service_role;
grant execute on function public.whatsapp_do_pedido(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Anonimizar cliente (pedido de exclusão do titular — LGPD art. 18)
--
--    Sai: nome, WhatsApp, e-mail, CPF, nascimento, endereço (fica só cidade/UF), observações,
--    conversas do Atendimento (mensagens e mídias), linhas do Banco de Leads com o número,
--    nome/número/resposta nos envios de campanha, aparelhos confirmados no link e cópias dos
--    dados na fila de integrações.
--    Fica: os pedidos com valores, itens e pagamentos (registro de venda e obrigação fiscal),
--    sem endereço completo. O número vai para a lista de descadastro, para nunca mais receber
--    campanha (guardar só o número para isso é o que permite respeitar o pedido).
--    Não dá para anonimizar com pedido em andamento (o endereço ainda é preciso para entregar).
-- -----------------------------------------------------------------------------
alter table public.clientes add column anonimizado_em timestamptz;
comment on column public.clientes.anonimizado_em is
  'Quando os dados pessoais foram anonimizados a pedido do titular (LGPD). O histórico de pedidos continua.';

create or replace function public.anonimizar_cliente(p_cliente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente   public.clientes;
  v_numeros   text[];
  v_pedidos   uuid[];
  v_contatos  uuid[];
  v_midias    text[] := '{}';
  v_pastas    uuid[] := '{}';
  v_pasta     uuid;
  v_em_aberto bigint;
  v_conversas integer := 0;
  v_leads     integer := 0;
  v_envios    integer := 0;
  v_qtd       integer;
  r           record;
begin
  if not public.eh_admin() then
    raise exception 'Só administradores podem anonimizar clientes.' using errcode = 'P0001';
  end if;

  select * into v_cliente from public.clientes where id = p_cliente_id for update;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0001';
  end if;
  if v_cliente.anonimizado_em is not null then
    raise exception 'Este cliente já foi anonimizado.' using errcode = 'P0001';
  end if;

  select pe.numero into v_em_aberto
  from public.pedidos pe
  where pe.cliente_id = p_cliente_id and pe.status in ('novo', 'confirmado', 'separado')
  order by pe.criado_em
  limit 1;
  if v_em_aberto is not null then
    raise exception 'Este cliente tem o pedido #PRM-% em andamento. Entregue ou cancele antes de anonimizar.', v_em_aberto
      using errcode = 'P0001';
  end if;

  select coalesce(array_agg(pe.id), '{}') into v_pedidos from public.pedidos pe where pe.cliente_id = p_cliente_id;

  -- O mesmo número pode estar gravado com ou sem o 9º dígito.
  if v_cliente.whatsapp is not null then
    select array_agg(distinct n) into v_numeros
    from unnest(array[public.normalizar_whatsapp(v_cliente.whatsapp), public.whatsapp_canonico(v_cliente.whatsapp)]) as n
    where n is not null and n <> '';
  end if;
  v_numeros := coalesce(v_numeros, '{}');

  -- Cadastro: fica só cidade e UF (estatística por região).
  update public.clientes
  set nome            = 'Cliente anonimizado',
      whatsapp        = null,
      email           = null,
      cpf             = null,
      data_nascimento = null,
      cep             = null,
      logradouro      = null,
      numero          = null,
      complemento     = null,
      bairro          = null,
      referencia      = null,
      observacoes     = null,
      tags            = '{}',
      vip             = false,
      shopify_customer_id = null,
      app_usuario_id  = null,
      anonimizado_em  = now()
  where id = p_cliente_id;

  -- Pedidos: valores e itens ficam; o endereço vira só cidade/UF.
  update public.pedidos
  set endereco_entrega = case when endereco_entrega is null then null
                              else jsonb_strip_nulls(jsonb_build_object('cidade', endereco_entrega ->> 'cidade', 'uf', endereco_entrega ->> 'uf')) end,
      observacoes = null
  where cliente_id = p_cliente_id;

  -- Linha do tempo: a troca de nome guardava o nome antigo e o novo.
  update public.atividades
  set descricao = 'Nome atualizado pelo link da pré-venda (dado anonimizado)'
  where cliente_id = p_cliente_id and tipo = 'nome_atualizado';

  -- Avisos do sino e cópias dos dados na fila de integrações (n8n).
  delete from public.notificacoes where pedido_id = any (v_pedidos);
  delete from public.eventos_integracao
  where entidade_id = any (v_pedidos || p_cliente_id) and criado_em < now();

  if array_length(v_numeros, 1) > 0 then
    -- Atendimento: conversas, mensagens e mídias (os arquivos o servidor apaga do Storage).
    select coalesce(array_agg(c.id), '{}') into v_contatos from public.whatsapp_contatos c where c.whatsapp = any (v_numeros);
    if array_length(v_contatos, 1) > 0 then
      select coalesce(array_agg(m.midia_path), '{}') into v_midias
      from public.whatsapp_mensagens m
      where m.contato_id = any (v_contatos) and m.midia_path is not null;
      delete from public.whatsapp_contatos where id = any (v_contatos); -- leva atendimentos, mensagens e avisos
      get diagnostics v_conversas = row_count;
    end if;

    -- Banco de Leads: apaga as linhas do número e acerta os contadores das listas.
    for r in
      with apagados as (
        delete from public.leads l where l.whatsapp = any (v_numeros)
        returning l.lista_id, l.ddd, (l.email is not null) as tem_email
      )
      select a.lista_id, a.ddd, count(*)::int as n, (count(*) filter (where a.tem_email))::int as n_email
      from apagados a
      group by a.lista_id, a.ddd
    loop
      update public.leads_listas
      set total        = greatest(total - r.n, 0),
          com_whatsapp = greatest(com_whatsapp - r.n, 0),
          com_email    = greatest(com_email - r.n_email, 0),
          ddds = case when r.ddd is not null and ddds ? r.ddd
                      then jsonb_set(ddds, array[r.ddd], to_jsonb(greatest(coalesce((ddds ->> r.ddd)::int, 0) - r.n, 0)))
                      else ddds end
      where id = r.lista_id
      returning pasta_id into v_pasta;
      if v_pasta is not null then v_pastas := array_append(v_pastas, v_pasta); end if;
      v_leads := v_leads + r.n;
    end loop;
    if v_leads > 0 then
      perform public.marcar_resumo_leads_pendente(v_pastas);
    end if;

    -- Campanhas: o que ainda não saiu é cancelado; o que saiu fica só como número da estatística.
    delete from public.campanha_envios where whatsapp = any (v_numeros) and status = 'pendente';
    get diagnostics v_envios = row_count;
    update public.campanha_envios
    set whatsapp = 'anonimizado-' || id, nome = null, resposta = null
    where whatsapp = any (v_numeros);
    get diagnostics v_qtd = row_count;
    v_envios := v_envios + v_qtd;

    -- Nunca mais recebe campanha.
    insert into public.whatsapp_descadastros (whatsapp, origem)
    values (public.whatsapp_canonico(v_cliente.whatsapp), 'equipe')
    on conflict (whatsapp) do nothing;

    -- Link da pré-venda: aparelhos confirmados e códigos.
    delete from public.link_sessoes where whatsapp = any (v_numeros);
    delete from public.link_codigos where whatsapp = any (v_numeros);
  end if;

  insert into public.atividades (cliente_id, tipo, descricao, autor_id)
  values (p_cliente_id, 'cliente_anonimizado', 'Dados pessoais anonimizados a pedido do titular (LGPD). Os pedidos continuam no histórico.', auth.uid());

  return jsonb_build_object(
    'pedidos', coalesce(array_length(v_pedidos, 1), 0),
    'conversas', v_conversas,
    'leads', v_leads,
    'envios', v_envios,
    'midias', to_jsonb(v_midias)
  );
end;
$$;

revoke all on function public.anonimizar_cliente(uuid) from public, anon;
grant execute on function public.anonimizar_cliente(uuid) to authenticated;
