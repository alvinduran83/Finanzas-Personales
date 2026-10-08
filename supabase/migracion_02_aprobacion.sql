-- Ejecutar UNA vez en Supabase > SQL Editor (después de schema.sql)
-- Agrega aprobación de usuarios por un administrador.

create table public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null default '',
  rol        text not null default 'usuario' check (rol in ('admin','usuario')),
  estado     text not null default 'pendiente' check (estado in ('pendiente','aprobado','deshabilitado')),
  created_at timestamptz not null default now()
);
alter table public.perfiles enable row level security;

-- Funciones auxiliares (security definer evita recursión en las políticas)
create function public.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles
                 where id = auth.uid() and rol = 'admin' and estado = 'aprobado')
$$;

create function public.esta_aprobado() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles
                 where id = auth.uid() and estado = 'aprobado')
$$;

-- Cada usuario nuevo nace como "pendiente"
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, email) values (new.id, coalesce(new.email, ''));
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Políticas de perfiles
create policy "perfiles_select" on public.perfiles
  for select to authenticated using (id = auth.uid() or public.es_admin());
create policy "perfiles_update" on public.perfiles
  for update to authenticated
  using (public.es_admin() and id <> auth.uid())
  with check (public.es_admin() and id <> auth.uid());

-- Usuarios que ya existían: quedan aprobados para no bloquearlos
insert into public.perfiles (id, email, estado)
select id, coalesce(email, ''), 'aprobado' from auth.users
on conflict (id) do nothing;

-- Las cuentas solo son accesibles para usuarios aprobados
drop policy "cuentas_select" on public.cuentas;
drop policy "cuentas_insert" on public.cuentas;
drop policy "cuentas_update" on public.cuentas;
drop policy "cuentas_delete" on public.cuentas;

create policy "cuentas_select" on public.cuentas
  for select to authenticated using (user_id = auth.uid() and public.esta_aprobado());
create policy "cuentas_insert" on public.cuentas
  for insert to authenticated with check (user_id = auth.uid() and public.esta_aprobado());
create policy "cuentas_update" on public.cuentas
  for update to authenticated
  using (user_id = auth.uid() and public.esta_aprobado())
  with check (user_id = auth.uid() and public.esta_aprobado());
create policy "cuentas_delete" on public.cuentas
  for delete to authenticated using (user_id = auth.uid() and public.esta_aprobado());

-- ADMINISTRADOR: cambia el correo si tu cuenta de administrador es otra
update public.perfiles set rol = 'admin', estado = 'aprobado'
where email = 'alvin.drocks@gmail.com';
