-- =============================================================================
-- PROMETHEUS CRM · 13 · ATENDIMENTO WHATSAPP — ENVIO DE MÍDIA
--   A equipe envia fotos, prints, vídeos, documentos, arquivos de áudio e
--   mensagens de voz gravadas no navegador. O arquivo é enviado pelo navegador
--   direto para o bucket privado "whatsapp" (em <contato_id>/envios/...) e a
--   uazapi o busca por um link assinado temporário.
--   preparar_envio_whatsapp ganha o parâmetro opcional p_midia (as chamadas só
--   com texto continuam iguais).
-- =============================================================================

drop function public.preparar_envio_whatsapp(uuid, text);

-- p_midia = { tipo: imagem|video|audio|documento, path, mime, nome, segundos }
-- (nome nulo em áudio = mensagem de voz gravada; com nome = arquivo de áudio).
create function public.preparar_envio_whatsapp(p_atendimento_id uuid, p_texto text, p_midia jsonb default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_eu     uuid := auth.uid();
  v_texto  text := nullif(trim(coalesce(p_texto, '')), '');
  v_tipo   text := coalesce(nullif(p_midia->>'tipo', ''), 'texto');
  v_path   text := nullif(p_midia->>'path', '');
  v_atend  public.atendimentos;
  v_chatid text;
  v_msg_id uuid;
begin
  if v_eu is null then
    raise exception 'Faça login para enviar mensagens.';
  end if;
  if v_tipo not in ('texto', 'imagem', 'video', 'audio', 'documento') then
    raise exception 'Tipo de arquivo não suportado.';
  end if;
  if v_tipo = 'texto' and v_texto is null then
    raise exception 'Escreva a mensagem.';
  end if;
  if v_tipo <> 'texto' and v_path is null then
    raise exception 'O arquivo não foi enviado. Tente anexar de novo.';
  end if;
  if length(coalesce(v_texto, '')) > 4096 then
    raise exception 'Mensagem longa demais (máximo de 4.096 caracteres).';
  end if;

  select * into v_atend from public.atendimentos where id = p_atendimento_id for update;
  if not found then
    raise exception 'Atendimento não encontrado.';
  end if;
  if v_atend.status = 'resolvido' then
    raise exception 'Este atendimento já foi resolvido. Reabra para responder.';
  end if;
  if v_tipo <> 'texto' and v_path not like v_atend.contato_id::text || '/envios/%' then
    raise exception 'Arquivo inválido para esta conversa.';
  end if;
  select chatid into v_chatid from public.whatsapp_contatos where id = v_atend.contato_id;

  -- Responder um atendimento sem responsável é assumi-lo.
  if v_atend.responsavel_id is null then
    update public.atendimentos set responsavel_id = v_eu, status = 'em_atendimento' where id = v_atend.id;
    insert into public.atendimento_eventos (atendimento_id, tipo, autor_id, para_id)
    values (v_atend.id, 'assumido', v_eu, v_eu);
  end if;

  insert into public.whatsapp_mensagens (
    contato_id, atendimento_id, direcao, tipo, texto,
    midia_path, midia_mime, midia_nome, midia_segundos, midia_status,
    status, enviada_por, enviada_em
  )
  values (
    v_atend.contato_id, v_atend.id, 'saida', v_tipo, v_texto,
    v_path, nullif(p_midia->>'mime', ''), nullif(p_midia->>'nome', ''),
    nullif(p_midia->>'segundos', '')::integer, case when v_tipo <> 'texto' then 'pronta' end,
    'enviando', v_eu, clock_timestamp()
  )
  returning id into v_msg_id;

  update public.atendimentos
  set ultima_mensagem_em      = now(),
      ultima_mensagem_previa  = public.previa_mensagem_whatsapp(v_tipo, v_texto),
      ultima_mensagem_direcao = 'saida',
      nao_lidas               = 0,
      primeira_resposta_em    = coalesce(primeira_resposta_em, now())
  where id = v_atend.id;

  return jsonb_build_object('mensagem_id', v_msg_id, 'chatid', v_chatid);
end;
$$;

revoke execute on function public.preparar_envio_whatsapp(uuid, text, jsonb) from public, anon;
grant execute on function public.preparar_envio_whatsapp(uuid, text, jsonb) to authenticated, service_role;
