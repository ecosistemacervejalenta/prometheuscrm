-- =============================================================================
-- PROMETHEUS CRM · 07 · PERMISSÕES E STORAGE
--
-- Modelo de acesso:
--   • authenticated → membros da equipe (o RLS exige um perfil ativo).
--   • service_role  → servidor do Next.js (link público de pré-venda,
--                     webhooks da Shopify, API /api/v1 e fila de eventos).
--   • anon          → sem acesso direto a nada. O link público passa pelo servidor.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- Tabelas e visões
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Funções: ninguém anônimo executa nada
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- Funções exclusivas do servidor (chave secreta)
revoke execute on function public.registrar_pedido_pre_venda(text, jsonb, jsonb, boolean, text) from authenticated;
revoke execute on function public.identificar_cliente_pre_venda(text) from authenticated;
revoke execute on function public.importar_pedido_shopify(jsonb) from authenticated;
revoke execute on function public.registrar_evento(text, text, uuid, jsonb) from authenticated;

-- Novas tabelas/funções criadas no futuro seguem o mesmo padrão
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- -----------------------------------------------------------------------------
-- Storage: imagens dos produtos (bucket público para leitura)
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

create policy "Equipe envia imagens de produtos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and (select public.eh_membro_equipe()));

create policy "Equipe atualiza imagens de produtos"
  on storage.objects for update to authenticated
  using (bucket_id = 'produtos' and (select public.eh_membro_equipe()));

create policy "Equipe remove imagens de produtos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'produtos' and (select public.eh_membro_equipe()));
