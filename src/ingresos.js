import { supabase } from './supabase.js'

const $ = (id) => document.getElementById(id)
const money = (n) => new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const hoy = () => new Date().toLocaleDateString('en-CA')
const fmtFecha = (f) => f.split('-').reverse().join('/')

let ctx, ingresos = [], editI = null

function rangoMes() {
  const [y, m] = $('mesI').value.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return [`${y}-${String(m).padStart(2, '0')}-01`, next]
}

export async function cargarIngresos() {
  if (!$('mesI').value) $('mesI').value = hoy().slice(0, 7)
  const [desde, hasta] = rangoMes()
  const { data, error } = await supabase
    .from('ingresos')
    .select('*, conceptos(nombre), cuentas(nombre)')
    .gte('fecha', desde).lt('fecha', hasta)
    .order('fecha', { ascending: false }).order('created_at', { ascending: false })
  if (error) {
    $('ingresosList').innerHTML = `<li class="empty">No se pudieron cargar los ingresos: ${esc(error.message)}</li>`
    return
  }
  ingresos = data
  $('totalIngresos').textContent = money(ingresos.reduce((s, g) => s + Number(g.monto), 0))
  $('ingresosList').innerHTML = ingresos.length
    ? ingresos.map((g) => `
      <li class="row"><div><b>${esc(g.conceptos?.nombre ?? '—')}</b>
      <small>${fmtFecha(g.fecha)} · ${esc(g.cuentas?.nombre ?? '—')}${g.nota ? ' · ' + esc(g.nota) : ''}</small></div>
      <div class="acts"><span class="bal in">+ ${money(Number(g.monto))}</span>
      <button class="btn ghost sm" data-iedit="${g.id}">Editar</button>
      <button class="btn danger sm" data-idel="${g.id}">Eliminar</button></div></li>`).join('')
    : '<li class="empty">No hay ingresos en este mes. Registra el primero con “Nuevo ingreso”.</li>'
}

function openIngreso(id) {
  const cuentas = ctx.cuentas()
  editI = id || null
  const g = ingresos.find((x) => x.id === id)
  const lista = ctx.conceptos().filter((c) => c.tipo === 'ingreso' && (c.activo || (g && c.id === g.concepto_id)))
  $('iConcepto').innerHTML = lista.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')
  $('iCuenta').innerHTML = cuentas.map((a) => `<option value="${a.id}">${esc(a.nombre)} (${esc(a.tipo)})</option>`).join('')
  $('iFecha').value = g ? g.fecha : hoy()
  $('iMonto').value = g ? g.monto : ''
  $('iNota').value = g ? g.nota || '' : ''
  if (g) {
    $('iConcepto').value = g.concepto_id
    $('iCuenta').value = g.cuenta_id
  } else {
    const pagos = cuentas.find((a) => a.tipo === 'Pagos') || cuentas[0]
    if (pagos) $('iCuenta').value = pagos.id
  }
  $('iTitle').textContent = g ? 'Editar ingreso' : 'Nuevo ingreso'
  $('iErr').textContent = !lista.length
    ? 'Primero crea al menos un concepto de ingreso en Conceptos > De ingresos.'
    : !cuentas.length ? 'Primero crea una cuenta en la pestaña Cuentas.' : ''
  $('dlgI').showModal()
}

async function saveIngreso() {
  const fila = {
    fecha: $('iFecha').value,
    concepto_id: $('iConcepto').value,
    cuenta_id: $('iCuenta').value,
    monto: parseFloat($('iMonto').value),
    nota: $('iNota').value.trim() || null,
  }
  const err = (m) => ($('iErr').textContent = m)
  if (!fila.concepto_id) return err('Selecciona un concepto. Si no hay, créalos en Conceptos > De ingresos.')
  if (!fila.cuenta_id) return err('Selecciona la cuenta que recibe el ingreso.')
  if (!fila.fecha) return err('Indica la fecha del ingreso.')
  if (!(fila.monto > 0)) return err('El monto debe ser mayor que cero.')
  $('iSave').disabled = true
  const { error } = editI
    ? await supabase.from('ingresos').update(fila).eq('id', editI)
    : await supabase.from('ingresos').insert(fila)
  $('iSave').disabled = false
  if (error) return err(error.message)
  $('dlgI').close()
  $('mesI').value = fila.fecha.slice(0, 7)
  await Promise.all([cargarIngresos(), ctx.recargarCuentas()])
}

async function deleteIngreso(id) {
  if (!confirm('¿Eliminar este ingreso?')) return
  const { error } = await supabase.from('ingresos').delete().eq('id', id)
  if (error) return alert('No se pudo eliminar: ' + error.message)
  await Promise.all([cargarIngresos(), ctx.recargarCuentas()])
}

export function initIngresos(c) {
  ctx = c
  $('mesI').value = hoy().slice(0, 7)
  $('mesI').onchange = cargarIngresos
  $('newIngreso').onclick = () => openIngreso()
  $('iCancel').onclick = () => $('dlgI').close()
  $('iSave').onclick = saveIngreso
  $('ingresosList').onclick = (e) => {
    if (e.target.dataset.iedit) openIngreso(e.target.dataset.iedit)
    if (e.target.dataset.idel) deleteIngreso(e.target.dataset.idel)
  }
}
