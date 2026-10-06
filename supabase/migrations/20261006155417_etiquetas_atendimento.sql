-- =============================================================================
-- PROMETHEUS CRM · ATENDIMENTO WHATSAPP — ETIQUETAS
--   Etiquetas coloridas que dizem o que está sendo tratado em cada atendimento
--   ("Produto quebrado", "Verificando com a transportadora"...). Aparecem na
--   lista da caixa de entrada para identificar o caso de relance.
--   A equipe cria as etiquetas na própria conversa ou em Configurações ›
--   Etiquetas. Colocar e tirar uma etiqueta fica registrado na linha do tempo.
--   O atendimento resolvido guarda as etiquetas (histórico); um atendimento
--   novo do mesmo contato começa sem nenhuma.
-- =============================================================================

-- Etiquetas (cadastro) ----------------------------------------------------------

create table public.etiquetas_atendimento (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cor         text not null default 'azul',
  criado_por  uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em   timestamptz not null default now(),
  constraint etiquetas_atendimento_nome_check check (length(nome) between 1 and 40),
  constraint etiquetas_atendimento_cor_check
    check (cor in ('vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'roxo', 'rosa', 'cinza'))
);

comment on table public.etiquetas_atendimento is 'Tipos de caso do atendimento (ex.: "Produto quebrado"), criados pela equipe.';
comment on column public.etiquetas_atendimento.cor is 'Cor da etiqueta na tela (paleta fixa: vermelho, laranja, amarelo, verde, azul, roxo, rosa, cinza).';

create unique index etiquetas_atendimento_nome_key on public.etiquetas_atendimento (lower(nome));

create or replace function public.normalizar_etiqueta_atendimento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome := regexp_replace(trim(coalesce(new.nome, '')), '\s+', ' ', 'g');
  return new;
end;
$$;

create trigger etiquetas_atendimento_normalizar
  before insert or update on public.etiquetas_atendimento
  for each row execute function public.normalizar_etiqueta_atendimento();

-- Etiquetas de cada atendimento ------------------------------------------------

create table public.atendimentos_etiquetas (
  atendimento_id  uuid not null references public.atendimentos (id) on delete cascade,
  etiqueta_id     uuid not null references public.etiquetas_atendimento (id) on delete cascade,
  criado_por      uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em       timestamptz not null default now(),
  primary key (atendimento_id, etiqueta_id)
);

comment on table public.atendimentos_etiquetas is 'Etiquetas colocadas em cada atendimento. Excluir a etiqueta tira ela de todos.';

create index atendimentos_etiquetas_etiqueta_idx on public.atendimentos_etiquetas (etiqueta_id);

-- Linha do tempo: "Ana colocou a etiqueta Produto quebrado" ---------------------

alter table public.atendimento_eventos drop constraint atendimento_eventos_tipo_check;
alter table public.atendimento_eventos add constraint atendimento_eventos_tipo_check
  check (tipo in ('aberto', 'assumido', 'transferido', 'status', 'nota', 'resolvido', 'etiqueta_adicionada', 'etiqueta_removida'));

comment on column public.atendimento_eventos.texto is 'Nota interna, motivo da mudança de status ou o nome da etiqueta colocada/tirada.';

-- Coloca (p_marcar = true) ou tira uma etiqueta do atendimento e registra na linha
-- do tempo. Repetir a mesma ação não duplica nem gera evento.
create or replace function public.marcar_etiqueta_atendimento(p_atendimento_id uuid, p_etiqueta_id uuid, p_marcar boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_nome text;
begin
  select nome into v_nome from public.etiquetas_atendimento where id = p_etiqueta_id;
  if v_nome is null then
    raise exception 'Etiqueta não encontrada. Ela pode ter sido excluída.';
  end if;
  if not exists (select 1 from public.atendimentos where id = p_atendimento_id) then
    raise exception 'Atendimento não encontrado.';
  end if;

  if p_marcar then
    insert into public.atendimentos_etiquetas (atendimento_id, etiqueta_id)
    values (p_atendimento_id, p_etiqueta_id)
    on conflict do nothing;
  else
    delete from public.atendimentos_etiquetas
    where atendimento_id = p_atendimento_id and etiqueta_id = p_etiqueta_id;
  end if;

  if found then
    insert into public.atendimento_eventos (atendimento_id, tipo, texto)
    values (p_atendimento_id, case when p_marcar then 'etiqueta_adicionada' else 'etiqueta_removida' end, v_nome);
  end if;
end;
$$;

-- Visão da caixa de entrada: etiquetas no fim (como exige o replace) e na busca ---

create or replace view public.vw_atendimentos
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
  lower(concat_ws(' ', c.nome, c.nome_whatsapp, cl.nome, c.whatsapp, et.nomes)) as busca,
  case when c.foto_expira_em is null or c.foto_expira_em > now() then c.foto_url end as contato_foto,
  coalesce(et.lista, '[]'::jsonb) as etiquetas
from public.atendimentos a
join public.whatsapp_contatos c on c.id = a.contato_id
left join public.perfis r on r.id = a.responsavel_id
left join public.clientes cl on cl.whatsapp = c.whatsapp
left join lateral (
  select
    jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor) order by ae.criado_em, e.nome) as lista,
    string_agg(e.nome, ' ') as nomes
  from public.atendimentos_etiquetas ae
  join public.etiquetas_atendimento e on e.id = ae.etiqueta_id
  where ae.atendimento_id = a.id
) et on true;

comment on column public.vw_atendimentos.etiquetas is 'Etiquetas do atendimento, na ordem em que foram colocadas: [{id, nome, cor}].';

-- Segurança ---------------------------------------------------------------------

alter table public.etiquetas_atendimento enable row level security;
alter table public.atendimentos_etiquetas enable row level security;

create policy "Equipe gerencia etiquetas de atendimento"
  on public.etiquetas_atendimento for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe etiqueta atendimentos"
  on public.atendimentos_etiquetas for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

revoke all on public.etiquetas_atendimento, public.atendimentos_etiquetas from anon;
grant select, insert, update, delete on public.etiquetas_atendimento, public.atendimentos_etiquetas
  to authenticated, service_role;

revoke execute on function public.marcar_etiqueta_atendimento(uuid, uuid, boolean) from public, anon;
grant execute on function public.marcar_etiqueta_atendimento(uuid, uuid, boolean) to authenticated, service_role;

-- Tempo real: renomear, mudar a cor ou excluir uma etiqueta atualiza a caixa de entrada.
alter publication supabase_realtime add table public.etiquetas_atendimento, public.atendimentos_etiquetas;

-- Etiquetas iniciais (exemplos do dia a dia; dá para renomear ou excluir) ---------

insert into public.etiquetas_atendimento (nome, cor, criado_por)
values
  ('Verificando com a transportadora', 'azul', null),
  ('Aguardando entrega', 'amarelo', null),
  ('Produto quebrado', 'vermelho', null)
on conflict do nothing;
