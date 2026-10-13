-- =============================================================================
-- PROMETHEUS CRM · TAREFAS INTERNAS
--   Quadro de demandas da equipe: A fazer → Fazendo → Concluída.
--   • Cada tarefa tem prazo (data e hora), prioridade e um ou mais responsáveis
--     (membros da equipe com login no CRM).
--   • Impedimento: quando algo trava a tarefa, a equipe registra o MOTIVO; a
--     tarefa fica marcada como impedida até alguém resolver.
--   • Anexos: imagens (fotos, prints) no bucket privado "tarefas", em
--     <tarefa_id>/<arquivo>. O navegador sobe o arquivo e o servidor registra.
--   • Histórico: tudo o que muda na tarefa (status, prazo, prioridade,
--     responsáveis, anexos, impedimentos) é registrado por gatilho, venha a
--     mudança de qualquer tela. Comentários entram no mesmo histórico.
--   • Notificações: quem é marcado como responsável recebe um aviso no próprio
--     login (sino do menu). Comentários, impedimentos, mudança de prazo e
--     conclusão também avisam os envolvidos — nunca quem fez a ação.
-- =============================================================================

create type public.status_tarefa as enum ('a_fazer', 'fazendo', 'concluida');
create type public.prioridade_tarefa as enum ('baixa', 'media', 'alta', 'urgente');

-- Tarefas --------------------------------------------------------------------------

create table public.tarefas (
  id             uuid primary key default gen_random_uuid(),
  numero         integer generated always as identity unique,
  titulo         text not null,
  descricao      text,
  status         public.status_tarefa not null default 'a_fazer',
  prioridade     public.prioridade_tarefa not null default 'media',
  prazo          timestamptz,
  impedimento    text,
  impedida_em    timestamptz,
  impedida_por   uuid references public.perfis (id) on delete set null,
  concluida_em   timestamptz,
  criado_por     uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint tarefas_titulo_check check (length(titulo) between 1 and 160),
  constraint tarefas_descricao_check check (descricao is null or length(descricao) <= 10000),
  constraint tarefas_impedimento_check check (impedimento is null or length(impedimento) between 1 and 2000)
);

comment on table public.tarefas is 'Demandas internas da equipe (quadro A fazer / Fazendo / Concluída).';
comment on column public.tarefas.prazo is 'Data e hora de entrega (nulo = sem prazo).';
comment on column public.tarefas.impedimento is 'Motivo do impedimento atual (nulo = tarefa andando normalmente).';

create index tarefas_status_idx on public.tarefas (status, prioridade desc, prazo);
create index tarefas_concluida_em_idx on public.tarefas (concluida_em desc) where status = 'concluida';

create trigger tarefas_atualizado_em
  before update on public.tarefas
  for each row execute function public.definir_atualizado_em();

-- Normaliza textos e mantém as datas de conclusão e de impedimento coerentes.
create or replace function public.preparar_tarefa()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_concluiu   boolean;
  v_novo_motivo boolean;
begin
  new.titulo      := regexp_replace(trim(coalesce(new.titulo, '')), '\s+', ' ', 'g');
  new.descricao   := nullif(trim(coalesce(new.descricao, '')), '');
  new.impedimento := nullif(trim(coalesce(new.impedimento, '')), '');

  if tg_op = 'INSERT' then
    new.criado_por := coalesce(auth.uid(), new.criado_por);
    v_concluiu     := new.status = 'concluida';
    v_novo_motivo  := new.impedimento is not null;
  else
    v_concluiu     := new.status = 'concluida' and old.status <> 'concluida';
    v_novo_motivo  := new.impedimento is distinct from old.impedimento;
  end if;

  -- Concluir tira o impedimento (tarefa entregue não está travada).
  if new.status = 'concluida' then
    new.impedimento := null;
    if v_concluiu then
      new.concluida_em := now();
    end if;
  else
    new.concluida_em := null;
  end if;

  if new.impedimento is null then
    new.impedida_em  := null;
    new.impedida_por := null;
  elsif v_novo_motivo then
    new.impedida_em  := now();
    new.impedida_por := auth.uid();
  end if;

  return new;
