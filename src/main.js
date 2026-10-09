import './style.css'
import { supabase } from './supabase.js'
import { initGastos, cargarConceptos, cargarGastos, getConceptos } from './gastos.js'
import { initIngresos, cargarIngresos } from './ingresos.js'
import { initDistribucion } from './distribucion.js'

const $ = (id) => document.getElementById(id)
const money = (n) => new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const MSG_CONFIRMAR = 'Te enviamos un correo para confirmar tu cuenta. Confírmalo y luego inicia sesión.'

let mode = 'login'
let cuentas = []
let usuarios = []
let editId = null
let perfil = null
let yo = null

const show = (name) => ['auth', 'pending', 'app'].forEach((id) => $(id).classList.toggle('hidden', id !== name))

// ---------- Autenticación ----------
function showAuthMsg(text, ok = false) {
  $('authErr').textContent = text
  $('authErr').classList.toggle('ok', ok)
}

function setMode(m) {
  mode = m
  const reg = m === 'register'
  $('authTitle').textContent = reg ? 'Solicitar acceso' : 'Iniciar sesión'
  $('authSub').textContent = reg
    ? 'Usa tu correo y una clave de al menos 6 caracteres. Un administrador debe aprobar tu acceso.'
    : 'Entra para ver y gestionar tus cuentas.'
  $('authBtn').textContent = reg ? 'Solicitar acceso' : 'Entrar'
  $('confirmBox').classList.toggle('hidden', !reg)
  $('toggleTxt').textContent = reg ? '¿Ya tienes usuario?' : '¿No tienes usuario?'
  $('toggleBtn').textContent = reg ? 'Iniciar sesión' : 'Solicitar acceso'
  $('pass').autocomplete = reg ? 'new-password' : 'current-password'
  showAuthMsg('')
}

async function submitAuth() {
  const email = $('email').value.trim()
  const password = $('pass').value
  if (!email || !password) return showAuthMsg('Escribe correo y clave.')
  if (mode === 'register') {
    if (password.length < 6) return showAuthMsg('La clave debe tener al menos 6 caracteres.')
    if (password !== $('pass2').value) return showAuthMsg('Las claves no coinciden.')
  }
  $('authBtn').disabled = true
  const { data, error } =
    mode === 'register'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
  $('authBtn').disabled = false
  if (error) {
    return showAuthMsg(error.message === 'Invalid login credentials' ? 'Correo o clave incorrectos.' : error.message)
  }
  if (mode === 'register' && !data.session) {
    setMode('login')
    showAuthMsg(MSG_CONFIRMAR, true)
  }
}

function showPending(title, msg) {
  $('pendTitle').textContent = title
  $('pendMsg').textContent = msg
  $('pendEmail').textContent = yo ? 'Cuenta: ' + yo.email : ''
  show('pending')
}

async function onSession(session) {
  if (!session) {
    perfil = yo = null
    cuentas = usuarios = []
    show('auth')
    setMode('login')
    return
  }
  yo = session.user
  $('email').value = $('pass').value = $('pass2').value = ''
  const { data, error } = await supabase.from('perfiles').select('*').eq('id', yo.id).maybeSingle()
  perfil = data
  if (error || !perfil) return showPending('No pudimos verificar tu acceso', 'Intenta de nuevo en unos segundos o contacta al administrador.')
  if (perfil.estado === 'pendiente')
    return showPending('Solicitud en revisión', 'Tu cuenta fue creada y está pendiente de aprobación por un administrador. Vuelve más tarde.')
  if (perfil.estado !== 'aprobado')
    return showPending('Acceso deshabilitado', 'Tu acceso está deshabilitado. Contacta al administrador.')

  const admin = perfil.rol === 'admin'
  $('who').textContent = 'Sesión de ' + yo.email + (admin ? ' · Administrador' : '')
  $('tabUsuarios').classList.toggle('hidden', !admin)
  show('app')
  setTab('gastos')
  await cargarCuentas()
  await Promise.all([cargarConceptos(), cargarGastos(), cargarIngresos()])
  if (admin) await cargarUsuarios()
}

function setTab(t) {
  ;['gastos', 'ingresos', 'cuentas', 'conceptos', 'usuarios'].forEach((n) => {
    const N = n[0].toUpperCase() + n.slice(1)
    $('view' + N).classList.toggle('hidden', t !== n)
    $('tab' + N).classList.toggle('active', t === n)
  })
}

// ---------- Administración de usuarios ----------
async function cargarUsuarios() {
  const { data, error } = await supabase.from('perfiles').select('*').order('created_at', { ascending: false })
  if (error) {
    $('usersList').innerHTML = `<li class="empty">No se pudieron cargar los usuarios: ${esc(error.message)}</li>`
    return
  }
  usuarios = data
  const pend = usuarios.filter((u) => u.estado === 'pendiente').length
  $('pendCount').textContent = pend
  $('pendCount').classList.toggle('hidden', pend === 0)
  $('usersList').innerHTML = usuarios.map((u) => {
    const btn = (estado, txt, cls = '') => `<button class="btn ${cls} sm" data-uid="${u.id}" data-estado="${estado}">${txt}</button>`
    let acts = ''
    if (u.id === yo.id) acts = '<small>Tú</small>'
    else if (u.estado === 'pendiente') acts = btn('aprobado', 'Aprobar') + btn('deshabilitado', 'Rechazar', 'danger')
    else if (u.estado === 'aprobado') acts = btn('deshabilitado', 'Deshabilitar', 'danger')
    else acts = btn('aprobado', 'Habilitar')
    return `<li class="row"><div><b>${esc(u.email)}</b>
      <small>${u.rol === 'admin' ? 'Administrador' : 'Usuario'} · ${new Date(u.created_at).toLocaleDateString('es')}</small>
      <span class="pill ${u.estado}">${u.estado}</span></div><div class="acts">${acts}</div></li>`
  }).join('')
}

