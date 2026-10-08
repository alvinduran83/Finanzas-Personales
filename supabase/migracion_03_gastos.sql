-- Ejecutar UNA vez en Supabase > SQL Editor (después de migracion_02)

-- ===== Maestro de conceptos (por usuario) =====
create table public.conceptos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre     text not null check (char_length(trim(nombre)) between 1 and 60),
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index conceptos_usuario_nombre_uq on public.conceptos (user_id, lower(trim(nombre)));
alter table public.conceptos enable row level security;

create policy "conceptos_select" on public.conceptos
  for select to authenticated using (user_id = auth.uid() and public.esta_aprobado());
create policy "conceptos_insert" on public.conceptos
  for insert to authenticated with check (user_id = auth.uid() and public.esta_aprobado());
create policy "conceptos_update" on public.conceptos
  for update to authenticated
  using (user_id = auth.uid() and public.esta_aprobado())
  with check (user_id = auth.uid() and public.esta_aprobado());
create policy "conceptos_delete" on public.conceptos
  for delete to authenticated using (user_id = auth.uid() and public.esta_aprobado());

-- ===== Gastos =====
create table public.gastos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cuenta_id   uuid not null references public.cuentas(id)   on delete restrict,
  concepto_id uuid not null references public.conceptos(id) on delete restrict,
  fecha       date not null default current_date,
  monto       numeric(14,2) not null check (monto > 0),
  nota        text check (nota is null or char_length(nota) <= 120),
  created_at  timestamptz not null default now()
);
create index gastos_user_fecha_idx on public.gastos (user_id, fecha desc);
create index gastos_cuenta_idx on public.gastos (cuenta_id);
alter table public.gastos enable row level security;

-- Además de ser del usuario, la cuenta y el concepto referenciados deben ser suyos
create policy "gastos_select" on public.gastos
  for select to authenticated using (user_id = auth.uid() and public.esta_aprobado());
create policy "gastos_insert" on public.gastos
  for insert to authenticated with check (
    user_id = auth.uid() and public.esta_aprobado()
    and exists (select 1 from public.cuentas c   where c.id = cuenta_id   and c.user_id = auth.uid())
    and exists (select 1 from public.conceptos k where k.id = concepto_id and k.user_id = auth.uid()));
create policy "gastos_update" on public.gastos
  for update to authenticated
  using (user_id = auth.uid() and public.esta_aprobado())
  with check (
    user_id = auth.uid() and public.esta_aprobado()
    and exists (select 1 from public.cuentas c   where c.id = cuenta_id   and c.user_id = auth.uid())
    and exists (select 1 from public.conceptos k where k.id = concepto_id and k.user_id = auth.uid()));
create policy "gastos_delete" on public.gastos
  for delete to authenticated using (user_id = auth.uid() and public.esta_aprobado());

-- ===== Saldo actual de cada cuenta = saldo inicial - gastos =====
create view public.cuentas_con_saldo with (security_invoker = true) as
select c.id, c.user_id, c.nombre, c.tipo, c.saldo_inicial, c.created_at,
       c.saldo_inicial - coalesce(sum(g.monto), 0) as saldo
from public.cuentas c
left join public.gastos g on g.cuenta_id = c.id
group by c.id;