end;
$$;

create trigger tarefas_preparar
  before insert or update on public.tarefas
  for each row execute function public.preparar_tarefa();

-- Responsáveis -----------------------------------------------------------------------

create table public.tarefa_responsaveis (
  tarefa_id       uuid not null references public.tarefas (id) on delete cascade,
  perfil_id       uuid not null references public.perfis (id) on delete cascade,
  adicionado_por  uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em       timestamptz not null default now(),
  primary key (tarefa_id, perfil_id)
);

comment on table public.tarefa_responsaveis is 'Quem cuida de cada tarefa (um ou mais membros da equipe).';

create index tarefa_responsaveis_perfil_idx on public.tarefa_responsaveis (perfil_id);

-- Só membros ativos podem ser marcados.
create or replace function public.validar_responsavel_tarefa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.perfis where id = new.perfil_id and ativo) then
    raise exception 'Este membro está sem acesso ao CRM e não pode ser responsável.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger tarefa_responsaveis_validar
  before insert on public.tarefa_responsaveis
  for each row execute function public.validar_responsavel_tarefa();

-- Anexos (imagens) -------------------------------------------------------------------

create table public.tarefa_anexos (
  id           uuid primary key default gen_random_uuid(),
  tarefa_id    uuid not null references public.tarefas (id) on delete cascade,
  path         text not null unique,
  nome         text not null,
  mime         text not null,
  tamanho      integer not null,
  largura      integer,
  altura       integer,
  enviado_por  uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em    timestamptz not null default now(),
  constraint tarefa_anexos_path_check check (path like tarefa_id::text || '/%'),
  constraint tarefa_anexos_nome_check check (length(nome) between 1 and 200),
  constraint tarefa_anexos_mime_check check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  constraint tarefa_anexos_tamanho_check check (tamanho between 1 and 10485760)
);

comment on table public.tarefa_anexos is 'Imagens anexadas à tarefa. O arquivo fica no bucket privado "tarefas" (path = <tarefa_id>/<arquivo>).';

create index tarefa_anexos_tarefa_idx on public.tarefa_anexos (tarefa_id, criado_em);

create or replace function public.limitar_anexos_tarefa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.tarefa_anexos where tarefa_id = new.tarefa_id) >= 30 then
    raise exception 'Cada tarefa aceita no máximo 30 imagens.' using errcode = 'P0001';
  end if;
  new.enviado_por := coalesce(auth.uid(), new.enviado_por);
  return new;
end;
$$;

create trigger tarefa_anexos_limitar
  before insert on public.tarefa_anexos
  for each row execute function public.limitar_anexos_tarefa();

-- Histórico ---------------------------------------------------------------------------

create table public.tarefa_eventos (
  id         uuid primary key default gen_random_uuid(),
  tarefa_id  uuid not null references public.tarefas (id) on delete cascade,
  tipo       text not null,
  autor_id   uuid references public.perfis (id) on delete set null default auth.uid(),
  texto      text,
  dados      jsonb not null default '{}',
  criado_em  timestamptz not null default clock_timestamp(),
  constraint tarefa_eventos_tipo_check check (tipo in (
    'criada', 'comentario', 'status', 'prioridade', 'prazo', 'editada',
    'responsavel_adicionado', 'responsavel_removido', 'anexo_adicionado', 'anexo_removido',
    'impedimento', 'impedimento_resolvido'
  )),
  constraint tarefa_eventos_texto_check check (texto is null or length(texto) between 1 and 4000)
);

comment on table public.tarefa_eventos is 'Histórico da tarefa: comentários da equipe + registros automáticos de cada mudança.';
comment on column public.tarefa_eventos.dados is 'Detalhes do registro automático: {de, para} (status, prioridade, prazo), {perfil_id, nome} (responsável), {nome} (anexo), {motivo} (impedimento resolvido), {campos, titulo_anterior} (editada).';

