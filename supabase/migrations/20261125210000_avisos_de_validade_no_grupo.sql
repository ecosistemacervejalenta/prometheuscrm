-- =============================================================================
-- Lotes e validades: aviso no grupo da equipe e tratativa
--
-- Pedido do dono da loja (2026-11-25): quando um lote entra em Alerta (até 30 dias),
-- Atenção (até 15) ou Crítico (até 7), avisar o grupo da equipe no WhatsApp — o mesmo grupo
-- do aviso de venda nova — com "Atenção, grupo! A cerveja X vence em N dias e precisa de uma
-- tratativa urgente." e um botão para registrar a tratativa (quem tratou, dia, hora e o que fez).
--
--   • Quem fala com o grupo é o n8n (fluxo "Cerveja Lenta - Validade dos lotes"). O CRM só
--     manda o evento pela fila de webhooks: lote.alerta_validade e lote.tratativa_registrada.
--   • Cada lote avisa uma vez por faixa (alerta → atenção → crítico). Se a validade for
--     corrigida para mais longe, a faixa volta e o aviso pode acontecer de novo.
--   • Lote esgotado (0 un.) não avisa. Vencido não gera aviso (não foi pedido).
--   • A tratativa é registrada no CRM (página /lotes/tratativa/{id}) e confirmada no grupo.
--   • Aviso e tratativa entram no histórico do produto.
-- =============================================================================

-- Liga/desliga os avisos ---------------------------------------------------------------------

alter table public.configuracoes add column lotes_aviso_grupo boolean not null default true;
comment on column public.configuracoes.lotes_aviso_grupo is 'Avisar o grupo da equipe (via n8n) quando um lote entra em Alerta, Atenção ou Crítico.';

-- Última faixa avisada de cada lote ------------------------------------------------------------

alter table public.lotes add column faixa_avisada text;
alter table public.lotes add constraint lotes_faixa_avisada_check
  check (faixa_avisada is null or faixa_avisada in ('ok', 'alerta', 'atencao', 'critico', 'vencido'));
comment on column public.lotes.faixa_avisada is 'Última faixa de validade em que o grupo foi avisado (ou para onde a validade voltou). Nulo = ainda não conferido.';

