# Mis Finanzas

App web de finanzas personales. Frontend con Vite (JavaScript), backend con Supabase (PostgreSQL + Auth), despliegue en Vercel.

## Funciones actuales
- Registro e inicio de sesión (correo y clave, vía Supabase Auth)
- Mantenimiento de cuentas (Cuenta de Ahorro, de Pagos, de Inversiones, etc.)
- Datos aislados por usuario con Row Level Security

## 1. Supabase
1. Crea un proyecto en https://supabase.com
2. Abre **SQL Editor**, pega el contenido de `supabase/schema.sql` y ejecútalo.
3. En **Project Settings > API** copia la *Project URL* y la clave *anon public*.
4. (Opcional) En **Authentication > Providers > Email** puedes desactivar "Confirm email" mientras desarrollas.

## 2. Local
```bash
cp .env.example .env     # completa con tus valores de Supabase
npm install
npm run dev
```

## 3. GitHub
```bash
git init
git add .
git commit -m "Primera versión: login y cuentas"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/finanzas-app.git
git push -u origin main
```

## 4. Vercel
1. En https://vercel.com elige **Add New > Project** e importa el repositorio.
2. Vercel detecta Vite automáticamente (build: `npm run build`, salida: `dist`).
3. En **Environment Variables** agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Pulsa **Deploy**. Cada `git push` a `main` redespliega solo.
5. En Supabase, **Authentication > URL Configuration**, pon la URL de Vercel como *Site URL*.

## Seguridad
- La clave `anon` es pública por diseño; la protección real son las políticas RLS de `schema.sql`.
- Nunca subas la clave `service_role` ni el archivo `.env` al repositorio.

## Aprobación de usuarios (migración 02)
1. Ejecuta `supabase/migracion_02_aprobacion.sql` en el SQL Editor (cambia el correo del administrador al final del archivo si hace falta).
2. Los usuarios nuevos quedan **pendientes** hasta que un administrador los apruebe en la pestaña **Usuarios**.
3. Un administrador no puede modificar su propio estado; así nunca se bloquea a sí mismo.

## Gastos y conceptos (migración 03)
1. Ejecuta `supabase/migracion_03_gastos.sql` en el SQL Editor.
2. Pestaña **Conceptos**: maestro editable (agregar, renombrar, activar/desactivar, eliminar). Un concepto con gastos no se elimina; se desactiva.
3. Pestaña **Gastos**: registro con fecha, concepto, cuenta de pago, monto y nota, filtrado por mes.
4. El saldo de cada cuenta pasa a ser: saldo inicial menos sus gastos (vista `cuentas_con_saldo`).

## Ingresos (migración 04)
1. Ejecuta `supabase/migracion_04_ingresos.sql` en el SQL Editor.
2. El maestro de **Conceptos** ahora tiene dos listas: *De gastos* y *De ingresos* (Sueldo, Honorarios, Ventas, etc.).
3. Pestaña **Ingresos**: fecha, concepto, cuenta que recibe, monto y nota, filtrado por mes.
4. Saldo de cada cuenta = saldo inicial + ingresos - gastos.