create index tarefa_eventos_tarefa_idx on public.tarefa_eventos (tarefa_id, criado_em);

-- Registros automáticos. security definer: a equipe só insere comentários direto.
create or replace function public.registrar_evento_tarefa(p_tarefa_id uuid, p_tipo text, p_texto text default null, p_dados jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.tarefa_eventos (tarefa_id, tipo, texto, dados)
  select p_tarefa_id, p_tipo, nullif(left(p_texto, 4000), ''), coalesce(p_dados, '{}')
  where exists (select 1 from public.tarefas where id = p_tarefa_id); -- tarefa sendo excluída: nada a registrar
$$;

create or replace function public.historico_tarefa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campos text[] := '{}';
begin
  if tg_op = 'INSERT' then
    perform public.registrar_evento_tarefa(new.id, 'criada');
    if new.impedimento is not null then
      perform public.registrar_evento_tarefa(new.id, 'impedimento', new.impedimento);
    end if;
    return null;
  end if;

  if new.status is distinct from old.status then
    perform public.registrar_evento_tarefa(new.id, 'status', null, jsonb_build_object('de', old.status, 'para', new.status));
  end if;
  if new.prioridade is distinct from old.prioridade then
    perform public.registrar_evento_tarefa(new.id, 'prioridade', null, jsonb_build_object('de', old.prioridade, 'para', new.prioridade));
  end if;
  if new.prazo is distinct from old.prazo then
    perform public.registrar_evento_tarefa(new.id, 'prazo', null, jsonb_build_object('de', old.prazo, 'para', new.prazo));
  end if;

  if new.titulo is distinct from old.titulo then
    v_campos := v_campos || 'titulo';
  end if;
  if new.descricao is distinct from old.descricao then
    v_campos := v_campos || 'descricao';
  end if;
  if cardinality(v_campos) > 0 then
    perform public.registrar_evento_tarefa(new.id, 'editada', null,
      jsonb_build_object('campos', to_jsonb(v_campos), 'titulo_anterior', case when 'titulo' = any (v_campos) then old.titulo end));
  end if;

  if new.impedimento is not null and new.impedimento is distinct from old.impedimento then
    perform public.registrar_evento_tarefa(new.id, 'impedimento', new.impedimento);
  elsif new.impedimento is null and old.impedimento is not null and new.status <> 'concluida' then
    -- Ao concluir, o impedimento sai junto (o registro de status já conta a história).
    perform public.registrar_evento_tarefa(new.id, 'impedimento_resolvido', null, jsonb_build_object('motivo', old.impedimento));
  end if;

  return null;
end;
$$;

create trigger tarefas_historico
  after insert or update on public.tarefas
  for each row execute function public.historico_tarefa();

create or replace function public.historico_responsavel_tarefa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linha public.tarefa_responsaveis;
begin
  if tg_op = 'INSERT' then
    v_linha := new;
  else
    v_linha := old;
  end if;
  perform public.registrar_evento_tarefa(
    v_linha.tarefa_id,
    case when tg_op = 'INSERT' then 'responsavel_adicionado' else 'responsavel_removido' end,
    null,
    jsonb_build_object('perfil_id', v_linha.perfil_id, 'nome', (select nome from public.perfis where id = v_linha.perfil_id))
  );
  return null;
end;
$$;

create trigger tarefa_responsaveis_historico
  after insert or delete on public.tarefa_responsaveis
  for each row execute function public.historico_responsavel_tarefa();

create or replace function public.historico_anexo_tarefa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linha public.tarefa_anexos;
begin
  if tg_op = 'INSERT' then
    v_linha := new;
  else
    v_linha := old;
  end if;
  perform public.registrar_evento_tarefa(
    v_linha.tarefa_id,
    case when tg_op = 'INSERT' then 'anexo_adicionado' else 'anexo_removido' end,
    null,
    jsonb_build_object('nome', v_linha.nome)
  );
  return null;
end;
$$;

create trigger tarefa_anexos_historico
  after insert or delete on public.tarefa_anexos
  for each row execute function public.historico_anexo_tarefa();

-- Notificações ---------------------------------------------------------------------------

create table public.notificacoes (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references public.perfis (id) on delete cascade,
  tipo       text not null,
  tarefa_id  uuid references public.tarefas (id) on delete cascade,
  autor_id   uuid references public.perfis (id) on delete set null,
  titulo     text not null,
  texto      text,
  lida_em    timestamptz,
  criado_em  timestamptz not null default now(),
  constraint notificacoes_tipo_check check (tipo in (
    'tarefa_atribuida', 'tarefa_comentario', 'tarefa_impedida', 'tarefa_desimpedida', 'tarefa_prazo', 'tarefa_concluida'
  ))
);

comment on table public.notificacoes is 'Avisos para cada membro da equipe (sino do menu). Criados pelo banco; o membro só marca como lido.';

create index notificacoes_perfil_idx on public.notificacoes (perfil_id, criado_em desc);
create index notificacoes_nao_lidas_idx on public.notificacoes (perfil_id) where lida_em is null;
create index notificacoes_tarefa_idx on public.notificacoes (tarefa_id);

-- A cada registro do histórico, avisa os envolvidos (menos quem fez a ação).
--   responsável adicionado → a pessoa marcada
--   comentário, impedimento, impedimento resolvido, conclusão → responsáveis + quem criou
--   prazo alterado → responsáveis
create or replace function public.notificar_evento_tarefa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autor    text := coalesce((select nullif(nome, '') from public.perfis where id = new.autor_id), 'Alguém');
  v_tarefa   public.tarefas;
  v_tipo     text;
  v_titulo   text;
  v_texto    text;
  v_destinos uuid[];
  v_prazo    timestamptz;
begin
  select * into v_tarefa from public.tarefas where id = new.tarefa_id;
  if not found then
    return null;
  end if;

  case new.tipo
    when 'responsavel_adicionado' then
      v_tipo     := 'tarefa_atribuida';
      v_titulo   := format('%s marcou você na tarefa #%s', v_autor, v_tarefa.numero);
      v_destinos := array[(new.dados ->> 'perfil_id')::uuid];
    when 'comentario' then
      v_tipo   := 'tarefa_comentario';
      v_titulo := format('%s comentou na tarefa #%s', v_autor, v_tarefa.numero);
      v_texto  := new.texto;
    when 'impedimento' then
      v_tipo   := 'tarefa_impedida';
      v_titulo := format('%s registrou um impedimento na tarefa #%s', v_autor, v_tarefa.numero);
      v_texto  := new.texto;
    when 'impedimento_resolvido' then
      v_tipo   := 'tarefa_desimpedida';
      v_titulo := format('%s resolveu o impedimento da tarefa #%s', v_autor, v_tarefa.numero);
    when 'prazo' then
      v_tipo   := 'tarefa_prazo';
      v_prazo  := (new.dados ->> 'para')::timestamptz;
      v_titulo := format(case when v_prazo is null then '%s tirou o prazo da tarefa #%s' else '%s mudou o prazo da tarefa #%s' end, v_autor, v_tarefa.numero);
      v_texto  := case when v_prazo is not null
        then 'Novo prazo: ' || to_char(v_prazo at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') end;
      select array_agg(perfil_id) into v_destinos from public.tarefa_responsaveis where tarefa_id = new.tarefa_id;
    when 'status' then
      if new.dados ->> 'para' <> 'concluida' then
        return null;
      end if;
      v_tipo   := 'tarefa_concluida';
      v_titulo := format('%s concluiu a tarefa #%s', v_autor, v_tarefa.numero);
    else
      return null;
  end case;

  if v_destinos is null then
    select array_agg(distinct d) into v_destinos
    from (
      select perfil_id as d from public.tarefa_responsaveis where tarefa_id = new.tarefa_id
      union
      select v_tarefa.criado_por
    ) as envolvidos
    where d is not null;
  end if;

  insert into public.notificacoes (perfil_id, tipo, tarefa_id, autor_id, titulo, texto)
  select p.id, v_tipo, new.tarefa_id, new.autor_id, v_titulo, left(v_texto, 280)
  from public.perfis p
  where p.id = any (v_destinos)
    and p.ativo
    and p.id is distinct from new.autor_id;

  return null;
end;
$$;

create trigger tarefa_eventos_notificar
  after insert on public.tarefa_eventos
  for each row execute function public.notificar_evento_tarefa();

-- Criação atômica: tarefa + responsáveis numa só transação ------------------------------

-- p_dados = { titulo, descricao, prioridade, prazo, status }. Devolve { id, numero }.
create or replace function public.criar_tarefa(p_dados jsonb, p_responsaveis uuid[])
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_tarefa public.tarefas;
begin
  if not public.eh_membro_equipe() then
    raise exception 'Faça login com um usuário da equipe.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_responsaveis), 0) = 0 then
    raise exception 'Marque pelo menos um responsável.' using errcode = 'P0001';
  end if;

  insert into public.tarefas (titulo, descricao, prioridade, prazo, status)
  values (
    p_dados ->> 'titulo',
    p_dados ->> 'descricao',
    coalesce(nullif(p_dados ->> 'prioridade', ''), 'media')::public.prioridade_tarefa,
    nullif(p_dados ->> 'prazo', '')::timestamptz,
    coalesce(nullif(p_dados ->> 'status', ''), 'a_fazer')::public.status_tarefa
  )
  returning * into v_tarefa;

  insert into public.tarefa_responsaveis (tarefa_id, perfil_id)
  select distinct v_tarefa.id, r from unnest(p_responsaveis) as r where r is not null;

  return jsonb_build_object('id', v_tarefa.id, 'numero', v_tarefa.numero);
end;
$$;

-- Visão do quadro ---------------------------------------------------------------------------

create or replace view public.vw_tarefas
with (security_invoker = true)
as
select
  t.*,
  c.nome  as criado_por_nome,
  ip.nome as impedida_por_nome,
  coalesce(r.lista, '[]'::jsonb) as responsaveis,
  coalesce(r.ids, '{}'::uuid[])  as responsaveis_ids,
  coalesce(a.total, 0) as anexos,
  coalesce(e.total, 0) as comentarios,
  (t.status <> 'concluida' and t.prazo is not null and t.prazo < now()) as atrasada,
  lower(concat_ws(' ', '#' || t.numero, t.titulo, t.descricao, t.impedimento, r.nomes)) as busca
from public.tarefas t
left join public.perfis c  on c.id = t.criado_por
left join public.perfis ip on ip.id = t.impedida_por
left join lateral (
  select
    jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome) order by tr.criado_em, p.nome) as lista,
    array_agg(p.id order by tr.criado_em, p.nome) as ids,
    string_agg(p.nome, ' ') as nomes
  from public.tarefa_responsaveis tr
  join public.perfis p on p.id = tr.perfil_id
  where tr.tarefa_id = t.id
) r on true
left join lateral (select count(*)::integer as total from public.tarefa_anexos where tarefa_id = t.id) a on true
left join lateral (select count(*)::integer as total from public.tarefa_eventos where tarefa_id = t.id and tipo = 'comentario') e on true;

