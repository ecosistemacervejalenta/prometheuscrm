-- =============================================================================
-- PROMETHEUS CRM · CONTAS FIXAS: FINALIDADE, PROJETO E FOLHA DE PAGAMENTO
--   • contas_fixas.finalidade: para que serve o custo (justifica a despesa).
--   • contas_fixas.projeto: onde o custo é usado (Geral, Haroldinho, Lupp...).
--     Um projeto digitado com outra grafia ("lupp") reaproveita a já usada.
--   • vw_contas_pagar ganha o projeto da conta fixa de origem.
--   • Categoria "Pessoal" (sem uso) passa a se chamar "Mão de obra".
--   • Assinaturas cadastradas na migration anterior: finalidade e projeto saem
--     das observações para os campos próprios.
--   • Nova conta fixa: Folha de pagamento (R$ 8.500,00, todo dia 5).
-- =============================================================================

alter table public.contas_fixas
  add column finalidade text check (finalidade is null or length(finalidade) <= 300),
  add column projeto text not null default 'Geral' check (length(trim(projeto)) between 1 and 60);

comment on column public.contas_fixas.finalidade is 'Para que serve a conta (justifica o custo).';
comment on column public.contas_fixas.projeto is 'Projeto em que a conta é usada (Geral, Haroldinho, Lupp...).';

create or replace function public.normalizar_conta_fixa()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_projeto text;
begin
  new.finalidade := nullif(regexp_replace(trim(coalesce(new.finalidade, '')), '\s+', ' ', 'g'), '');
  new.projeto    := coalesce(nullif(regexp_replace(trim(coalesce(new.projeto, '')), '\s+', ' ', 'g'), ''), 'Geral');

  select cf.projeto into v_projeto
  from public.contas_fixas cf
  where lower(cf.projeto) = lower(new.projeto) and cf.id <> new.id
  limit 1;

  new.projeto := coalesce(v_projeto, new.projeto);
  return new;
end;
$$;

create trigger contas_fixas_normalizar
  before insert or update of finalidade, projeto on public.contas_fixas
  for each row execute function public.normalizar_conta_fixa();

-- Projeto da conta fixa de origem (colunas novas só no fim da view).
create or replace view public.vw_contas_pagar
with (security_invoker = true)
as
select
  cp.*,
  f.nome as fornecedor_nome,
  case
    when cp.status = 'paga' then 'paga'
    when cp.status = 'cancelada' then 'cancelada'
    when cp.vencimento < public.hoje_brasilia() then 'vencida'
    when cp.vencimento <= public.hoje_brasilia() + 3 then 'vence_logo'
    else 'em_dia'
  end as situacao,
  cf.projeto
from public.contas_pagar cp
left join public.fornecedores f on f.id = cp.fornecedor_id
left join public.contas_fixas cf on cf.id = cp.conta_fixa_id;

-- "Pessoal" → "Mão de obra" (a categoria não tinha nenhuma conta).
update public.categorias_financeiras
set nome = 'Mão de obra'
where natureza = 'pagar'
  and lower(nome) = 'pessoal'
  and not exists (
    select 1 from public.categorias_financeiras where natureza = 'pagar' and lower(nome) = 'mão de obra'
  );

update public.contas_pagar set categoria = 'Mão de obra' where lower(categoria) = 'pessoal';
update public.contas_fixas set categoria = 'Mão de obra' where lower(categoria) = 'pessoal';

-- Assinaturas: finalidade e projeto nos campos próprios; nas observações fica só a
-- cobrança em dólar. Observações já editadas à mão não são tocadas.
update public.contas_fixas cf
set finalidade  = a.finalidade,
    projeto     = a.projeto,
    observacoes = case when cf.observacoes like '% · Projeto: %' then a.observacoes else cf.observacoes end
from (
  values
    ('ChatGPT',             'Uso geral do ecossistema (IA)',                                       'Geral',      'Cobrança em dólar: US$ 20,00 (cotação R$ 5,15)'),
    ('Lovable',             'Front da loja e App',                                                 'Geral',      'Cobrança em dólar: US$ 50,00 (cotação R$ 5,15)'),
    ('Napoleon Host',       'Servidor de e-mail e Landing Pages',                                  'Geral',      null),
    ('Shopify',             'Nossa loja virtual',                                                  'Geral',      'Cobrança em dólar: US$ 37,59 (cotação R$ 5,15)'),
    ('Hostinger',           'Servidor n8n (automações e Neural Haroldinho Sommelier)',             'Geral',      null),
    ('Converta App',        'Plugin conversor de e-commerce para app Android e iOS',               'Geral',      null),
    ('Claude Code Max',     'Time de Dev',                                                         'Geral',      null),
    ('uazapi',              'API de envio de mensagens WhatsApp (número principal)',               'Geral',      null),
    ('Supabase Haroldinho', 'Banco de dados — onde tudo do Haroldinho fica guardado',              'Haroldinho', 'Cobrança em dólar: US$ 25,00 (cotação R$ 5,15)'),
    ('Supabase Lupp',       'Servidor isolado com todos os dados do app Lupp',                     'Lupp',       'Cobrança em dólar: US$ 25,00 (cotação R$ 5,15)'),
    ('Vercel',              'Front do app Lupp — mostra ao cliente o que está no banco de dados',  'Lupp',       'Cobrança em dólar: US$ 20,00 (cotação R$ 5,15)')
) as a (descricao, finalidade, projeto, observacoes)
where lower(trim(cf.descricao)) = lower(a.descricao)
  and cf.finalidade is null;

-- As contas do mês já geradas dessas assinaturas recebem as observações novas.
update public.contas_pagar cp
set observacoes = cf.observacoes
from public.contas_fixas cf
where cp.conta_fixa_id = cf.id
  and cp.observacoes like '% · Projeto: %'
  and cp.observacoes is distinct from cf.observacoes;

insert into public.contas_fixas (descricao, categoria, valor, dia_vencimento, inicio_em, finalidade, projeto)
select 'Folha de pagamento', 'Mão de obra', 8500.00, 5, date '2026-10-01', 'Salários da equipe', 'Geral'
where not exists (
  select 1 from public.contas_fixas where lower(trim(descricao)) = 'folha de pagamento'
);
