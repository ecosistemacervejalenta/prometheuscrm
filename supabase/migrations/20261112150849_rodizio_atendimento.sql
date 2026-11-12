-- =============================================================================
-- PROMETHEUS CRM · ATENDIMENTO — RODÍZIO DA FILA E AVISOS DE MENSAGEM
--   Rodízio fixo: cada atendimento novo vai para o próximo da lista, na ordem
--   (A → B → C → A…), esteja a pessoa livre ou não. Cliente que volta depois
--   de "Resolvido" vai para quem atendeu da última vez (se ainda estiver no
--   rodízio) e isso não conta como a vez dessa pessoa.
--   Aviso no sino: mensagem de cliente avisa o responsável (sem responsável:
--   quem participa do rodízio), com a hora em que o cliente mandou. Um aviso
--   por conversa, atualizado a cada mensagem até ser lido ou respondido.
--   n8n: eventos whatsapp.mensagem_recebida e atendimento.transferido.
-- =============================================================================

-- Configuração ----------------------------------------------------------------------

alter table public.configuracoes
  add column whatsapp_rodizio               boolean not null default false,
  add column whatsapp_rodizio_participantes uuid[] not null default '{}',
  add column whatsapp_rodizio_ultimo_id     uuid references public.perfis (id) on delete set null;

comment on column public.configuracoes.whatsapp_rodizio is 'Distribui cada atendimento novo do WhatsApp para o próximo da lista de participantes.';
comment on column public.configuracoes.whatsapp_rodizio_participantes is 'Quem participa do rodízio, na ordem da vez. Membro sem acesso é pulado.';
comment on column public.configuracoes.whatsapp_rodizio_ultimo_id is 'Quem recebeu o último atendimento pelo rodízio (o próximo é o seguinte da lista).';

-- Lista mudou e quem recebeu por último saiu dela: a vez passa para o participante
-- anterior a ele que continua na lista, para o rodízio seguir de onde parou
-- (A, B, C com B por último; B sai → próximo é C, não A).
create or replace function public.manter_vez_rodizio()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_vez bigint;
begin
  new.whatsapp_rodizio_participantes := coalesce(
    (select array_agg(id order by primeira)
     from (select u.id, min(u.ordem) as primeira
           from unnest(new.whatsapp_rodizio_participantes) with ordinality as u(id, ordem)
           where u.id is not null
           group by u.id) as unicos),
    '{}');

  if new.whatsapp_rodizio_ultimo_id is null or new.whatsapp_rodizio_ultimo_id = any (new.whatsapp_rodizio_participantes) then
    return new;
  end if;

  select u.ordem into v_vez
  from unnest(old.whatsapp_rodizio_participantes) with ordinality as u(id, ordem)
  where u.id = new.whatsapp_rodizio_ultimo_id
  limit 1;

  new.whatsapp_rodizio_ultimo_id := (
    select u.id
    from unnest(old.whatsapp_rodizio_participantes) with ordinality as u(id, ordem)
    where u.id = any (new.whatsapp_rodizio_participantes)
    -- Anteriores a ele, do mais próximo ao mais distante; depois os do fim da lista (volta circular).
    order by u.ordem >= coalesce(v_vez, 0), u.ordem desc
    limit 1
  );
  return new;
end;
$$;

create trigger configuracoes_manter_vez_rodizio
  before update of whatsapp_rodizio_participantes on public.configuracoes
  for each row execute function public.manter_vez_rodizio();

-- Avisos ligados a um atendimento -----------------------------------------------------

alter table public.notificacoes
  add column atendimento_id uuid references public.atendimentos (id) on delete cascade,
  add column quantidade     integer not null default 1 check (quantidade >= 1);

comment on column public.notificacoes.atendimento_id is 'Conversa do WhatsApp do aviso (abre direto no Atendimento).';
comment on column public.notificacoes.quantidade is 'Mensagens agrupadas no aviso: o mesmo aviso é atualizado até ser lido.';