comment on view public.vw_tarefas is 'Tarefas com responsáveis [{id, nome}], contagem de anexos e comentários, atraso e texto de busca.';

-- Segurança ----------------------------------------------------------------------------------

alter table public.tarefas enable row level security;
alter table public.tarefa_responsaveis enable row level security;
alter table public.tarefa_anexos enable row level security;
alter table public.tarefa_eventos enable row level security;
alter table public.notificacoes enable row level security;

create policy "Equipe vê as tarefas"
  on public.tarefas for select to authenticated
  using ((select public.eh_membro_equipe()));

create policy "Equipe cria tarefas"
  on public.tarefas for insert to authenticated
  with check ((select public.eh_membro_equipe()));

create policy "Equipe atualiza tarefas"
  on public.tarefas for update to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Quem criou ou admin exclui a tarefa"
  on public.tarefas for delete to authenticated
  using ((select public.eh_membro_equipe()) and (criado_por = (select auth.uid()) or (select public.eh_admin())));

create policy "Equipe gerencia os responsáveis"
  on public.tarefa_responsaveis for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe gerencia os anexos"
  on public.tarefa_anexos for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe vê o histórico"
  on public.tarefa_eventos for select to authenticated
  using ((select public.eh_membro_equipe()));

create policy "Equipe comenta em nome próprio"
  on public.tarefa_eventos for insert to authenticated
  with check ((select public.eh_membro_equipe()) and tipo = 'comentario' and autor_id = (select auth.uid()));

