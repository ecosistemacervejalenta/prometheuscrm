-- =============================================================================
-- PROMETHEUS CRM · CAMPANHAS — "CONVERSAR" PELO WHATSAPP DA LOJA
--   O número das campanhas (API oficial) só dispara. Quem responde é chamado
--   pelo WhatsApp de atendimento da loja (uazapi): o botão "Conversar" da página
--   da campanha abre (ou reaproveita) a conversa no Atendimento, com quem clicou
--   como responsável, e o CRM envia a mensagem com a última resposta do cliente
--   para ele saber por que está sendo chamado.
--   campanha_envios guarda quem chamou e quando (a tela troca "Conversar" por
--   "Ver conversa" e a equipe não chama o mesmo cliente duas vezes).
-- =============================================================================

alter table public.campanha_envios
  add column conversa_atendimento_id uuid references public.atendimentos (id) on delete set null,
  add column conversa_por            uuid references public.perfis (id) on delete set null,
  add column conversa_em             timestamptz;

comment on column public.campanha_envios.conversa_atendimento_id is 'Conversa do Atendimento (WhatsApp da loja) aberta pelo botão "Conversar" da resposta.';
comment on column public.campanha_envios.conversa_por is 'Quem da equipe chamou o cliente pelo WhatsApp da loja.';
comment on column public.campanha_envios.conversa_em is 'Quando o cliente foi chamado pelo WhatsApp da loja.';

create index campanha_envios_conversa_idx on public.campanha_envios (conversa_atendimento_id) where conversa_atendimento_id is not null;

-- Abre a conversa do Atendimento para quem respondeu a campanha.
--   • Número que já conversa com a loja → mesmo contato (e o atendimento aberto, se houver).
--   • Número novo → contato com o JID conferido na uazapi (p_chatid), já que o WhatsApp
--     pode registrar o celular sem o 9º dígito.
--   • Sem atendimento aberto → nasce com quem clicou (fora do rodízio); aberto sem
--     responsável → quem clicou assume; com outra pessoa → continua com ela.
--   • Na primeira vez, uma nota interna registra a campanha e a resposta.
-- O envio da mensagem é feito depois, pelo preparar_envio_whatsapp de sempre.
create or replace function public.abrir_conversa_campanha(p_envio_id bigint, p_chatid text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_eu             uuid := auth.uid();
  v_envio          public.campanha_envios;
  v_campanha       text;
  v_contato        public.whatsapp_contatos;
  v_atend          public.atendimentos;
  v_local          timestamp;
begin
  if v_eu is null then
    raise exception 'Faça login para conversar com o cliente.';
  end if;

  select * into v_envio from public.campanha_envios where id = p_envio_id for update;
  if not found then
    raise exception 'Resposta não encontrada.';
  end if;
  if v_envio.respondida_em is null then
    raise exception 'Este contato ainda não respondeu à campanha.';
  end if;
  if exists (select 1 from public.perfis where whatsapp = v_envio.whatsapp) then
    raise exception 'Este número é de alguém da equipe — o Atendimento não abre conversa com ele.';
  end if;

  select * into v_contato
  from public.whatsapp_contatos
  where whatsapp = v_envio.whatsapp
  order by atualizado_em desc
  limit 1;

  if v_contato.id is null then
    if coalesce(p_chatid, '') !~ '^[0-9]{8,15}@s\.whatsapp\.net$' then
      raise exception 'Não foi possível achar este número no WhatsApp.';
    end if;
    -- Mesma trava do registrar_mensagem_whatsapp: o webhook não cria a conversa em paralelo.
    perform pg_advisory_xact_lock(hashtext('whatsapp:' || p_chatid));
    insert into public.whatsapp_contatos (chatid, whatsapp, nome)
    values (
      p_chatid,
      v_envio.whatsapp,
      -- Nome da lista da campanha só quando o número não é de um cliente cadastrado.
      case when not exists (select 1 from public.clientes c where c.whatsapp = v_envio.whatsapp) then v_envio.nome end
    )
    on conflict (chatid) do update
      set whatsapp = coalesce(public.whatsapp_contatos.whatsapp, excluded.whatsapp)
    returning * into v_contato;
  else
    perform pg_advisory_xact_lock(hashtext('whatsapp:' || v_contato.chatid));
  end if;

  select * into v_atend
  from public.atendimentos
  where contato_id = v_contato.id and status <> 'resolvido'
  for update;

  if v_atend.id is null then
    -- Com responsável já definido, o rodízio (distribuir_atendimento) não mexe.
    insert into public.atendimentos (contato_id, status, responsavel_id, ultima_mensagem_em)
    values (v_contato.id, 'em_atendimento', v_eu, now())
    returning * into v_atend;
    insert into public.atendimento_eventos (atendimento_id, tipo, autor_id) values (v_atend.id, 'aberto', v_eu);
  elsif v_atend.responsavel_id is null then
    update public.atendimentos set responsavel_id = v_eu, status = 'em_atendimento' where id = v_atend.id;
    insert into public.atendimento_eventos (atendimento_id, tipo, autor_id, para_id)
    values (v_atend.id, 'assumido', v_eu, v_eu);
  end if;

  if v_envio.conversa_em is null then
    select nome into v_campanha from public.campanhas where id = v_envio.campanha_id;
    v_local := v_envio.respondida_em at time zone 'America/Sao_Paulo';
    -- clock_timestamp: a nota fica depois do "Atendimento aberto" na linha do tempo.
    insert into public.atendimento_eventos (atendimento_id, tipo, autor_id, texto, criado_em)
    values (
      v_atend.id, 'nota', v_eu,
      left(format('Respondeu à campanha “%s” em %s: “%s”',
                  coalesce(v_campanha, 'sem nome'),
                  to_char(v_local, 'DD/MM "às" HH24:MI'),
                  coalesce(v_envio.resposta, '—')), 4000),
      clock_timestamp()
    );
  end if;

  update public.campanha_envios
  set conversa_atendimento_id = v_atend.id,
      conversa_por            = v_eu,
      conversa_em             = now()
  where id = v_envio.id;

  return jsonb_build_object(
    'atendimento_id', v_atend.id,
    'contato_id', v_contato.id,
    'chatid', v_contato.chatid,
    'campanha_id', v_envio.campanha_id
  );
end;
$$;

revoke execute on function public.abrir_conversa_campanha(bigint, text) from public, anon;
grant execute on function public.abrir_conversa_campanha(bigint, text) to authenticated, service_role;