alter table public.notificacoes drop constraint notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check (tipo in (
  'tarefa_atribuida', 'tarefa_comentario', 'tarefa_impedida', 'tarefa_desimpedida', 'tarefa_prazo', 'tarefa_concluida',
  'whatsapp_mensagem', 'atendimento_transferido'
));

create index notificacoes_atendimento_idx on public.notificacoes (atendimento_id, perfil_id) where atendimento_id is not null;

comment on column public.atendimento_eventos.texto is
  'Nota interna, motivo da mudança de status, nome da etiqueta ou, em "transferido" automático (sem autor), rodizio | retorno.';

-- Nome do contato para avisos e eventos (mesma regra da visão vw_atendimentos).
create or replace function public.nome_contato_whatsapp(p_contato_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(c.nome, cl.nome, c.nome_whatsapp, '+' || c.whatsapp, 'Cliente do WhatsApp')
  from public.whatsapp_contatos c
  left join public.clientes cl on cl.whatsapp = c.whatsapp
  where c.id = p_contato_id;
$$;

-- Rodízio ---------------------------------------------------------------------------

-- Atendimento novo (sempre nasce na fila, pelo registrar_mensagem_whatsapp):
--   1. cliente que volta → quem atendeu da última vez, se ainda estiver no rodízio;
--   2. senão → o próximo da lista depois de quem recebeu o último pelo rodízio.
create or replace function public.distribuir_atendimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.configuracoes;
  v_ativos uuid[];
  v_para   uuid;
  v_motivo text;
  v_vez    bigint;
begin
  if new.responsavel_id is not null then
    return null;
  end if;

  -- Trava a configuração: dois clientes chamando ao mesmo tempo nunca pegam a mesma vez.
  select * into v_config from public.configuracoes where id = 1 for update;
  if not found or not v_config.whatsapp_rodizio then
    return null;
  end if;

  select array_agg(p.id) into v_ativos
  from public.perfis p
  where p.id = any (v_config.whatsapp_rodizio_participantes) and p.ativo;
  if v_ativos is null then
    return null;
  end if;

  select a.responsavel_id into v_para
  from public.atendimentos a
  where a.contato_id = new.contato_id and a.id <> new.id and a.responsavel_id is not null
  order by a.criado_em desc
  limit 1;

  if v_para = any (v_ativos) then
    v_motivo := 'retorno';
  else
    select u.ordem into v_vez
    from unnest(v_config.whatsapp_rodizio_participantes) with ordinality as u(id, ordem)
    where u.id = v_config.whatsapp_rodizio_ultimo_id
    limit 1;

    -- Primeiro quem vem depois da última vez; ao fim da lista, volta ao começo.
    select u.id into v_para
    from unnest(v_config.whatsapp_rodizio_participantes) with ordinality as u(id, ordem)
    where u.id = any (v_ativos)
    order by u.ordem <= coalesce(v_vez, 0), u.ordem
    limit 1;

    v_motivo := 'rodizio';
    update public.configuracoes set whatsapp_rodizio_ultimo_id = v_para where id = 1;
  end if;

  update public.atendimentos
  set responsavel_id = v_para,
      status         = 'em_atendimento'
  where id = new.id;

  -- clock_timestamp: aparece depois do "Atendimento aberto" (gravado com now()) na linha do tempo.
  insert into public.atendimento_eventos (atendimento_id, tipo, autor_id, para_id, texto, criado_em)
  values (new.id, 'transferido', null, v_para, v_motivo, clock_timestamp());

  return null;
end;
$$;

create trigger atendimentos_distribuir
  after insert on public.atendimentos
  for each row execute function public.distribuir_atendimento();

-- Avisos de mensagem ----------------------------------------------------------------

-- Mensagem recebida → aviso no sino (um por conversa e pessoa, agrupando até ser lido).
-- Mensagem enviada pela equipe (CRM ou celular) → os avisos da conversa ficam lidos.
-- Mensagens antigas trazidas pela sincronização (histórico) não avisam ninguém.
create or replace function public.avisar_mensagem_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atend    public.atendimentos;
  v_config   public.configuracoes;
  v_contato  text;
  v_whatsapp text;
  v_local    timestamp := new.enviada_em at time zone 'America/Sao_Paulo';
  v_hora     text;
  v_previa   text;
  v_novo     boolean;
  v_motivo   text;
  v_titulo   text;
  v_destinos uuid[];
  v_destino  uuid;
  v_abriu    boolean := false;
  v_resp     public.perfis;
begin
  if new.atendimento_id is null then
    return null;
  end if;

  if new.direcao = 'saida' then
    update public.notificacoes
    set lida_em = now()
    where atendimento_id = new.atendimento_id and tipo = 'whatsapp_mensagem' and lida_em is null;
    return null;
  end if;

  if new.tipo = 'reacao' or new.enviada_em < now() - interval '1 day' then
    return null;
  end if;

  select * into v_atend from public.atendimentos where id = new.atendimento_id;
  if not found or v_atend.status = 'resolvido' then
    return null;
  end if;
  -- Mais antiga que a última mensagem da conversa: veio do histórico, não é novidade.
  if v_atend.ultima_mensagem_em is not null and new.enviada_em < v_atend.ultima_mensagem_em - interval '5 minutes' then
    return null;
  end if;

  -- Atendimento criado nesta mesma transação (registrar_mensagem_whatsapp): é o primeiro contato.
  v_novo := v_atend.criado_em = now();
  if v_novo then
    select texto into v_motivo
    from public.atendimento_eventos
    where atendimento_id = v_atend.id and tipo = 'transferido' and autor_id is null
    order by criado_em desc
    limit 1;
  end if;

  if v_atend.responsavel_id is not null then
    select array_agg(id) into v_destinos from public.perfis where id = v_atend.responsavel_id and ativo;
  else
    -- Na fila (sem responsável): quem participa do rodízio; sem lista, toda a equipe ativa.
    select * into v_config from public.configuracoes where id = 1;
    select array_agg(id) into v_destinos
    from public.perfis
    where ativo and (coalesce(cardinality(v_config.whatsapp_rodizio_participantes), 0) = 0
                     or id = any (v_config.whatsapp_rodizio_participantes));
  end if;
  if v_destinos is null then
    return null;
  end if;

  v_contato := public.nome_contato_whatsapp(new.contato_id);
  select whatsapp into v_whatsapp from public.whatsapp_contatos where id = new.contato_id;
  v_hora := case
    when v_local::date = (now() at time zone 'America/Sao_Paulo')::date then 'às ' || to_char(v_local, 'HH24:MI')
    else 'em ' || to_char(v_local, 'DD/MM') || ' às ' || to_char(v_local, 'HH24:MI')
  end;
  v_previa := public.previa_mensagem_whatsapp(new.tipo, new.texto);

  v_titulo := case
    when v_atend.responsavel_id is null then format('%s está esperando na fila', v_contato)
    when v_novo and v_motivo = 'rodizio' then format('Novo cliente para você: %s', v_contato)
    when v_novo and v_motivo = 'retorno' then format('%s voltou a chamar você', v_contato)
    else format('%s mandou mensagem', v_contato)
  end;

  foreach v_destino in array v_destinos loop
    update public.notificacoes
    set quantidade = quantidade + 1,
        texto      = left('Mensagem ' || v_hora || ' · ' || v_previa, 280),
        criado_em  = now()
    where perfil_id = v_destino and atendimento_id = v_atend.id and tipo = 'whatsapp_mensagem' and lida_em is null;
    if not found then
      insert into public.notificacoes (perfil_id, tipo, atendimento_id, titulo, texto)
      values (v_destino, 'whatsapp_mensagem', v_atend.id, v_titulo, left('Mensagem ' || v_hora || ' · ' || v_previa, 280));
      v_abriu := true;
    end if;
  end loop;

  -- n8n: um evento quando a conversa ganha mensagem nova não lida (não a cada mensagem seguida).
  if v_abriu then
    select * into v_resp from public.perfis where id = v_atend.responsavel_id;
    perform public.registrar_evento('whatsapp.mensagem_recebida', 'atendimento', v_atend.id, jsonb_build_object(
      'atendimento', jsonb_build_object(
        'id', v_atend.id,
        'numero', v_atend.numero,
        'novo', v_novo,
        'motivo', case when v_novo then coalesce(v_motivo, 'fila') end,
        'caminho', '/atendimento?aba=abertos&id=' || v_atend.id
      ),
      'contato', jsonb_build_object('nome', v_contato, 'whatsapp', v_whatsapp),
      'responsavel', case when v_resp.id is not null
        then jsonb_build_object('id', v_resp.id, 'nome', v_resp.nome, 'email', v_resp.email) end,
      'mensagem', jsonb_build_object(
        'previa', v_previa,
        'tipo', new.tipo,
        'enviada_em', new.enviada_em,
        'hora', to_char(v_local, 'HH24:MI'),
        'data', to_char(v_local, 'DD/MM/YYYY')
      )
    ));
  end if;

  return null;
end;
$$;

create trigger whatsapp_mensagens_avisar
  after insert on public.whatsapp_mensagens
  for each row execute function public.avisar_mensagem_whatsapp();

-- Transferência feita por alguém → aviso para quem recebeu e evento para o n8n.
create or replace function public.avisar_transferencia_atendimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atend   public.atendimentos;
  v_contato text;
  v_autor   text;
  v_para    public.perfis;
begin
  if new.tipo <> 'transferido' or new.para_id is null or new.autor_id is null or new.autor_id = new.para_id then
    return null;
  end if;

  select * into v_atend from public.atendimentos where id = new.atendimento_id;
  select * into v_para from public.perfis where id = new.para_id;
  v_contato := public.nome_contato_whatsapp(v_atend.contato_id);
  v_autor   := coalesce((select nullif(nome, '') from public.perfis where id = new.autor_id), 'Alguém');

  if v_para.ativo then
    insert into public.notificacoes (perfil_id, tipo, atendimento_id, autor_id, titulo, texto)
    values (new.para_id, 'atendimento_transferido', new.atendimento_id, new.autor_id,
            format('%s transferiu %s para você', v_autor, v_contato), v_atend.ultima_mensagem_previa);
  end if;

  perform public.registrar_evento('atendimento.transferido', 'atendimento', new.atendimento_id, jsonb_build_object(
    'atendimento', jsonb_build_object(
      'id', v_atend.id,
      'numero', v_atend.numero,
      'caminho', '/atendimento?aba=abertos&id=' || v_atend.id
    ),
    'contato', jsonb_build_object(
      'nome', v_contato,
      'whatsapp', (select whatsapp from public.whatsapp_contatos where id = v_atend.contato_id)
    ),
    'responsavel', jsonb_build_object('id', v_para.id, 'nome', v_para.nome, 'email', v_para.email),
    'transferido_por', v_autor,
    'ultima_mensagem', v_atend.ultima_mensagem_previa
  ));

  return null;
end;
$$;

create trigger atendimento_eventos_avisar_transferencia
  after insert on public.atendimento_eventos
  for each row execute function public.avisar_transferencia_atendimento();

-- Funções de gatilho e auxiliares: só o banco chama.
revoke execute on function
  public.nome_contato_whatsapp(uuid),
  public.distribuir_atendimento(),
  public.avisar_mensagem_whatsapp(),
  public.avisar_transferencia_atendimento()
from public, anon, authenticated;
