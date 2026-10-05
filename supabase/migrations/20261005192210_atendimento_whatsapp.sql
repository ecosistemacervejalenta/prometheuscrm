-- =============================================================================
-- PROMETHEUS CRM · 12 · ATENDIMENTO WHATSAPP (uazapi)
--   Caixa de entrada da equipe para o número da loja (WhatsApp Web via uazapi).
--   contatos (um por conversa 1:1) → atendimentos (fila → em atendimento →
--   aguardando cliente → resolvido) → mensagens + eventos (histórico e notas).
--   O webhook /api/webhooks/whatsapp grava tudo por registrar_mensagem_whatsapp;
--   a tela /atendimento acompanha as mudanças pelo Supabase Realtime.
--   A uazapi guarda mensagens só por 7 dias: aqui fica o histórico permanente.
-- =============================================================================

create type public.status_atendimento as enum ('fila', 'em_atendimento', 'aguardando_cliente', 'resolvido');
create type public.direcao_mensagem as enum ('entrada', 'saida');
create type public.status_mensagem_whatsapp as enum ('enviando', 'enviada', 'entregue', 'lida', 'falhou');

-- Número canônico: só dígitos e, para celulares do Brasil que o WhatsApp
-- identifica sem o 9º dígito (comum em DDDs fora de SP), o 9 é acrescentado —
-- assim o contato casa com o cadastro de clientes e com o Banco de Leads.
--   "553187654321" → "5531987654321"
create or replace function public.whatsapp_canonico(p_numero text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^55[1-9][0-9][6-9][0-9]{7}$' then substr(d, 1, 4) || '9' || substr(d, 5)
    else d
  end
  from (select public.somente_digitos(p_numero) as d) as numero;
$$;

-- Contatos ------------------------------------------------------------------------

create table public.whatsapp_contatos (
  id             uuid primary key default gen_random_uuid(),
  chatid         text not null unique,
  whatsapp       text,
  nome           text,
  nome_whatsapp  text,
  anotacoes      text,
  lead_id        uuid references public.leads (id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

comment on table public.whatsapp_contatos is 'Quem conversa com a loja pelo WhatsApp (uma linha por conversa 1:1).';
comment on column public.whatsapp_contatos.chatid is 'JID da conversa na uazapi (ex.: 5511987654321@s.whatsapp.net). É o destino dos envios.';
comment on column public.whatsapp_contatos.whatsapp is 'Número canônico (whatsapp_canonico). Nulo quando o WhatsApp não revela o número (@lid).';
comment on column public.whatsapp_contatos.nome is 'Nome definido pela equipe. Se vazio, a tela usa o nome do cliente cadastrado ou o do perfil do WhatsApp.';
comment on column public.whatsapp_contatos.anotacoes is 'Preferências e observações (ex.: "gosta de IPA"), visíveis em todos os atendimentos.';

create index whatsapp_contatos_whatsapp_idx on public.whatsapp_contatos (whatsapp) where whatsapp is not null;

create or replace function public.normalizar_contato_whatsapp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.whatsapp      := public.whatsapp_canonico(new.whatsapp);
  new.nome          := nullif(regexp_replace(trim(coalesce(new.nome, '')), '\s+', ' ', 'g'), '');
  new.nome_whatsapp := nullif(trim(coalesce(new.nome_whatsapp, '')), '');
  new.anotacoes     := nullif(trim(coalesce(new.anotacoes, '')), '');
  return new;
end;
$$;

create trigger whatsapp_contatos_normalizar
  before insert or update on public.whatsapp_contatos
  for each row execute function public.normalizar_contato_whatsapp();
create trigger whatsapp_contatos_atualizado_em
  before update on public.whatsapp_contatos
  for each row execute function public.definir_atualizado_em();

-- Atendimentos ----------------------------------------------------------------------

create table public.atendimentos (
  id                       uuid primary key default gen_random_uuid(),
  numero                   integer generated always as identity unique,
  contato_id               uuid not null references public.whatsapp_contatos (id) on delete cascade,
  status                   public.status_atendimento not null default 'fila',
  responsavel_id           uuid references public.perfis (id) on delete set null,
  nao_lidas                integer not null default 0 check (nao_lidas >= 0),
  ultima_mensagem_em       timestamptz,
  ultima_mensagem_previa   text,
  ultima_mensagem_direcao  public.direcao_mensagem,
  primeira_resposta_em     timestamptz,
  resolvido_em             timestamptz,
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now()
);

comment on table public.atendimentos is 'Cada vez que um cliente chama (sem atendimento aberto) nasce um atendimento na fila. Um responsável por vez.';

-- No máximo um atendimento aberto por contato.
create unique index atendimentos_aberto_por_contato on public.atendimentos (contato_id) where status <> 'resolvido';
create index atendimentos_caixa_idx on public.atendimentos (status, ultima_mensagem_em desc);
create index atendimentos_responsavel_idx on public.atendimentos (responsavel_id) where status <> 'resolvido';
create index atendimentos_contato_idx on public.atendimentos (contato_id, criado_em desc);

create trigger atendimentos_atualizado_em
  before update on public.atendimentos
  for each row execute function public.definir_atualizado_em();

-- Mensagens -----------------------------------------------------------------------

create table public.whatsapp_mensagens (
  id              uuid primary key default gen_random_uuid(),
  contato_id      uuid not null references public.whatsapp_contatos (id) on delete cascade,
  atendimento_id  uuid references public.atendimentos (id) on delete set null,
  wa_id           text unique,
  wa_messageid    text,
  direcao         public.direcao_mensagem not null,
  tipo            text not null default 'texto'
                  check (tipo in ('texto', 'imagem', 'audio', 'video', 'documento', 'figurinha', 'localizacao', 'contato', 'reacao', 'outro')),
  texto           text,
  midia_path      text,
  midia_mime      text,
  midia_nome      text,
  midia_segundos  integer,
  midia_status    text check (midia_status in ('pendente', 'pronta', 'indisponivel')),
  citada_wa_id    text,
  status          public.status_mensagem_whatsapp,
  erro            text,
  enviada_por     uuid references public.perfis (id) on delete set null,
  enviada_em      timestamptz not null default now(),
  criado_em       timestamptz not null default now()
);

comment on table public.whatsapp_mensagens is 'Histórico permanente das conversas. Saída com enviada_por = enviada pelo CRM; sem enviada_por = enviada pelo celular.';
comment on column public.whatsapp_mensagens.wa_id is 'ID da mensagem na uazapi (dono:messageid). Garante que o mesmo webhook não duplique a mensagem.';
comment on column public.whatsapp_mensagens.wa_messageid is 'ID original no WhatsApp — usado pelos recibos de entrega e leitura.';
comment on column public.whatsapp_mensagens.midia_path is 'Caminho no bucket privado "whatsapp" (a URL da uazapi expira em 2 dias).';

create index whatsapp_mensagens_contato_idx on public.whatsapp_mensagens (contato_id, enviada_em desc);
create index whatsapp_mensagens_atendimento_idx on public.whatsapp_mensagens (atendimento_id);
create index whatsapp_mensagens_messageid_idx on public.whatsapp_mensagens (wa_messageid) where wa_messageid is not null;

-- Eventos (linha do tempo) e notas internas ----------------------------------------

create table public.atendimento_eventos (
  id              uuid primary key default gen_random_uuid(),
  atendimento_id  uuid not null references public.atendimentos (id) on delete cascade,
  tipo            text not null check (tipo in ('aberto', 'assumido', 'transferido', 'status', 'nota', 'resolvido')),
  autor_id        uuid references public.perfis (id) on delete set null default auth.uid(),
  para_id         uuid references public.perfis (id) on delete set null,
  status          public.status_atendimento,
  texto           text check (tipo <> 'nota' or length(trim(texto)) between 1 and 4000),
  criado_em       timestamptz not null default now()
);

comment on table public.atendimento_eventos is 'Quem assumiu, transferiu, mudou o status e notas internas (o cliente não vê). autor_id nulo = automático.';

create index atendimento_eventos_atendimento_idx on public.atendimento_eventos (atendimento_id, criado_em);

-- Configurações ---------------------------------------------------------------------

alter table public.configuracoes
  add column whatsapp_assinatura        boolean not null default true,
  add column whatsapp_leads_automatico  boolean not null default true,
  add column whatsapp_pasta_leads_id    uuid references public.leads_pastas (id) on delete set null;

comment on column public.configuracoes.whatsapp_assinatura is 'Envia o nome do atendente em negrito no início de cada mensagem (*Ana:* ...).';
comment on column public.configuracoes.whatsapp_leads_automatico is 'Salva no Banco de Leads quem chama no WhatsApp e ainda não é lead.';
comment on column public.configuracoes.whatsapp_pasta_leads_id is 'Pasta do Banco de Leads onde os contatos do WhatsApp são salvos (lista "WhatsApp").';

-- Pasta padrão "Clientes WhatsApp" (reaproveita se já existir com outra grafia).
insert into public.leads_pastas (nome, descricao, criado_por)
select 'Clientes WhatsApp', 'Contatos que chamaram no WhatsApp da loja, salvos pelo Atendimento.', null
where not exists (select 1 from public.leads_pastas where lower(nome) = 'clientes whatsapp');

update public.configuracoes
set whatsapp_pasta_leads_id = (select id from public.leads_pastas where lower(nome) = 'clientes whatsapp')
where id = 1;

-- Funções auxiliares ----------------------------------------------------------------

-- Ordem de progressão do status (um recibo atrasado nunca faz "lida" voltar para "enviada").
create or replace function public.ordem_status_whatsapp(p_status public.status_mensagem_whatsapp)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'enviando' then 0
    when 'falhou'   then 1
    when 'enviada'  then 2
    when 'entregue' then 3
    when 'lida'     then 4
    else -1
  end;
$$;

-- Texto curto da última mensagem para a lista de conversas.
create or replace function public.previa_mensagem_whatsapp(p_tipo text, p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(case p_tipo
    when 'texto'       then coalesce(p_texto, '')
    when 'imagem'      then '📷 ' || coalesce(nullif(p_texto, ''), 'Foto')
    when 'video'       then '🎥 ' || coalesce(nullif(p_texto, ''), 'Vídeo')
    when 'audio'       then '🎤 Áudio'
    when 'documento'   then '📄 ' || coalesce(nullif(p_texto, ''), 'Documento')
    when 'figurinha'   then '💟 Figurinha'
    when 'localizacao' then '📍 Localização'
    when 'contato'     then '👤 Contato'
    when 'reacao'      then 'Reagiu ' || coalesce(p_texto, '')
    else coalesce(nullif(p_texto, ''), 'Mensagem')
  end, 160);
$$;

-- Salvar como lead ------------------------------------------------------------------

-- Salva o contato na lista "WhatsApp" da pasta escolhida (ou da pasta padrão das
-- configurações), criando a lista na primeira vez. Não duplica o número na lista.
-- Retorna o id do lead.
create or replace function public.salvar_lead_whatsapp(p_contato_id uuid, p_pasta_id uuid default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_contato public.whatsapp_contatos;
  v_pasta   uuid := coalesce(p_pasta_id, (select whatsapp_pasta_leads_id from public.configuracoes where id = 1));
  v_nome    text;
  v_lista   uuid;
  v_lead    uuid;
begin
  select * into v_contato from public.whatsapp_contatos where id = p_contato_id;
  if not found then
    raise exception 'Contato não encontrado.';
  end if;
  if v_contato.whatsapp is null or length(v_contato.whatsapp) not between 12 and 15 then
    raise exception 'O WhatsApp não mostrou o número deste contato — não dá para salvar como lead.';
  end if;
  if v_pasta is null or not exists (select 1 from public.leads_pastas where id = v_pasta) then
    raise exception 'Escolha a pasta do Banco de Leads onde salvar.';
  end if;

  v_nome := coalesce(
    v_contato.nome,
    (select c.nome from public.clientes c where c.whatsapp = v_contato.whatsapp),
    v_contato.nome_whatsapp
  );

  perform pg_advisory_xact_lock(hashtext('leads_whatsapp:' || v_pasta::text));

  select id into v_lista from public.leads_listas where pasta_id = v_pasta and lower(nome) = 'whatsapp';
  if v_lista is null then
    insert into public.leads_listas (pasta_id, nome, origem, colunas, coluna_nome, coluna_whatsapp, status)
    values (
      v_pasta, 'WhatsApp', 'Atendimento WhatsApp',
      '[{"chave":"c0","rotulo":"Nome","tipo":"nome"},{"chave":"c1","rotulo":"WhatsApp","tipo":"telefone"}]',
      'c0', 'c1', 'pronta'
    )
    returning id into v_lista;
  end if;

  select id into v_lead from public.leads where lista_id = v_lista and whatsapp = v_contato.whatsapp;
  if v_lead is null then
    insert into public.leads (lista_id, linha, nome, whatsapp, dados)
    values (
      v_lista,
      coalesce((select max(linha) from public.leads where lista_id = v_lista), 0) + 1,
      v_nome,
      v_contato.whatsapp,
      jsonb_build_object('c0', coalesce(v_nome, ''), 'c1', v_contato.whatsapp)
    )
    returning id into v_lead;
    perform public.concluir_importacao_leads(v_lista);
  end if;

  update public.whatsapp_contatos set lead_id = v_lead where id = p_contato_id;
  return v_lead;
end;
$$;

-- Webhook e sincronização ----------------------------------------------------------

-- Registra uma mensagem (recebida, enviada pelo celular ou eco de um envio do CRM).
-- Idempotente pelo wa_id. Mensagens novas abrem/atualizam o atendimento; mensagens
-- antigas (sincronização do histórico) só entram no histórico do contato.
-- p = { wa_id, wa_messageid, chatid, whatsapp, nome_whatsapp, direcao, tipo, texto,
--       midia_mime, midia_nome, midia_segundos, citada_wa_id, status, enviada_em, track_id }
create or replace function public.registrar_mensagem_whatsapp(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_wa_id        text := nullif(p->>'wa_id', '');
  v_chatid       text := nullif(p->>'chatid', '');
  v_direcao      public.direcao_mensagem := nullif(p->>'direcao', '')::public.direcao_mensagem;
  v_tipo         text := coalesce(nullif(p->>'tipo', ''), 'outro');
  v_texto        text := nullif(p->>'texto', '');
  v_enviada_em   timestamptz := coalesce(nullif(p->>'enviada_em', '')::timestamptz, now());
  v_status       public.status_mensagem_whatsapp := nullif(p->>'status', '')::public.status_mensagem_whatsapp;
  v_midia        boolean := v_tipo in ('imagem', 'audio', 'video', 'documento', 'figurinha');
  v_msg_id       uuid;
  v_contato_id   uuid;
  v_contato_novo boolean;
  v_lead_id      uuid;
  v_ultima_em    timestamptz;
  v_nova         boolean;
  v_aberto       boolean := false;
  v_atend        public.atendimentos;
  v_config       public.configuracoes;
begin
  if v_wa_id is null or v_chatid is null or v_direcao is null then
    raise exception 'Mensagem sem id, conversa ou direção.';
  end if;

  -- Uma mensagem por vez em cada conversa (webhooks simultâneos do mesmo contato).
  perform pg_advisory_xact_lock(hashtext('whatsapp:' || v_chatid));

  -- 1. Já registrada (webhook repetido, sincronização ou eco de um envio do CRM,
  --    que chega com track_id = id da linha criada antes do envio).
  select id into v_msg_id from public.whatsapp_mensagens where wa_id = v_wa_id;
  if v_msg_id is null and coalesce(p->>'track_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    update public.whatsapp_mensagens
    set wa_id = v_wa_id,
        wa_messageid = coalesce(wa_messageid, nullif(p->>'wa_messageid', ''))
    where id = (p->>'track_id')::uuid and wa_id is null
    returning id into v_msg_id;
  end if;
  if v_msg_id is not null then
    if v_status is not null then
      update public.whatsapp_mensagens
      set status = v_status
      where id = v_msg_id and public.ordem_status_whatsapp(v_status) > public.ordem_status_whatsapp(status);
    end if;
    return jsonb_build_object('mensagem_id', v_msg_id, 'duplicada', true);
  end if;

  -- 2. Contato (o nome do perfil só vale para mensagens recebidas).
  insert into public.whatsapp_contatos (chatid, whatsapp, nome_whatsapp)
  values (v_chatid, nullif(p->>'whatsapp', ''), case when v_direcao = 'entrada' then nullif(p->>'nome_whatsapp', '') end)
  on conflict (chatid) do update
    set whatsapp      = coalesce(public.whatsapp_contatos.whatsapp, excluded.whatsapp),
        nome_whatsapp = coalesce(excluded.nome_whatsapp, public.whatsapp_contatos.nome_whatsapp)
  returning id, (xmax = 0), lead_id into v_contato_id, v_contato_novo, v_lead_id;

  -- 3. Mensagem nova (mais recente que o histórico e dos últimos 3 dias) mexe no
  --    atendimento; mensagem antiga só entra no histórico. A folga de 5 min cobre a
  --    diferença entre o relógio do WhatsApp e o do banco (envios do CRM usam now()).
  select max(enviada_em) into v_ultima_em from public.whatsapp_mensagens where contato_id = v_contato_id;
  v_nova := (v_ultima_em is null or v_enviada_em >= v_ultima_em - interval '5 minutes')
            and v_enviada_em > now() - interval '3 days';

  select * into v_atend from public.atendimentos where contato_id = v_contato_id and status <> 'resolvido';

  if v_nova then
    if v_direcao = 'entrada' then
      if v_atend.id is null then
        insert into public.atendimentos (contato_id) values (v_contato_id) returning * into v_atend;
        insert into public.atendimento_eventos (atendimento_id, tipo, autor_id) values (v_atend.id, 'aberto', null);
        v_aberto := true;
      elsif v_atend.status = 'aguardando_cliente' then
        update public.atendimentos
        set status = case when responsavel_id is null then 'fila'::public.status_atendimento else 'em_atendimento' end
        where id = v_atend.id
        returning * into v_atend;
        insert into public.atendimento_eventos (atendimento_id, tipo, autor_id, status, texto)
        values (v_atend.id, 'status', null, v_atend.status, 'O cliente respondeu');
      end if;
    end if;
  elsif v_atend.id is null or v_atend.criado_em > v_enviada_em then
    select * into v_atend
    from public.atendimentos
    where contato_id = v_contato_id and criado_em <= v_enviada_em
    order by criado_em desc
    limit 1;
  end if;

  -- 4. Mensagem.
  insert into public.whatsapp_mensagens (
    contato_id, atendimento_id, wa_id, wa_messageid, direcao, tipo, texto,
    midia_mime, midia_nome, midia_segundos, midia_status, citada_wa_id, status, enviada_em
  )
  values (
    v_contato_id, v_atend.id, v_wa_id, nullif(p->>'wa_messageid', ''), v_direcao, v_tipo, v_texto,
    nullif(p->>'midia_mime', ''), nullif(p->>'midia_nome', ''), nullif(p->>'midia_segundos', '')::integer,
    case when v_midia then 'pendente' end, nullif(p->>'citada_wa_id', ''), v_status, v_enviada_em
  )
  returning id into v_msg_id;

  -- 5. Resumo do atendimento (lista da caixa de entrada).
  if v_nova and v_atend.id is not null then
    update public.atendimentos
    set ultima_mensagem_em      = greatest(ultima_mensagem_em, v_enviada_em),
        ultima_mensagem_previa  = case when ultima_mensagem_em is null or v_enviada_em >= ultima_mensagem_em
                                       then public.previa_mensagem_whatsapp(v_tipo, v_texto) else ultima_mensagem_previa end,
        ultima_mensagem_direcao = case when ultima_mensagem_em is null or v_enviada_em >= ultima_mensagem_em
                                       then v_direcao else ultima_mensagem_direcao end,
        nao_lidas               = case when v_direcao = 'entrada' then nao_lidas + 1 else 0 end,
        primeira_resposta_em    = case when v_direcao = 'saida' then coalesce(primeira_resposta_em, v_enviada_em)
                                       else primeira_resposta_em end
    where id = v_atend.id;
  end if;

  -- 6. Quem chama e ainda não é lead vai para o Banco de Leads (se ligado nas configurações).
  if v_aberto and v_lead_id is null then
    select * into v_config from public.configuracoes where id = 1;
    if v_config.whatsapp_leads_automatico and v_config.whatsapp_pasta_leads_id is not null then
      begin
        perform public.salvar_lead_whatsapp(v_contato_id);
      exception when others then
        -- Contato sem número visível, pasta apagada...: a mensagem é registrada mesmo assim.
        raise warning 'Lead automático não salvo (%): %', v_contato_id, sqlerrm;
      end;
    end if;
  end if;

  return jsonb_build_object(
    'mensagem_id', v_msg_id,
    'contato_id', v_contato_id,
    'atendimento_id', v_atend.id,
    'contato_novo', v_contato_novo,
    'atendimento_aberto', v_aberto,
    'midia_pendente', v_midia,
    'duplicada', false
  );
end;
$$;

-- Recibos de entrega e leitura (messages_update). Nunca regride o status.
create or replace function public.atualizar_status_whatsapp(p_messageids text[], p_status public.status_mensagem_whatsapp)
returns integer
language sql
set search_path = ''
as $$
  with alteradas as (
    update public.whatsapp_mensagens
    set status = p_status
    where wa_messageid = any (p_messageids)
      and direcao = 'saida'
      and public.ordem_status_whatsapp(p_status) > public.ordem_status_whatsapp(status)
    returning 1
  )
  select count(*)::integer from alteradas;
$$;

-- Ações da equipe -------------------------------------------------------------------

-- Cria a mensagem (status "enviando") antes de chamar a uazapi. O id volta como
-- track_id no webhook, o que evita duplicar a mensagem. Responder um atendimento
-- sem responsável é assumi-lo.
create or replace function public.preparar_envio_whatsapp(p_atendimento_id uuid, p_texto text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_eu     uuid := auth.uid();
  v_atend  public.atendimentos;
  v_chatid text;
  v_msg_id uuid;
begin
  if v_eu is null then
    raise exception 'Faça login para enviar mensagens.';
  end if;
  if nullif(trim(coalesce(p_texto, '')), '') is null then
    raise exception 'Escreva a mensagem.';
  end if;
  if length(p_texto) > 4096 then
    raise exception 'Mensagem longa demais (máximo de 4.096 caracteres).';
  end if;

  select * into v_atend from public.atendimentos where id = p_atendimento_id for update;
  if not found then
    raise exception 'Atendimento não encontrado.';
  end if;
  if v_atend.status = 'resolvido' then
    raise exception 'Este atendimento já foi resolvido. Reabra para responder.';
  end if;
  select chatid into v_chatid from public.whatsapp_contatos where id = v_atend.contato_id;

  if v_atend.responsavel_id is null then
    update public.atendimentos set responsavel_id = v_eu, status = 'em_atendimento' where id = v_atend.id;
    insert into public.atendimento_eventos (atendimento_id, tipo, autor_id, para_id)
    values (v_atend.id, 'assumido', v_eu, v_eu);
  end if;

  insert into public.whatsapp_mensagens (contato_id, atendimento_id, direcao, tipo, texto, status, enviada_por, enviada_em)
  values (v_atend.contato_id, v_atend.id, 'saida', 'texto', p_texto, 'enviando', v_eu, now())
  returning id into v_msg_id;

  update public.atendimentos
  set ultima_mensagem_em      = now(),
      ultima_mensagem_previa  = public.previa_mensagem_whatsapp('texto', p_texto),
      ultima_mensagem_direcao = 'saida',
      nao_lidas               = 0,
      primeira_resposta_em    = coalesce(primeira_resposta_em, now())
  where id = v_atend.id;

  return jsonb_build_object('mensagem_id', v_msg_id, 'chatid', v_chatid);
end;
$$;

create or replace function public.assumir_atendimento(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_eu    uuid := auth.uid();
  v_atend public.atendimentos;
  v_nome  text;
begin
  select * into v_atend from public.atendimentos where id = p_id for update;
  if not found then
    raise exception 'Atendimento não encontrado.';
  end if;
  if v_atend.status = 'resolvido' then
    raise exception 'Este atendimento já foi resolvido.';
  end if;
  if v_atend.responsavel_id = v_eu then
    return;
  end if;
  if v_atend.responsavel_id is not null then
    select nullif(nome, '') into v_nome from public.perfis where id = v_atend.responsavel_id;
    raise exception '% já está neste atendimento. Use "Transferir" se precisar.', coalesce(v_nome, 'Outra pessoa');
  end if;

  update public.atendimentos set responsavel_id = v_eu, status = 'em_atendimento' where id = p_id;
  insert into public.atendimento_eventos (atendimento_id, tipo, autor_id, para_id) values (p_id, 'assumido', v_eu, v_eu);
end;
$$;

create or replace function public.transferir_atendimento(p_id uuid, p_para uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_atend public.atendimentos;
begin
  if not exists (select 1 from public.perfis where id = p_para and ativo) then
    raise exception 'Escolha um membro ativo da equipe.';
  end if;
  select * into v_atend from public.atendimentos where id = p_id for update;
  if not found then
    raise exception 'Atendimento não encontrado.';
  end if;
  if v_atend.status = 'resolvido' then
    raise exception 'Este atendimento já foi resolvido.';
  end if;
  if v_atend.responsavel_id = p_para then
    return;
  end if;

  update public.atendimentos
  set responsavel_id = p_para,
      status = case when status = 'fila' then 'em_atendimento'::public.status_atendimento else status end
  where id = p_id;
  insert into public.atendimento_eventos (atendimento_id, tipo, autor_id, para_id)
  values (p_id, 'transferido', auth.uid(), p_para);
end;
$$;

-- Fila → sem responsável. Em atendimento / aguardando → quem muda assume se não houver
-- responsável. Resolvido → zera as não lidas. Reabrir só se o contato não tiver outro aberto.
create or replace function public.alterar_status_atendimento(p_id uuid, p_status public.status_atendimento)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_atend public.atendimentos;
begin
  select * into v_atend from public.atendimentos where id = p_id for update;
  if not found then
    raise exception 'Atendimento não encontrado.';
  end if;
  if v_atend.status = p_status then
    return;
  end if;

  update public.atendimentos
  set status         = p_status,
      responsavel_id = case when p_status = 'fila' then null else coalesce(responsavel_id, auth.uid()) end,
      resolvido_em   = case when p_status = 'resolvido' then now() end,
      nao_lidas      = case when p_status = 'resolvido' then 0 else nao_lidas end
  where id = p_id;

  insert into public.atendimento_eventos (atendimento_id, tipo, autor_id, status)
  values (p_id, case when p_status = 'resolvido' then 'resolvido' else 'status' end, auth.uid(), p_status);
end;
$$;

-- Visão da caixa de entrada -------------------------------------------------------

create view public.vw_atendimentos
with (security_invoker = true)
as
select
  a.*,
  c.chatid,
  c.whatsapp,
  c.lead_id,
  coalesce(c.nome, cl.nome, c.nome_whatsapp) as contato_nome,
  c.nome_whatsapp,
  r.nome   as responsavel_nome,
  cl.id    as cliente_id,
  cl.nome  as cliente_nome,
  lower(concat_ws(' ', c.nome, c.nome_whatsapp, cl.nome, c.whatsapp)) as busca
from public.atendimentos a
join public.whatsapp_contatos c on c.id = a.contato_id
left join public.perfis r on r.id = a.responsavel_id
left join public.clientes cl on cl.whatsapp = c.whatsapp;

-- Segurança ---------------------------------------------------------------------

alter table public.whatsapp_contatos enable row level security;
alter table public.atendimentos enable row level security;
alter table public.whatsapp_mensagens enable row level security;
alter table public.atendimento_eventos enable row level security;

create policy "Equipe gerencia contatos do WhatsApp"
  on public.whatsapp_contatos for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe gerencia atendimentos"
  on public.atendimentos for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe gerencia mensagens do WhatsApp"
  on public.whatsapp_mensagens for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe gerencia eventos de atendimento"
  on public.atendimento_eventos for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

revoke all on public.whatsapp_contatos, public.atendimentos, public.whatsapp_mensagens,
  public.atendimento_eventos, public.vw_atendimentos from anon;
grant select, insert, update, delete on public.whatsapp_contatos, public.atendimentos,
  public.whatsapp_mensagens, public.atendimento_eventos to authenticated, service_role;
grant select on public.vw_atendimentos to authenticated, service_role;

revoke execute on function
  public.whatsapp_canonico(text),
  public.ordem_status_whatsapp(public.status_mensagem_whatsapp),
  public.previa_mensagem_whatsapp(text, text),
  public.salvar_lead_whatsapp(uuid, uuid),
  public.registrar_mensagem_whatsapp(jsonb),
  public.atualizar_status_whatsapp(text[], public.status_mensagem_whatsapp),
  public.preparar_envio_whatsapp(uuid, text),
  public.assumir_atendimento(uuid),
  public.transferir_atendimento(uuid, uuid),
  public.alterar_status_atendimento(uuid, public.status_atendimento)
from public, anon;

grant execute on function
  public.whatsapp_canonico(text),
  public.ordem_status_whatsapp(public.status_mensagem_whatsapp),
  public.previa_mensagem_whatsapp(text, text),
  public.salvar_lead_whatsapp(uuid, uuid),
  public.registrar_mensagem_whatsapp(jsonb),
  public.atualizar_status_whatsapp(text[], public.status_mensagem_whatsapp),
  public.preparar_envio_whatsapp(uuid, text),
  public.assumir_atendimento(uuid),
  public.transferir_atendimento(uuid, uuid),
  public.alterar_status_atendimento(uuid, public.status_atendimento)
to authenticated, service_role;

-- Tempo real: a tela /atendimento é avisada a cada mudança (o RLS continua valendo).
alter publication supabase_realtime add table public.atendimentos, public.whatsapp_mensagens, public.atendimento_eventos;

-- Mídias (fotos, áudios, vídeos, documentos) em bucket privado ----------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp', 'whatsapp', false, 26214400)
on conflict (id) do nothing;

create policy "Equipe vê mídias do WhatsApp"
  on storage.objects for select to authenticated
  using (bucket_id = 'whatsapp' and (select public.eh_membro_equipe()));

create policy "Equipe guarda mídias do WhatsApp"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'whatsapp' and (select public.eh_membro_equipe()));

create policy "Equipe atualiza mídias do WhatsApp"
  on storage.objects for update to authenticated
  using (bucket_id = 'whatsapp' and (select public.eh_membro_equipe()));
