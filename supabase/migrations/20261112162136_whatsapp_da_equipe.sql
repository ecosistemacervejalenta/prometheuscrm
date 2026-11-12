-- =============================================================================
-- PROMETHEUS CRM · EQUIPE — WHATSAPP PESSOAL DE CADA MEMBRO
--   perfis.whatsapp: número pessoal (canônico) de quem atende. Usado para:
--     • o n8n avisar o atendente no WhatsApp pessoal (vai no evento, em
--       responsavel.whatsapp) — nenhum telefone fica fixo no n8n;
--     • o Atendimento ignorar conversas do número da loja com a própria equipe
--       (o aviso enviado ao atendente não vira cliente nem entra no rodízio).
-- =============================================================================

alter table public.perfis add column whatsapp text;

comment on column public.perfis.whatsapp is
  'WhatsApp pessoal (5511987654321). Recebe os avisos do n8n; conversas com este número não entram no Atendimento.';

create index perfis_whatsapp_idx on public.perfis (whatsapp) where whatsapp is not null;

create or replace function public.normalizar_whatsapp_perfil()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.whatsapp := nullif(public.whatsapp_canonico(new.whatsapp), '');
  return new;
end;
$$;

create trigger perfis_normalizar_whatsapp
  before insert or update of whatsapp on public.perfis
  for each row execute function public.normalizar_whatsapp_perfil();

-- Eventos para o n8n passam a levar o WhatsApp de quem recebeu o atendimento.

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
        then jsonb_build_object('id', v_resp.id, 'nome', v_resp.nome, 'email', v_resp.email, 'whatsapp', v_resp.whatsapp) end,
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
    'responsavel', jsonb_build_object('id', v_para.id, 'nome', v_para.nome, 'email', v_para.email, 'whatsapp', v_para.whatsapp),
    'transferido_por', v_autor,
    'ultima_mensagem', v_atend.ultima_mensagem_previa
  ));

  return null;
end;
$$;
