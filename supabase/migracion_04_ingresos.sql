-- Ejecutar UNA vez en Supabase > SQL Editor (después de migracion_03)

-- ===== El maestro de conceptos ahora distingue gastos de ingresos =====
alter table public.conceptos
  add column tipo text not null default 'gasto' check (tipo in ('gasto','ingreso'));

drop index public.conceptos_usuario_nombre_uq;
create unique index conceptos_usuario_tipo_nombre_uq
  on public.conceptos (user_id, tipo, lower(trim(nombre)));

-- ===== Ingresos =====
create table public.ingresos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cuenta_id   uuid not null references public.cuentas(id)   on delete restrict,
  concepto_id uuid not null references public.conceptos(id) on delete restrict,
  fecha       date not null default current_date,
  monto       numeric(14,2) not null check (monto > 0),
  nota        text check (nota is null or char_length(nota) <= 120),
  created_at  timestamptz not null default now()
);
create index ingresos_user_fecha_idx on public.ingresos (user_id, fecha desc);
create index ingresos_cuenta_idx on public.ingresos (cuenta_id);
alter table public.ingresos enable row level security;

create policy "ingresos_select" on public.ingresos
  for select to authenticated using (user_id = auth.uid() and public.esta_aprobado());
create policy "ingresos_insert" on public.ingresos
  for insert to authenticated with check (
    user_id = auth.uid() and public.esta_aprobado()
    and exists (select 1 from public.cuentas c   where c.id = cuenta_id   and c.user_id = auth.uid())
    and exists (select 1 from public.conceptos k where k.id = concepto_id and k.user_id = auth.uid() and k.tipo = 'ingreso'));
create policy "ingresos_update" on public.ingresos
  for update to authenticated
  using (user_id = auth.uid() and public.esta_aprobado())
  with check (
    user_id = auth.uid() and public.esta_aprobado()
    and exists (select 1 from public.cuentas c   where c.id = cuenta_id   and c.user_id = auth.uid())
    and exists (select 1 from public.conceptos k where k.id = concepto_id and k.user_id = auth.uid() and k.tipo = 'ingreso'));
create policy "ingresos_delete" on public.ingresos
  for delete to authenticated using (user_id = auth.uid() and public.esta_aprobado());

-- ===== Los gastos solo pueden usar conceptos de tipo "gasto" =====
drop policy "gastos_insert" on public.gastos;
drop policy "gastos_update" on public.gastos;
create policy "gastos_insert" on public.gastos
  for insert to authenticated with check (
    user_id = auth.uid() and public.esta_aprobado()
    and exists (select 1 from public.cuentas c   where c.id = cuenta_id   and c.user_id = auth.uid())
    and exists (select 1 from public.conceptos k where k.id = concepto_id and k.user_id = auth.uid() and k.tipo = 'gasto'));
create policy "gastos_update" on public.gastos
  for update to authenticated
  using (user_id = auth.uid() and public.esta_aprobado())
  with check (
    user_id = auth.uid() and public.esta_aprobado()
    and exists (select 1 from public.cuentas c   where c.id = cuenta_id   and c.user_id = auth.uid())
    and exists (select 1 from public.conceptos k where k.id = concepto_id and k.user_id = auth.uid() and k.tipo = 'gasto'));

-- ===== Saldo actual = saldo inicial + ingresos - gastos =====
create or replace view public.cuentas_con_saldo with (security_invoker = true) as
select c.id, c.user_id, c.nombre, c.tipo, c.saldo_inicial, c.created_at,
       c.saldo_inicial
         + coalesce((select sum(i.monto) from public.ingresos i where i.cuenta_id = c.id), 0)
         - coalesce((select sum(g.monto) from public.gastos   g where g.cuenta_id = c.id), 0) as saldo
from public.cuentas c;