-- Peso de cada faixa: o aviso só sai quando a faixa piora.
create or replace function public.peso_faixa_validade(p_faixa text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_faixa when 'alerta' then 1 when 'atencao' then 2 when 'critico' then 3 when 'vencido' then 4 else 0 end
$$;

-- Avisos -------------------------------------------------------------------------------------

create table public.lote_alertas (
  id            uuid primary key default gen_random_uuid(),
  lote_id       uuid references public.lotes (id) on delete set null,
  cerveja_id    uuid references public.lotes_cervejas (id) on delete set null,
  olist_id      bigint,
  cerveja_nome  text not null,
  sku           text,
  lote          text not null,
  validade      date not null,
  quantidade    integer,
  faixa         text not null,
  dias          integer not null,
  teste         boolean not null default false,
  evento_id     uuid references public.eventos_integracao (id) on delete set null,
  criado_por    uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em     timestamptz not null default now(),
  constraint lote_alertas_faixa_check check (faixa in ('alerta', 'atencao', 'critico'))
);

comment on table public.lote_alertas is 'Avisos de validade mandados ao grupo da equipe (pelo n8n). teste = mensagem de teste do botão da tela.';
comment on column public.lote_alertas.dias is 'Dias que faltavam para vencer quando o aviso foi criado.';
comment on column public.lote_alertas.evento_id is 'Evento da fila de webhooks que levou o aviso ao n8n (status da entrega).';

create index lote_alertas_lote_idx on public.lote_alertas (lote_id, criado_em desc);
create index lote_alertas_criado_idx on public.lote_alertas (criado_em desc);
create index lote_alertas_sem_evento_idx on public.lote_alertas (criado_em) where evento_id is null;

-- Tratativas ---------------------------------------------------------------------------------

create table public.lote_tratativas (
  id          uuid primary key default gen_random_uuid(),
  alerta_id   uuid not null references public.lote_alertas (id) on delete cascade,
  autor_id    uuid not null references public.perfis (id) on delete restrict default auth.uid(),
  texto       text not null,
  evento_id   uuid references public.eventos_integracao (id) on delete set null,
  criado_em   timestamptz not null default now(),
  constraint lote_tratativas_texto_check check (length(btrim(texto)) between 3 and 2000)
);

comment on table public.lote_tratativas is 'O que a equipe fez para não perder o lote avisado no grupo (quem, quando e o quê).';

create index lote_tratativas_alerta_idx on public.lote_tratativas (alerta_id, criado_em);

-- Histórico do produto: aviso e tratativa ------------------------------------------------------

alter table public.lote_movimentos drop constraint lote_movimentos_tipo_check;
alter table public.lote_movimentos add constraint lote_movimentos_tipo_check check (tipo in (
  'cadastro', 'ajuste', 'edicao', 'baixa_olist', 'exclusao',
  'leitura_olist', 'falha_leitura', 'cerveja_cadastrada', 'cerveja_atualizada', 'cerveja_removida',
  'alerta_grupo', 'tratativa'
));

create or replace function public.registrar_tratativa_no_historico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alerta public.lote_alertas;
begin
  select * into v_alerta from public.lote_alertas where id = new.alerta_id;
  if v_alerta.teste then
    return null;
  end if;
  insert into public.lote_movimentos (cerveja_id, olist_id, sku, lote_id, lote, tipo, origem, autor_id, detalhes)
  values (v_alerta.cerveja_id, v_alerta.olist_id, v_alerta.sku, v_alerta.lote_id, v_alerta.lote, 'tratativa', 'manual', new.autor_id,
          jsonb_build_object('texto', new.texto, 'alerta_id', v_alerta.id, 'faixa', v_alerta.faixa, 'validade', v_alerta.validade,
                             'dias_no_aviso', v_alerta.dias));
  return null;
end;
$$;

create trigger lote_tratativas_historico
  after insert on public.lote_tratativas
  for each row execute function public.registrar_tratativa_no_historico();

-- Geração dos avisos (rotina) ------------------------------------------------------------------

/**
 * Confere a validade de todos os lotes com unidades e cria um aviso para cada lote que entrou
 * numa faixa pior (alerta → atenção → crítico). Devolve os avisos criados (a rotina manda ao
 * n8n). Hoje = data de Brasília.
 */
create or replace function public.gerar_alertas_de_validade()
returns setof public.lote_alertas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_lote    record;
  v_dias    integer;
  v_faixa   text;
  v_alerta  public.lote_alertas;
begin
  if not coalesce((select lotes_aviso_grupo from public.configuracoes where id = 1), true) then
    return;
  end if;

  for v_lote in
    select l.id, l.lote, l.validade, l.quantidade, l.faixa_avisada, l.cerveja_id, c.nome, c.sku, c.olist_id
    from public.lotes l
    join public.lotes_cervejas c on c.id = l.cerveja_id
    where coalesce(l.quantidade, 1) > 0
    for update of l
  loop
    v_dias := v_lote.validade - v_hoje;
    v_faixa := case when v_dias < 0 then 'vencido' when v_dias <= 7 then 'critico' when v_dias <= 15 then 'atencao'
                    when v_dias <= 30 then 'alerta' else 'ok' end;

    if public.peso_faixa_validade(v_faixa) > public.peso_faixa_validade(coalesce(v_lote.faixa_avisada, 'ok')) then
      update public.lotes set faixa_avisada = v_faixa where id = v_lote.id;
      if v_faixa in ('alerta', 'atencao', 'critico') then
        insert into public.lote_alertas (lote_id, cerveja_id, olist_id, cerveja_nome, sku, lote, validade, quantidade, faixa, dias, criado_por)
        values (v_lote.id, v_lote.cerveja_id, v_lote.olist_id, v_lote.nome, v_lote.sku, v_lote.lote, v_lote.validade, v_lote.quantidade,
                v_faixa, v_dias, null)
        returning * into v_alerta;

        insert into public.lote_movimentos (cerveja_id, olist_id, sku, lote_id, lote, tipo, saldo, origem, detalhes)
        values (v_lote.cerveja_id, v_lote.olist_id, v_lote.sku, v_lote.id, v_lote.lote, 'alerta_grupo', v_lote.quantidade, 'rotina',
                jsonb_build_object('alerta_id', v_alerta.id, 'faixa', v_faixa, 'dias', v_dias, 'validade', v_lote.validade));
        return next v_alerta;
      end if;
    elsif v_faixa is distinct from coalesce(v_lote.faixa_avisada, 'ok') then
      -- A validade foi corrigida para mais longe: a faixa volta e o aviso pode sair de novo.
      update public.lotes set faixa_avisada = v_faixa where id = v_lote.id;
    end if;
  end loop;
end;
$$;

-- Manda o aviso/tratativa para a fila de webhooks (o n8n recebe e posta no grupo).
create or replace function public.enfileirar_aviso_lote(p_tipo text, p_alerta_id uuid, p_tratativa_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote_id uuid;
  v_evento  uuid;
begin
  -- Equipe (tela) ou a rotina (service role, sem usuário).
  if auth.uid() is not null and not public.eh_membro_equipe() then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  if p_tipo not in ('lote.alerta_validade', 'lote.tratativa_registrada') then
    raise exception 'Tipo de aviso inválido.' using errcode = 'P0001';
  end if;
  select lote_id into v_lote_id from public.lote_alertas where id = p_alerta_id;
  if not found then
    raise exception 'Aviso não encontrado.' using errcode = 'P0001';
  end if;

  v_evento := public.registrar_evento(p_tipo, 'lote', v_lote_id, p_payload);
  if p_tratativa_id is not null then
    update public.lote_tratativas set evento_id = v_evento where id = p_tratativa_id and alerta_id = p_alerta_id;
  else
    update public.lote_alertas set evento_id = v_evento where id = p_alerta_id;
  end if;
  return v_evento;
end;
$$;

-- Webhook do n8n que recebe os avisos ------------------------------------------------------

insert into public.webhooks (nome, url, eventos)
select 'n8n · validade dos lotes (grupo da equipe)',
       'https://n8n-4kwf.srv1854385.hstgr.cloud/webhook/63783f4f-f3a6-493e-82f0-3cd4ade35227/crm-lotes-validade',
       array['lote.alerta_validade', 'lote.tratativa_registrada']
where not exists (
  select 1 from public.webhooks
  where url = 'https://n8n-4kwf.srv1854385.hstgr.cloud/webhook/63783f4f-f3a6-493e-82f0-3cd4ade35227/crm-lotes-validade'
);

-- Segurança ----------------------------------------------------------------------------------

alter table public.lote_alertas enable row level security;
alter table public.lote_tratativas enable row level security;

create policy "Equipe vê os avisos dos lotes"
  on public.lote_alertas for select to authenticated
  using ((select public.eh_membro_equipe()));

-- Pela tela só nasce o aviso de teste; os de verdade vêm da rotina.
create policy "Equipe cria aviso de teste"
  on public.lote_alertas for insert to authenticated
  with check ((select public.eh_membro_equipe()) and teste and criado_por = (select auth.uid()));

create policy "Equipe vê as tratativas"
  on public.lote_tratativas for select to authenticated
  using ((select public.eh_membro_equipe()));

create policy "Equipe registra tratativa em nome próprio"
  on public.lote_tratativas for insert to authenticated
  with check ((select public.eh_membro_equipe()) and autor_id = (select auth.uid()));

revoke all on public.lote_alertas, public.lote_tratativas from anon, authenticated;
grant select, insert on public.lote_alertas, public.lote_tratativas to authenticated;
grant select, insert, update, delete on public.lote_alertas, public.lote_tratativas to service_role;

revoke all on function public.gerar_alertas_de_validade(), public.enfileirar_aviso_lote(text, uuid, uuid, jsonb),
  public.registrar_tratativa_no_historico()
  from public, anon, authenticated;
grant execute on function public.gerar_alertas_de_validade() to service_role;
grant execute on function public.enfileirar_aviso_lote(text, uuid, uuid, jsonb) to authenticated, service_role;