create policy "Autor ou admin apaga o comentário"
  on public.tarefa_eventos for delete to authenticated
  using ((select public.eh_membro_equipe()) and tipo = 'comentario' and (autor_id = (select auth.uid()) or (select public.eh_admin())));

create policy "Membro vê os próprios avisos"
  on public.notificacoes for select to authenticated
  using (perfil_id = (select auth.uid()) and (select public.eh_membro_equipe()));

create policy "Membro marca os próprios avisos como lidos"
  on public.notificacoes for update to authenticated
  using (perfil_id = (select auth.uid()) and (select public.eh_membro_equipe()))
  with check (perfil_id = (select auth.uid()));

revoke all on public.tarefas, public.tarefa_responsaveis, public.tarefa_anexos, public.tarefa_eventos, public.notificacoes, public.vw_tarefas
  from anon, authenticated;
grant select, insert, update, delete on public.tarefas, public.tarefa_responsaveis, public.tarefa_anexos to authenticated, service_role;
-- Histórico: a equipe lê, comenta e apaga o próprio comentário (nunca edita registros).
grant select, insert, delete on public.tarefa_eventos to authenticated;
grant select, insert, update, delete on public.tarefa_eventos to service_role;
grant select on public.vw_tarefas to authenticated, service_role;
-- Avisos: o membro só lê e marca como lido (os avisos nascem no banco).
grant select on public.notificacoes to authenticated;
grant update (lida_em) on public.notificacoes to authenticated;
grant select, insert, update, delete on public.notificacoes to service_role;

