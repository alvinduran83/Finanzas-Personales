-- Ejecutar UNA vez en Supabase > SQL Editor (después de migracion_04)

-- Porcentaje de distribución guardado por cuenta (null = usar el sugerido por tipo)
alter table public.cuentas
  add column porcentaje numeric(5,2)
  check (porcentaje is null or (porcentaje >= 0 and porcentaje <= 100));

-- Agrupa las partes de un mismo ingreso distribuido
alter table public.ingresos add column grupo_id uuid;
create index ingresos_grupo_idx on public.ingresos (grupo_id);

-- La vista expone también el porcentaje (columna nueva siempre al final)
create or replace view public.cuentas_con_saldo with (security_invoker = true) as
select c.id, c.user_id, c.nombre, c.tipo, c.saldo_inicial, c.created_at,
       c.saldo_inicial
         + coalesce((select sum(i.monto) from public.ingresos i where i.cuenta_id = c.id), 0)
         - coalesce((select sum(g.monto) from public.gastos   g where g.cuenta_id = c.id), 0) as saldo,
       c.porcentaje
from public.cuentas c;
