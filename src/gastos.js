import { supabase } from './supabase.js'

const $ = (id) => document.getElementById(id)
const money = (n) => new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const hoy = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD en hora local
const fmtFecha = (f) => f.split('-').reverse().join('/')
const SUGERIDOS = {
  gasto: ['Luz', 'Agua', 'Internet', 'Teléfono', 'Pasajes', 'Alimentación', 'Chuchería', 'Salud', 'Educación', 'Alquiler', 'Entretenimiento', 'Otros'],
  ingreso: ['Sueldo', 'Honorarios', 'Ventas', 'Intereses', 'Bonos', 'Reembolsos', 'Otros ingresos'],
}

let ctx, conceptos = [], gastos = [], editG = null, editC = null, tipoSel = 'gasto'
export const getConceptos = () => conceptos

function rangoMes() {
  const [y, m] = $('mes').value.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return [`${y}-${String(m).padStart(2, '0')}-01`, next]
}

// ---------- Gastos ----------
export async function cargarGastos() {
  if (!$('mes').value) $('mes').value = hoy().slice(0, 7)
  const [desde, hasta] = rangoMes()
  const { data, error } = await supabase
    .from('gastos')
    .select('*, conceptos(nombre), cuentas(nombre)')
    .gte('fecha', desde).lt('fecha', hasta)
    .order('fecha', { ascending: false }).order('created_at', { ascending: false })
  if (error) {
    $('gastosList').innerHTML = `<li class="empty">No se pudieron cargar los gastos: ${esc(error.message)}</li>`
    return
  }
  gastos = data
  $('totalGastos').textContent = money(gastos.reduce((s, g) => s + Number(g.monto), 0))
  $('gastosList').innerHTML = gastos.length
    ? gastos.map((g) => `
      <li class="row"><div><b>${esc(g.conceptos?.nombre ?? '—')}</b>
      <small>${fmtFecha(g.fecha)} · ${esc(g.cuentas?.nombre ?? '—')}${g.nota ? ' · ' + esc(g.nota) : ''}</small></div>
      <div class="acts"><span class="bal">${money(Number(g.monto))}</span>
      <button class="btn ghost sm" data-gedit="${g.id}">Editar</button>
      <button class="btn danger sm" data-gdel="${g.id}">Eliminar</button></div></li>`).join('')
    : '<li class="empty">No hay gastos en este mes. Registra el primero con “Nuevo gasto”.</li>'
}

function openGasto(id) {
  const cuentas = ctx.cuentas()
  editG = id || null
  const g = gastos.find((x) => x.id === id)
  const lista = conceptos.filter((c) => c.tipo === 'gasto' && (c.activo || (g && c.id === g.concepto_id)))
  $('gConcepto').innerHTML = lista.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')
  $('gCuenta').innerHTML = cuentas.map((a) => `<option value="${a.id}">${esc(a.nombre)} (${esc(a.tipo)})</option>`).join('')
  $('gFecha').value = g ? g.fecha : hoy()
  $('gMonto').value = g ? g.monto : ''
  $('gNota').value = g ? g.nota || '' : ''
  if (g) {
    $('gConcepto').value = g.concepto_id
    $('gCuenta').value = g.cuenta_id
  } else {
    const pagos = cuentas.find((a) => a.tipo === 'Pagos') || cuentas[0]
    if (pagos) $('gCuenta').value = pagos.id
  }
  $('gTitle').textContent = g ? 'Editar gasto' : 'Nuevo gasto'
  $('gErr').textContent = !lista.length
    ? 'Primero crea al menos un concepto en la pestaña Conceptos.'
    : !cuentas.length ? 'Primero crea una cuenta en la pestaña Cuentas.' : ''
  $('dlgG').showModal()
}

async function saveGasto() {
  const fila = {
    fecha: $('gFecha').value,
    concepto_id: $('gConcepto').value,
    cuenta_id: $('gCuenta').value,
    monto: parseFloat($('gMonto').value),
    nota: $('gNota').value.trim() || null,
  }
  const err = (m) => ($('gErr').textContent = m)
  if (!fila.concepto_id) return err('Selecciona un concepto. Si no hay, créalos en la pestaña Conceptos.')
  if (!fila.cuenta_id) return err('Selecciona la cuenta. Si no hay, créala en la pestaña Cuentas.')
  if (!fila.fecha) return err('Indica la fecha del gasto.')
  if (!(fila.monto > 0)) return err('El monto debe ser mayor que cero.')
  $('gSave').disabled = true
  const { error } = editG
    ? await supabase.from('gastos').update(fila).eq('id', editG)
    : await supabase.from('gastos').insert(fila)
  $('gSave').disabled = false
  if (error) return err(error.message)
  $('dlgG').close()
  $('mes').value = fila.fecha.slice(0, 7) // muestra el mes del gasto guardado
  await Promise.all([cargarGastos(), ctx.recargarCuentas()])
}