async function cambiarEstado(uid, estado) {
  const { error } = await supabase.from('perfiles').update({ estado }).eq('id', uid)
  if (error) return alert('No se pudo actualizar: ' + error.message)
  await cargarUsuarios()
}

// ---------- Mantenimiento de cuentas ----------
async function cargarCuentas() {
  const { data, error } = await supabase.from('cuentas_con_saldo').select('*').order('created_at')
  if (error) {
    $('list').innerHTML = `<li class="empty">No se pudieron cargar las cuentas: ${esc(error.message)}</li>`
    return
  }
  cuentas = data
  render()
}

function render() {
  $('total').textContent = money(cuentas.reduce((s, a) => s + Number(a.saldo), 0))
  $('list').innerHTML = cuentas.length
    ? cuentas.map((a) => `
      <li class="row"><div><b>${esc(a.nombre)}</b><small>${esc(a.tipo)} · Inicial ${money(Number(a.saldo_inicial))}</small></div>
      <div class="acts"><span class="bal">${money(Number(a.saldo))}</span>
      <button class="btn ghost sm" data-edit="${a.id}">Editar</button>
      <button class="btn danger sm" data-del="${a.id}">Eliminar</button></div></li>`).join('')
    : '<li class="empty">Aún no tienes cuentas. Crea la primera, por ejemplo “Cuenta de Ahorro”.</li>'
}

function openDlg(id) {
  editId = id || null
  const a = cuentas.find((x) => x.id === id)
  $('dlgTitle').textContent = a ? 'Editar cuenta' : 'Nueva cuenta'
  $('aName').value = a ? a.nombre : ''
  $('aType').value = a ? a.tipo : 'Ahorro'
  $('aBal').value = a ? a.saldo_inicial : 0
  $('dlgErr').textContent = ''
  $('dlg').showModal()
  $('aName').focus()
}

async function saveAcc() {
  const nombre = $('aName').value.trim()
  const saldo_inicial = parseFloat($('aBal').value)
  if (!nombre) return ($('dlgErr').textContent = 'Escribe un nombre para la cuenta.')
  if (Number.isNaN(saldo_inicial)) return ($('dlgErr').textContent = 'El saldo inicial debe ser un número.')
  const fila = { nombre, tipo: $('aType').value, saldo_inicial }
  $('dlgSave').disabled = true
  const { error } = editId
    ? await supabase.from('cuentas').update(fila).eq('id', editId)
    : await supabase.from('cuentas').insert(fila)
  $('dlgSave').disabled = false
  if (error) {
    $('dlgErr').textContent = error.code === '23505' ? 'Ya existe una cuenta con ese nombre.' : error.message
    return
  }
  $('dlg').close()
  await cargarCuentas()
}

async function deleteAcc(id) {
  const a = cuentas.find((x) => x.id === id)
  if (!a || !confirm(`¿Eliminar la cuenta “${a.nombre}”?`)) return
  const { error } = await supabase.from('cuentas').delete().eq('id', id)
  if (error) {
    return alert(error.code === '23503'
      ? 'Esta cuenta tiene movimientos (gastos o ingresos) registrados y no se puede eliminar.'
      : 'No se pudo eliminar: ' + error.message)
  }
  await cargarCuentas()
}

// ---------- Eventos ----------
$('authBtn').onclick = submitAuth
$('authForm').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth() })
$('toggleBtn').onclick = () => setMode(mode === 'login' ? 'register' : 'login')
$('logout').onclick = () => supabase.auth.signOut()
$('pendLogout').onclick = () => supabase.auth.signOut()
$('recheck').onclick = async () => {
  const { data } = await supabase.auth.getSession()
  onSession(data.session)
}
document.querySelectorAll('.tab[data-tab]').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)))
$('newAcc').onclick = () => openDlg()
$('dlgCancel').onclick = () => $('dlg').close()
$('dlgSave').onclick = saveAcc
$('list').onclick = (e) => {
  if (e.target.dataset.edit) openDlg(e.target.dataset.edit)
  if (e.target.dataset.del) deleteAcc(e.target.dataset.del)
}
$('usersList').onclick = (e) => {
  const { uid, estado } = e.target.dataset
  if (uid && estado) cambiarEstado(uid, estado)
}

initGastos({ cuentas: () => cuentas, recargarCuentas: cargarCuentas, recargarIngresos: cargarIngresos })
initIngresos({ cuentas: () => cuentas, conceptos: getConceptos, recargarCuentas: cargarCuentas })
initDistribucion({ cuentas: () => cuentas, conceptos: getConceptos, recargarCuentas: cargarCuentas, recargarIngresos: cargarIngresos })

supabase.auth.onAuthStateChange((_evt, session) => {
  if (session && yo && session.user.id === yo.id) return // evita recargar en renovaciones de token
  setTimeout(() => onSession(session), 0) // evita bloqueos de supabase-js dentro del callback
})
