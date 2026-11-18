-- Campanhas: horário de envio depois da aprovação da Meta.
--
-- Antes, a campanha "Agora" começava a enviar no minuto em que a Meta aprovava — às vezes às 23h.
-- Agora a equipe escolhe um horário (ex.: 15:00):
--   • aprovada antes do horário  → agendada para hoje no horário;
--   • aprovada depois do horário → agendada para o dia seguinte no horário e o sino pergunta
--     se é para "Enviar agora" ou manter para amanhã (sem resposta, sai amanhã no horário).
-- O mesmo vale para a campanha agendada (dia e hora) que a Meta aprova depois da hora marcada.

alter table public.campanhas
  add column horario_envio time,
  add column aprovada_em   timestamptz,
  add column decidir_envio boolean not null default false;

comment on column public.campanhas.horario_envio is
  'Hora do dia (Brasília) em que a campanha sai depois de aprovada. Nulo = sai assim que a Meta aprovar.';
comment on column public.campanhas.aprovada_em is 'Quando a Meta aprovou a mensagem desta campanha.';
comment on column public.campanhas.decidir_envio is
  'A Meta aprovou depois do horário: a campanha ficou para o próximo horário e espera a equipe escolher (agora ou no horário).';

-- vw_campanhas: "c.*" é expandido quando a view é criada — recriada para trazer as colunas novas.
drop view public.vw_campanhas;

create view public.vw_campanhas
with (security_invoker = true)
as
select c.*, n.pendentes, n.enviadas, n.entregues, n.lidas, n.respostas, n.falhas, n.ignoradas, n.sairam
from public.campanhas c
cross join lateral (
  select
    count(*) filter (where e.status in ('pendente', 'enviando'))::integer as pendentes,
    count(*) filter (where e.enviada_em is not null)::integer            as enviadas,
    count(*) filter (where e.entregue_em is not null)::integer           as entregues,
    count(*) filter (where e.lida_em is not null)::integer               as lidas,
    count(*) filter (where e.respondida_em is not null)::integer         as respostas,
    count(*) filter (where e.status = 'falhou')::integer                 as falhas,
    count(*) filter (where e.status = 'ignorada')::integer               as ignoradas,
    count(*) filter (where e.saiu_em is not null)::integer               as sairam
  from public.campanha_envios e
  where e.campanha_id = c.id
) n;

revoke all on public.vw_campanhas from anon;
grant select on public.vw_campanhas to authenticated, service_role;

-- Avisos do sino: "Campanha aprovada" abre a campanha.
alter table public.notificacoes add column campanha_id uuid references public.campanhas (id) on delete cascade;
comment on column public.notificacoes.campanha_id is 'Campanha do aviso (aprovada pela Meta / escolher quando enviar): abre direto a campanha.';
create index notificacoes_campanha_idx on public.notificacoes (campanha_id) where campanha_id is not null;

alter table public.notificacoes drop constraint notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check (tipo in (
  'tarefa_atribuida', 'tarefa_comentario', 'tarefa_impedida', 'tarefa_desimpedida', 'tarefa_prazo', 'tarefa_concluida',
  'whatsapp_mensagem', 'atendimento_transferido', 'pix_recebido', 'estoque_olist', 'caixa_vencida', 'campanha_aprovada'
));
