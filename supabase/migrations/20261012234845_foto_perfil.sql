-- =============================================================================
-- PROMETHEUS CRM · FOTO DE PERFIL DA EQUIPE
--
-- Cada pessoa escolhe a própria foto em Configurações › Equipe › Meu perfil.
-- O navegador recorta e comprime (quadrado de 512 px, JPEG); o CRM mostra em círculo.
--   • perfis.foto_url → URL pública da foto (null = iniciais).
--   • Bucket público "avatares" (leitura pela URL); cada pessoa só grava e
--     apaga dentro da própria pasta: <id do perfil>/<arquivo>.jpg
-- =============================================================================

alter table public.perfis add column foto_url text;

comment on column public.perfis.foto_url is 'Foto de perfil (URL pública do bucket "avatares", em <id>/<arquivo>.jpg). Sem foto, o CRM mostra as iniciais.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- A leitura pela URL pública não passa pelo RLS; esta política é a que a API do
-- Storage exige para listar e remover arquivos.
create policy "Equipe vê as fotos de perfil"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and (select public.eh_membro_equipe()));

create policy "Membro envia a própria foto de perfil"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and (select public.eh_membro_equipe())
  );

create policy "Membro troca a própria foto de perfil"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatares'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and (select public.eh_membro_equipe())
  );

create policy "Membro remove a própria foto de perfil"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatares'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and (select public.eh_membro_equipe())
  );