revoke execute on function
  public.criar_tarefa(jsonb, uuid[]),
  public.registrar_evento_tarefa(uuid, text, text, jsonb)
from public, anon;
grant execute on function public.criar_tarefa(jsonb, uuid[]) to authenticated, service_role;
-- Registro automático do histórico: só pelos gatilhos (e pelo servidor).
revoke execute on function public.registrar_evento_tarefa(uuid, text, text, jsonb) from authenticated;
grant execute on function public.registrar_evento_tarefa(uuid, text, text, jsonb) to service_role;

-- Tempo real: o quadro e o sino se atualizam sozinhos (o RLS continua valendo).
alter publication supabase_realtime add table
  public.tarefas, public.tarefa_responsaveis, public.tarefa_anexos, public.tarefa_eventos, public.notificacoes;

-- Imagens das tarefas em bucket privado (até 10 MB por imagem) -------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tarefas', 'tarefas', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "Equipe vê imagens das tarefas"
  on storage.objects for select to authenticated
  using (bucket_id = 'tarefas' and (select public.eh_membro_equipe()));

create policy "Equipe envia imagens das tarefas"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'tarefas' and (select public.eh_membro_equipe()));

create policy "Equipe remove imagens das tarefas"
  on storage.objects for delete to authenticated
  using (bucket_id = 'tarefas' and (select public.eh_membro_equipe()));