async function deleteGasto(id) {
  if (!confirm('¿Eliminar este gasto?')) return
  const { error } = await supabase.from('gastos').delete().eq('id', id)
  if (error) return alert('No se pudo eliminar: ' + error.message)
  await Promise.all([cargarGastos(), ctx.recargarCuentas()])
}

// ---------- Maestro de conceptos ----------
export async function cargarConceptos() {
  const { data, error } = await supabase.from('conceptos').select('*').order('nombre')
  if (error) {
    $('conceptosList').innerHTML = `<li class="empty">No se pudieron cargar los conceptos: ${esc(error.message)}</li>`
    return
  }
  conceptos = data
  const vis = conceptos.filter((c) => c.tipo === tipoSel)
  $('conceptosList').innerHTML = vis.length
    ? vis.map((c) => `
      <li class="row"><div><b>${esc(c.nombre)}</b>
      <span class="pill ${c.activo ? 'aprobado' : 'deshabilitado'}">${c.activo ? 'Activo' : 'Inactivo'}</span></div>
      <div class="acts">
      <button class="btn ghost sm" data-cedit="${c.id}">Editar</button>
      <button class="btn ghost sm" data-ctoggle="${c.id}">${c.activo ? 'Desactivar' : 'Activar'}</button>
      <button class="btn danger sm" data-cdel="${c.id}">Eliminar</button></div></li>`).join('')
    : '<li class="empty">Aún no tienes conceptos. <button class="link" id="sugeridos">Cargar conceptos sugeridos</button> o crea el primero con “Nuevo concepto”.</li>'
}

function openConcepto(id) {
  editC = id || null
  const c = conceptos.find((x) => x.id === id)
  $('cTitle').textContent = c ? 'Editar concepto' : 'Nuevo concepto'
  $('cNombre').value = c ? c.nombre : ''
  $('cErr').textContent = ''
  $('dlgC').showModal()
  $('cNombre').focus()
}

async function saveConcepto() {
  const nombre = $('cNombre').value.trim()
  if (!nombre) return ($('cErr').textContent = 'Escribe el nombre del concepto.')
  $('cSave').disabled = true
  const { error } = editC
    ? await supabase.from('conceptos').update({ nombre }).eq('id', editC)
    : await supabase.from('conceptos').insert({ nombre, tipo: tipoSel })
  $('cSave').disabled = false
  if (error) {
    $('cErr').textContent = error.code === '23505' ? 'Ya existe un concepto con ese nombre.' : error.message
    return
  }
  $('dlgC').close()
  await Promise.all([cargarConceptos(), cargarGastos(), ctx.recargarIngresos()])
}

async function toggleConcepto(id) {
  const c = conceptos.find((x) => x.id === id)
  const { error } = await supabase.from('conceptos').update({ activo: !c.activo }).eq('id', id)
  if (error) return alert('No se pudo actualizar: ' + error.message)
  await cargarConceptos()
}

async function deleteConcepto(id) {
  const c = conceptos.find((x) => x.id === id)
  if (!c || !confirm(`¿Eliminar el concepto “${c.nombre}”?`)) return
  const { error } = await supabase.from('conceptos').delete().eq('id', id)
  if (error) {
    return alert(error.code === '23503'
      ? 'Este concepto tiene movimientos registrados y no se puede eliminar. Puedes desactivarlo para que ya no aparezca al registrar nuevos.'
      : 'No se pudo eliminar: ' + error.message)
  }
  await cargarConceptos()
}

async function cargarSugeridos() {
  const { error } = await supabase.from('conceptos').insert(SUGERIDOS[tipoSel].map((nombre) => ({ nombre, tipo: tipoSel })))
  if (error) return alert('No se pudieron cargar: ' + error.message)
  await cargarConceptos()
}

// ---------- Inicialización ----------
export function initGastos(c) {
  ctx = c
  $('mes').value = hoy().slice(0, 7)
  $('mes').onchange = cargarGastos
  $('newGasto').onclick = () => openGasto()
  $('gCancel').onclick = () => $('dlgG').close()
  $('gSave').onclick = saveGasto
  $('gastosList').onclick = (e) => {
    if (e.target.dataset.gedit) openGasto(e.target.dataset.gedit)
    if (e.target.dataset.gdel) deleteGasto(e.target.dataset.gdel)
  }
  const setTipo = (t) => {
    tipoSel = t
    $('cTipoGasto').classList.toggle('active', t === 'gasto')
    $('cTipoIngreso').classList.toggle('active', t === 'ingreso')
    cargarConceptos()
  }
  $('cTipoGasto').onclick = () => setTipo('gasto')
  $('cTipoIngreso').onclick = () => setTipo('ingreso')
  $('newConcepto').onclick = () => openConcepto()
  $('cCancel').onclick = () => $('dlgC').close()
  $('cSave').onclick = saveConcepto
  $('conceptosList').onclick = (e) => {
    const d = e.target.dataset
    if (d.cedit) openConcepto(d.cedit)
    if (d.ctoggle) toggleConcepto(d.ctoggle)
    if (d.cdel) deleteConcepto(d.cdel)
    if (e.target.id === 'sugeridos') cargarSugeridos()
  }
}
