import { supabase } from './supabase.js'

const $ = (id) => document.getElementById(id)
const money = (n) => new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const hoy = () => new Date().toLocaleDateString('en-CA')
const r2 = (n) => Math.round(n * 100) / 100

// Porcentajes por defecto según el tipo de cuenta
const DEFECTO = { Pagos: 68, Ahorro: 2, Inversiones: 5, 'Tarjeta de crédito': 15, Efectivo: 10 }

let ctx

// Porcentaje inicial de cada cuenta: el guardado, o el sugerido por tipo (solo para la primera cuenta de ese tipo)
function pctsIniciales(cuentas) {
  const visto = new Set()
  return cuentas.map((a) => {
    const primera = !visto.has(a.tipo)
    visto.add(a.tipo)
    if (a.porcentaje !== null && a.porcentaje !== undefined) return Number(a.porcentaje)
    return primera && DEFECTO[a.tipo] !== undefined ? DEFECTO[a.tipo] : 0
  })
}

// Reparte en centavos; el sobrante va a la cuenta con mayor porcentaje, así la suma es exacta
function repartir(monto, pcts) {
  const total = Math.round(monto * 100)
  const base = pcts.map((p) => Math.floor((total * p) / 100 + 1e-9))
  const resto = total - base.reduce((s, x) => s + x, 0)
  if (resto > 0) base[pcts.indexOf(Math.max(...pcts))] += resto
  return base.map((c) => c / 100)
}

const leerPcts = () => [...document.querySelectorAll('#dList input')].map((i) => parseFloat(i.value) || 0)

function refrescar() {
  const pcts = leerPcts()
  const suma = r2(pcts.reduce((s, p) => s + p, 0))
  const ok = suma === 100
  $('dTotal').textContent = `Total: ${suma}%`
  $('dTotal').className = ok ? 'good' : 'bad'
  const monto = parseFloat($('dMonto').value)
  const montos = ok && monto > 0 ? repartir(monto, pcts) : null
  document.querySelectorAll('#dList .dm').forEach((el, i) => (el.textContent = montos ? money(montos[i]) : '—'))
}

function ajustar() {
  const pcts = leerPcts()
  const suma = pcts.reduce((s, p) => s + p, 0)
  if (!suma) return
  const n = pcts.map((p) => r2((p * 100) / suma))
  n[n.indexOf(Math.max(...n))] = r2(n[n.indexOf(Math.max(...n))] + (100 - n.reduce((s, x) => s + x, 0)))
  document.querySelectorAll('#dList input').forEach((el, i) => (el.value = n[i]))
  refrescar()
}

function abrir() {
  const cuentas = ctx.cuentas()
  const conceptos = ctx.conceptos().filter((c) => c.tipo === 'ingreso' && c.activo)
  const pcts = pctsIniciales(cuentas)
  $('dConcepto').innerHTML = conceptos.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')
  $('dList').innerHTML = cuentas.map((a, i) => `
    <div class="drow"><span><b>${esc(a.nombre)}</b><small>${esc(a.tipo)}</small></span>
    <input type="number" step="0.01" min="0" max="100" inputmode="decimal" value="${pcts[i]}" aria-label="Porcentaje de ${esc(a.nombre)}">
    <span class="dm">—</span></div>`).join('')
  $('dFecha').value = hoy()
  $('dMonto').value = ''
  $('dNota').value = ''
  $('dGuardar').checked = false
  $('dErr').textContent = !conceptos.length
    ? 'Primero crea al menos un concepto de ingreso en Conceptos > De ingresos.'
    : !cuentas.length ? 'Primero crea tus cuentas en la pestaña Cuentas.' : ''
  refrescar()
  $('dlgD').showModal()
}

async function guardar() {
  const cuentas = ctx.cuentas()
  const pcts = leerPcts()
  const err = (m) => ($('dErr').textContent = m)
  const monto = parseFloat($('dMonto').value)
  const concepto_id = $('dConcepto').value
  const fecha = $('dFecha').value
  if (!concepto_id) return err('Selecciona un concepto de ingreso.')
  if (!fecha) return err('Indica la fecha del ingreso.')
  if (!(monto > 0)) return err('El monto global debe ser mayor que cero.')
  if (pcts.some((p) => p < 0 || p > 100)) return err('Cada porcentaje debe estar entre 0 y 100.')
  if (r2(pcts.reduce((s, p) => s + p, 0)) !== 100) return err('Los porcentajes deben sumar exactamente 100%. Puedes usar “Ajustar a 100%”.')

  const montos = repartir(monto, pcts)
  const grupo_id = crypto.randomUUID()
  const nota = $('dNota').value.trim() || null
  const filas = cuentas
    .map((a, i) => ({ cuenta_id: a.id, concepto_id, fecha, monto: montos[i], nota, grupo_id }))
    .filter((f) => f.monto > 0)

  $('dSave').disabled = true
  const { error } = await supabase.from('ingresos').insert(filas) // una sola operación: todo o nada
  if (error) {
    $('dSave').disabled = false
    return err(error.message)
  }
  if ($('dGuardar').checked) {
    const res = await Promise.all(cuentas.map((a, i) => supabase.from('cuentas').update({ porcentaje: pcts[i] }).eq('id', a.id)))
    if (res.some((r) => r.error)) alert('El ingreso se distribuyó, pero no se pudieron guardar los porcentajes por defecto.')
  }
  $('dSave').disabled = false
  $('dlgD').close()
  $('mesI').value = fecha.slice(0, 7)
  await Promise.all([ctx.recargarIngresos(), ctx.recargarCuentas()])
}

export function initDistribucion(c) {
  ctx = c
  $('newDistrib').onclick = abrir
  $('dCancel').onclick = () => $('dlgD').close()
  $('dSave').onclick = guardar
  $('dAjustar').onclick = ajustar
  $('dMonto').oninput = refrescar
  $('dList').oninput = refrescar
}
